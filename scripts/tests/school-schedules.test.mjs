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
const sources = await Promise.all([
  compile("app/api/admin/school-schedules/route.ts"),
  compile("app/api/admin/school-schedules/students/route.ts"),
  compile("lib/http.ts"), compile("lib/time.ts"),
]);
function evaluate(source, require = () => { throw new Error("Unexpected import"); }) {
  const exports = {};
  runInNewContext(source, { exports, require, Request, Response, URL, TextEncoder, Intl, Date });
  return exports;
}
const http = evaluate(sources[2]), time = evaluate(sources[3]);
const classId = "f93b2c79-b257-4f95-8ed1-62bd93f17525";
const valid = { classId, weekday: 1, startTime: "09:15", endTime: "10:15" };
function route(index, { forbidden = false, conflict = false, rowCount = 1 } = {}) {
  const calls = [];
  const sql = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    if (/INSERT/.test(text) && conflict) throw { code: "23505" };
    return Array.from({ length: rowCount }, () => ({ id: classId }));
  };
  const module = evaluate(sources[index], (name) => {
    if (name === "@/lib/http") return http;
    if (name === "@/lib/time") return time;
    if (name === "@/lib/db") return { db: () => sql };
    if (name === "@/lib/auth") return { requireRole: async (role) => {
      assert.equal(role, "admin");
      return { response: forbidden ? Response.json({ error: "Forbidden" }, { status: 403 }) : null };
    } };
    throw new Error("Unexpected import: " + name);
  });
  return { ...module, calls };
}
function request(body, method = "POST") {
  return new Request("http://localhost/api/admin/school-schedules", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
test("schedule and roster endpoints reject non-admins before database access", async () => {
  for (const index of [0, 1]) {
    const module = route(index, { forbidden: true });
    assert.equal((await module.POST(request(valid))).status, 403);
    if (module.PATCH) assert.equal((await module.PATCH(request({}, "PATCH"))).status, 403);
    if (module.DELETE) assert.equal((await module.DELETE(request({}, "DELETE"))).status, 403);
    if (module.GET) assert.equal((await module.GET(new Request("http://localhost/?classId=" + classId))).status, 403);
    assert.equal(module.calls.length, 0);
  }
});
test("invalid weekdays and time ranges cannot create schedules", async () => {
  for (const changes of [{ weekday: "" }, { weekday: "  " }, { weekday: null }, { weekday: -1 }, { weekday: 7 }, { weekday: 1.5 }, { startTime: "24:00" }, { endTime: "08:00" }]) {
    const module = route(0);
    assert.equal((await module.POST(request({ ...valid, ...changes }))).status, 400);
    assert.equal(module.calls.length, 0);
  }
});
test("new school requires both coordinates and a valid radius", async () => {
  for (const changes of [{ latitude: -6.9 }, { radiusM: 1 }, { longitude: "invalid" }]) {
    const module = route(0);
    const response = await module.POST(request({ ...valid, classId: "", schoolName: "Sekolah", className: "Kelas", address: "Alamat", ...changes }));
    assert.equal(response.status, 400);
    assert.ok(module.calls.every((call) => !/INSERT/.test(call.text)));
  }
});
test("weekly schedule needs neither a date nor a tutor and does not create meetings", async () => {
  const module = route(0);
  assert.equal((await module.POST(request(valid))).status, 201);
  assert.equal(module.calls.length, 1);
  assert.match(module.calls[0].text, /INSERT INTO class_schedules/);
  assert.doesNotMatch(module.calls[0].text, /INSERT INTO meetings|app_users/);
  assert.ok(module.calls[0].values.includes("09:15"));
  assert.ok(module.calls[0].values.includes(1));
});
test("Sunday is accepted and the end time may be omitted", async () => {
  const module = route(0);
  assert.equal((await module.POST(request({ ...valid, weekday: 0, endTime: "" }))).status, 201);
  assert.ok(module.calls[0].values.includes(0));
  assert.ok(module.calls[0].values.includes(null));
});
test("new class and its weekly schedule are saved in one statement without meetings", async () => {
  const module = route(0);
  assert.equal((await module.POST(request({ ...valid, classId: "", schoolName: "Sekolah", className: "Kelas", address: "Alamat" }))).status, 201);
  assert.equal(module.calls.length, 1);
  assert.match(module.calls[0].text, /INSERT INTO classes/);
  assert.match(module.calls[0].text, /INSERT INTO class_schedules/);
  assert.doesNotMatch(module.calls[0].text, /INSERT INTO meetings/);
});
test("duplicate class returns a recoverable conflict", async () => {
  const module = route(0, { conflict: true });
  assert.equal((await module.POST(request(valid))).status, 409);
});
test("editing text identity keeps the class ID and saves the schedule atomically", async () => {
  const module = route(0);
  const response = await module.POST(request({
    ...valid, schoolName: "Sekolah Lama", className: "Kelas Baru", address: "Alamat",
    latitude: -6.9, longitude: 107.6, radiusM: 100, notes: "Catatan",
  }));
  assert.equal(response.status, 201);
  assert.equal(module.calls.length, 1);
  assert.match(module.calls[0].text, /UPDATE classes/);
  assert.match(module.calls[0].text, /INSERT INTO class_schedules/);
  assert.doesNotMatch(module.calls[0].text, /INSERT INTO classes|INSERT INTO meetings/);
  assert.ok(module.calls[0].values.includes(classId));
  assert.ok(module.calls[0].values.includes("Sekolah Lama — Kelas Baru"));
  assert.ok(module.calls[0].values.includes(-6.9));
  assert.ok(module.calls[0].values.includes(100));
});
test("incomplete text identity cannot partially update an existing class", async () => {
  for (const changes of [{ schoolName: "" }, { className: " " }, { address: "" }]) {
    const module = route(0);
    const response = await module.POST(request({ ...valid, schoolName: "Sekolah", className: "Kelas", address: "Alamat", ...changes }));
    assert.equal(response.status, 400);
    assert.equal(module.calls.length, 0);
  }
});
test("new student and class membership are created together in one statement", async () => {
  const module = route(1);
  assert.equal((await module.POST(request({ classId, name: "Siswa Baru" }))).status, 201);
  assert.equal(module.calls.length, 1);
  assert.match(module.calls[0].text, /INSERT INTO students/);
  assert.match(module.calls[0].text, /INSERT INTO class_students/);
});
test("invalid roster input cannot create orphan students", async () => {
  for (const body of [{ classId: "invalid", name: "Siswa" }, { classId, name: "   " }, { classId, studentId: classId }]) {
    const module = route(1);
    assert.equal((await module.POST(request(body))).status, 400);
    assert.equal(module.calls.length, 0);
  }
});
test("class roster does not return a global student dropdown", async () => {
  const module = route(1);
  const response = await module.GET(new Request("http://localhost/?classId=" + classId));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(Array.isArray(body.members));
  assert.equal(body.students, undefined);
  assert.equal(module.calls.length, 1);
  assert.ok(module.calls[0].values.includes(classId));
});
test("multiple students and memberships are saved together with the correct count", async () => {
  const module = route(1, { rowCount: 3 });
  const response = await module.POST(request({ classId, students: [
    { name: "  Siswa Satu  ", phone: "" }, { name: "Siswa Dua", phone: " 08123 " }, { name: "Siswa Tiga" },
  ] }));
  assert.equal(response.status, 201);
  assert.equal((await response.json()).savedCount, 3);
  assert.equal(module.calls.length, 1);
  const payload = module.calls[0].values.find((value) => typeof value === "string" && value.startsWith("["));
  assert.deepEqual(JSON.parse(payload), [
    { name: "Siswa Satu", phone: null }, { name: "Siswa Dua", phone: "08123" }, { name: "Siswa Tiga", phone: null },
  ]);
});
test("one invalid student rejects the entire batch before any write", async () => {
  for (const invalid of [{ name: " " }, null, { name: 12 }, { name: "a".repeat(121) }, { name: "Siswa", phone: 123 }, { name: "Siswa", phone: "1".repeat(41) }]) {
    const module = route(1);
    assert.equal((await module.POST(request({ classId, students: [{ name: "Valid" }, invalid] }))).status, 400);
    assert.equal(module.calls.length, 0);
  }
});
test("batch size must be between one and one hundred", async () => {
  for (const students of [[], null, "invalid", Array.from({ length: 101 }, () => ({ name: "Siswa" }))]) {
    const module = route(1);
    assert.equal((await module.POST(request({ classId, students }))).status, 400);
    assert.equal(module.calls.length, 0);
  }
  const module = route(1, { rowCount: 100 });
  const response = await module.POST(request({ classId, students: Array.from({ length: 100 }, (_, index) => ({ name: "Siswa " + (index + 1) })) }));
  assert.equal(response.status, 201);
  assert.equal((await response.json()).savedCount, 100);
});
test("an inactive or missing class does not create any student batch", async () => {
  const module = route(1, { rowCount: 0 });
  assert.equal((await module.POST(request({ classId, students: [{ name: "Siswa" }] }))).status, 400);
  assert.equal(module.calls.length, 1);
});
test("class deletion requires the exact typed confirmation before any write", async () => {
  for (const confirmation of [undefined, "", "Delete", " delete ", true]) {
    const module = route(0);
    assert.equal((await module.DELETE(request({ classId, confirmation }, "DELETE"))).status, 400);
    assert.equal(module.calls.length, 0);
  }
  const module = route(0);
  assert.equal((await module.DELETE(request({ classId: "invalid", confirmation: "delete" }, "DELETE"))).status, 400);
  assert.equal(module.calls.length, 0);
});
test("deleting a class removes it from active schedules without deleting historical records", async () => {
  const module = route(0);
  const response = await module.DELETE(request({ classId, confirmation: "delete" }, "DELETE"));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).deleted, true);
  assert.equal(module.calls.length, 1);
  assert.match(module.calls[0].text, /UPDATE classes SET active = FALSE/);
  assert.doesNotMatch(module.calls[0].text, /DELETE FROM|attendance_records|evidence_files/);
  assert.ok(module.calls[0].values.includes(classId));
});
test("deleting an unknown or already removed class returns not found", async () => {
  const module = route(0, { rowCount: 0 });
  assert.equal((await module.DELETE(request({ classId, confirmation: "delete" }, "DELETE"))).status, 404);
});
test("student edits require a valid identity and active membership of the selected class", async () => {
  const studentId = "f93b2c79-b257-4f95-8ed1-62bd93f17526";
  const module = route(1);
  assert.equal((await module.PATCH(request({ classId, studentId, name: "Nama Baru", phone: "08123" }, "PATCH"))).status, 200);
  assert.equal(module.calls.length, 1);
  assert.match(module.calls[0].text, /UPDATE students/);
  assert.match(module.calls[0].text, /cs.active = TRUE AND c.active = TRUE/);
  assert.ok(module.calls[0].values.includes(classId));
  assert.ok(module.calls[0].values.includes(studentId));
  const outside = route(1, { rowCount: 0 });
  assert.equal((await outside.PATCH(request({ classId, studentId, name: "Nama Baru" }, "PATCH"))).status, 404);
});
test("invalid student edit data is rejected before any write", async () => {
  for (const changes of [{ studentId: "invalid" }, { name: " " }, { name: "a".repeat(121) }, { phone: 123 }, { phone: "1".repeat(41) }]) {
    const module = route(1);
    assert.equal((await module.PATCH(request({ classId, studentId: classId, name: "Siswa", ...changes }, "PATCH"))).status, 400);
    assert.equal(module.calls.length, 0);
  }
});
test("student removal requires confirmation without requiring a typed delete", async () => {
  for (const confirmed of [undefined, false, "true"]) {
    const module = route(1);
    assert.equal((await module.DELETE(request({ classId, studentId: classId, confirmed }, "DELETE"))).status, 400);
    assert.equal(module.calls.length, 0);
  }
  const module = route(1);
  assert.equal((await module.DELETE(request({ classId, studentId: classId, confirmed: true }, "DELETE"))).status, 200);
  assert.equal(module.calls.length, 1);
  assert.match(module.calls[0].text, /UPDATE class_students cs SET active = FALSE/);
  assert.doesNotMatch(module.calls[0].text, /UPDATE students|DELETE FROM|attendance_records/);
  const missing = route(1, { rowCount: 0 });
  assert.equal((await missing.DELETE(request({ classId, studentId: classId, confirmed: true }, "DELETE"))).status, 404);
});
