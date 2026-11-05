import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

async function compile(path) {
  return ts.transpileModule(await readFile(new URL("../../" + path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}
const [source, httpSource, detailSource] = await Promise.all([compile("app/api/meetings/[id]/complete/route.ts"), compile("lib/http.ts"), compile("app/api/meetings/[id]/route.ts")]);
const http = {};
runInNewContext(httpSource, { exports: http, Response });
const meetingId = "f93b2c79-b257-4f95-8ed1-62bd93f17520";
const studentId = "f93b2c79-b257-4f95-8ed1-62bd93f17525";
const records = [{ studentId, status: "present", reason: "Harus dikosongkan untuk hadir" }];
function moduleFor({ forbidden = false, status = "scheduled", missing = false, blocked = false, failed = false } = {}) {
  const exports = {}, calls = [];
  runInNewContext(source, {
    exports, Request, Response,
    require(name) {
      if (name === "@/lib/http") return http;
      if (name === "@/lib/auth") return { requireRole: async (role) => {
        assert.equal(role, "tutor");
        return { user: { id: studentId, role: "tutor" }, response: forbidden ? Response.json({}, { status: 403 }) : null };
      } };
      if (name === "@/lib/meeting-access") return { accessibleMeeting: async () => missing ? undefined : { id: meetingId, status, class_id: studentId } };
      if (name === "@/lib/db") return { db: () => async (strings, ...values) => {
        calls.push({ text: strings.join("?"), values });
        if (failed) throw new Error("Simulated write failure");
        return blocked ? [] : [{ id: meetingId, status: "completed" }];
      } };
      throw new Error("Unexpected import: " + name);
    },
  });
  return { ...exports, calls };
}
async function save(module, body = { records }) {
  return module.POST(new Request("http://localhost/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: meetingId }) });
}
test("only an authorized tutor can submit their meeting", async () => {
  for (const options of [{ forbidden: true }, { missing: true }]) {
    const module = moduleFor(options);
    assert.equal((await save(module)).status, options.forbidden ? 403 : 404);
    assert.equal(module.calls.length, 0);
  }
});
test("cancelled meetings and incomplete or duplicated student records cannot be finalized", async () => {
  const cancelled = moduleFor({ status: "cancelled" });
  assert.equal((await save(cancelled)).status, 409);
  assert.equal(cancelled.calls.length, 0);
  for (const body of [{}, { records: null }, { records: [records[0], records[0]] }, { records: [{ studentId, status: "invalid" }] }]) {
    const module = moduleFor();
    assert.equal((await save(module, body)).status, 400);
    assert.equal(module.calls.length, 0);
  }
});
test("attendance and final status are saved in a single atomic statement", async () => {
  const module = moduleFor();
  const response = await save(module);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).meeting.status, "completed");
  assert.equal(module.calls.length, 1);
  assert.match(module.calls[0].text, /INSERT INTO attendance_records/);
  assert.match(module.calls[0].text, /UPDATE meetings m SET status = 'completed'/);
  const payload = module.calls[0].values.find((value) => typeof value === "string" && value.startsWith("["));
  assert.deepEqual(JSON.parse(payload), [{ student_id: studentId, status: "present", reason: null }]);
});
test("missing check-in, evidence, or an outdated roster prevents publication", async () => {
  const module = moduleFor({ blocked: true });
  assert.equal((await save(module)).status, 409);
  assert.equal(module.calls.length, 1);
  assert.match(module.calls[0].text, /EXISTS \(SELECT 1 FROM tutor_checkins/);
  assert.match(module.calls[0].text, /EXISTS \(SELECT 1 FROM evidence_files/);
  assert.match(module.calls[0].text, /cs.active = TRUE AND s.active = TRUE/);
});
test("a write failure cannot trigger a separate completion update", async () => {
  const module = moduleFor({ failed: true });
  assert.equal((await save(module)).status, 500);
  assert.equal(module.calls.length, 1);
});
test("retrying a successful submission preserves the finalized record", async () => {
  const module = moduleFor({ status: "completed" });
  assert.equal((await save(module)).status, 200);
  assert.equal(module.calls.length, 0);
});
test("a class with no students can save location and documentation without attendance rows", async () => {
  const module = moduleFor();
  const response = await save(module, { records: [] });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).meeting.status, "completed");
  assert.equal(module.calls.length, 1);
  assert.ok(module.calls[0].values.includes("[]"));
  assert.ok(module.calls[0].values.includes(0));
  assert.match(module.calls[0].text, /EXISTS \(SELECT 1 FROM tutor_checkins/);
  assert.match(module.calls[0].text, /EXISTS \(SELECT 1 FROM evidence_files/);
});
test("an empty submission cannot bypass an existing roster or missing prerequisites", async () => {
  const module = moduleFor({ blocked: true });
  assert.equal((await save(module, { records: [] })).status, 409);
  assert.equal(module.calls.length, 1);
  assert.match(module.calls[0].text, /SELECT COUNT\(\*\) FROM class_students/);
});
test("obsolete draft student records are pruned only within the current unfinished meeting", async () => {
  const module = moduleFor();
  await save(module, { records: [] });
  assert.match(module.calls[0].text, /DELETE FROM attendance_records ar USING target/);
  assert.match(module.calls[0].text, /ar.meeting_id = target.id AND NOT EXISTS/);
  assert.match(module.calls[0].text, /m.status = 'scheduled'/);
});
function detailModule(role, status) {
  const exports = {}, calls = [];
  runInNewContext(detailSource, { exports, Response, require(name) {
    if (name === "@/lib/http") return http;
    if (name === "@/lib/auth") return { requireRole: async () => ({ user: { id: studentId, role }, response: null }) };
    if (name === "@/lib/meeting-access") return { accessibleMeeting: async () => ({ id: meetingId, class_id: studentId, status }) };
    if (name === "@/lib/db") return { db: () => async (strings) => {
      const query = strings.join("?");
      calls.push(query);
      if (query.includes("COUNT(*)")) return [{ count: 1 }];
      if (query.includes("FROM attendance_records ar")) return [{ id: studentId, name: "Siswa saat presensi disimpan", status: "sick", reason: "Sakit" }];
      return [];
    } };
    throw new Error("Unexpected import " + name);
  } });
  return { ...exports, calls };
}
test("admin cannot view an unfinished check-in through a direct report URL", async () => {
  const module = detailModule("admin", "scheduled");
  const response = await module.GET(new Request("http://localhost/meeting"), { params: Promise.resolve({ id: meetingId }) });
  assert.equal(response.status, 404);
  assert.equal(module.calls.length, 0);
});
test("a finalized report reads saved students instead of today's class roster", async () => {
  const module = detailModule("admin", "completed");
  const response = await module.GET(new Request("http://localhost/meeting"), { params: Promise.resolve({ id: meetingId }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.students.length, 1);
  assert.equal(body.students[0].status, "sick");
  assert.equal(body.attendanceSaved, true);
  assert.ok(!module.calls.some((query) => query.includes("COALESCE(ar.status")));
});
