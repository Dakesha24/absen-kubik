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
const [routeSource, timeSource, httpSource] = await Promise.all([compile("app/api/tutor/meetings/route.ts"), compile("lib/time.ts"), compile("lib/http.ts")]);
const http = {};
runInNewContext(httpSource, { exports: http, Response });
const classId = "f93b2c79-b257-4f95-8ed1-62bd93f17525";
const userId = "f93b2c79-b257-4f95-8ed1-62bd93f17524";
function moduleFor({ now = "2026-11-04T18:30:00Z", weekday = 4, forbidden = false, missing = false, existing = false, classes = [] } = {}) {
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
  }
  const time = {};
  runInNewContext(timeSource, { exports: time, Date: ClockDate, Intl });
  const exports = {}, calls = [];
  runInNewContext(routeSource, { exports, Request, Response, require(name) {
    if (name === "@/lib/http") return http;
    if (name === "@/lib/time") return time;
    if (name === "@/lib/auth") return { requireRole: async (role) => {
      assert.equal(role, "tutor");
      return { user: { id: userId }, response: forbidden ? Response.json({}, { status: 403 }) : null };
    } };
    if (name === "@/lib/db") return { db: () => async (strings, ...values) => {
      const text = strings.join("?");
      calls.push({ text, values });
      if (text.includes("SELECT c.id, sch.weekday")) return missing ? [] : [{ id: classId, weekday }];
      if (text.includes("ORDER BY CASE")) return existing ? [{ id: userId, class_id: classId, meeting_date: time.jakartaCalendar().date }] : [];
      if (text.includes("MAX(meeting_number)")) return [{ meeting_number: 3 }];
      if (text.includes("INSERT INTO meetings")) return [{ id: userId, class_id: classId }];
      if (text.includes("SELECT c.id, c.name")) return classes;
      return [];
    } };
    throw new Error("Unexpected import " + name);
  } });
  return { ...exports, calls, calendar: time.jakartaCalendar };
}
function request(id = classId) {
  return new Request("http://localhost/api/tutor/meetings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ classId: id }) });
}
test("Jakarta's date and weekday change at local midnight, not UTC midnight", () => {
  const module = moduleFor();
  const before = module.calendar(new Date("2026-11-04T16:59:59Z"));
  const after = module.calendar(new Date("2026-11-04T17:00:00Z"));
  assert.equal(before.date, "2026-11-04");
  assert.equal(before.weekday, 3);
  assert.equal(after.date, "2026-11-05");
  assert.equal(after.weekday, 4);
});
test("only tutors may list or start their classes", async () => {
  const module = moduleFor({ forbidden: true });
  assert.equal((await module.GET()).status, 403);
  assert.equal((await module.POST(request())).status, 403);
  assert.equal(module.calls.length, 0);
});
test("another weekday cannot be opened using a stale dropdown or direct API call", async () => {
  const module = moduleFor({ weekday: 3 });
  assert.equal((await module.POST(request())).status, 409);
  assert.equal(module.calls.length, 1);
});
test("today's class creates a meeting using the Jakarta date and scheduled start time", async () => {
  const module = moduleFor({ weekday: 4 });
  const response = await module.POST(request());
  assert.equal(response.status, 201);
  assert.equal((await response.json()).created, true);
  const insert = module.calls.find((call) => call.text.includes("INSERT INTO meetings"));
  assert.ok(insert.values.includes("2026-11-05"));
  assert.ok(insert.values.includes(4));
  assert.ok(insert.values.includes(userId));
  assert.match(insert.text, /AT TIME ZONE 'Asia\/Jakarta'/);
});
test("an unscheduled class remains available on any day", async () => {
  for (const now of ["2026-11-04T18:30:00Z", "2026-11-07T18:30:00Z"]) {
    const module = moduleFor({ weekday: null, now });
    assert.equal((await module.POST(request())).status, 201);
  }
});
test("Sunday is matched as weekday zero", async () => {
  const sunday = "2026-11-07T18:30:00Z";
  assert.equal((await moduleFor({ now: sunday, weekday: 0 }).POST(request())).status, 201);
  assert.equal((await moduleFor({ now: sunday, weekday: 6 }).POST(request())).status, 409);
});
test("today's existing meeting is reused instead of duplicated", async () => {
  const module = moduleFor({ existing: true });
  const response = await module.POST(request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).created, false);
  assert.ok(!module.calls.some((call) => call.text.includes("INSERT INTO meetings")));
});
test("the class listing returns time ranges and a Jakarta calendar context", async () => {
  const classes = [{ id: classId, name: "Kelas Pagi", weekday: 4, start_time: "08:00:00", end_time: "09:00:00" }];
  const module = moduleFor({ classes });
  const response = await module.GET();
  const body = await response.json();
  assert.equal(body.date, "2026-11-05");
  assert.equal(body.weekday, 4);
  assert.equal(body.classes[0].start_time, "08:00:00");
  assert.equal(body.classes[0].end_time, "09:00:00");
  const query = module.calls.find((call) => call.text.includes("SELECT c.id, c.name"));
  assert.ok(query.values.includes(4));
  assert.match(query.text, /sch.class_id IS NULL OR sch.weekday/);
  assert.match(query.text, /ORDER BY sch.start_time ASC NULLS LAST/);
});
test("an empty day returns a usable empty list instead of an API error", async () => {
  const module = moduleFor();
  const response = await module.GET();
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).classes, []);
});
test("invalid or unavailable classes cannot create meetings", async () => {
  const invalid = moduleFor();
  assert.equal((await invalid.POST(request("invalid"))).status, 400);
  assert.equal(invalid.calls.length, 0);
  const missing = moduleFor({ missing: true });
  assert.equal((await missing.POST(request())).status, 404);
});
