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
const [selectSource, loginSource, httpSource] = await Promise.all([
  compile("app/api/auth/select-tutor/route.ts"), compile("app/api/auth/login/route.ts"), compile("lib/http.ts"),
]);
const http = {};
runInNewContext(httpSource, { exports: http, Response });
const tutor = { id: "f93b2c79-b257-4f95-8ed1-62bd93f17524", name: "Tutor", email: "tutor@example.test", role: "tutor", active: true, password_hash: "stored-hash", tutor_password_set: true };
function moduleFor(source, rows) {
  const exports = {}, sessions = [];
  runInNewContext(source, { exports, Response, Request, TextEncoder, require(name) {
    if (name === "@/lib/http") return http;
    if (name === "@/lib/db") return { db: () => async () => rows };
    if (name === "@/lib/auth") return { createSession: async (user) => sessions.push(user) };
    if (name === "bcryptjs") return { compare: async (password) => password === "correct-password" };
    throw new Error("Unexpected import " + name);
  } });
  return { ...exports, sessions };
}
function request(body) {
  return new Request("http://localhost/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
test("a stale tutor dropdown cannot create a session for an inactive tutor", async () => {
  for (const tutor_password_set of [true, false]) {
    const module = moduleFor(selectSource, [{ ...tutor, active: false, tutor_password_set }]);
    const response = await module.POST(request({ tutorId: tutor.id, password: "correct-password" }));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, "ACCOUNT_DISABLED");
    assert.equal(module.sessions.length, 0);
  }
});
test("active demo tutors can still log in without a configured password", async () => {
  const module = moduleFor(selectSource, [{ ...tutor, password_hash: null, tutor_password_set: false }]);
  assert.equal((await module.POST(request({ tutorId: tutor.id }))).status, 200);
  assert.equal(module.sessions.length, 1);
});
test("password-protected tutors still need the right password", async () => {
  for (const password of ["", "wrong-password"]) {
    const module = moduleFor(selectSource, [tutor]);
    assert.equal((await module.POST(request({ tutorId: tutor.id, password }))).status, 401);
    assert.equal(module.sessions.length, 0);
  }
});
test("email login cannot bypass account deactivation", async () => {
  const module = moduleFor(loginSource, [{ ...tutor, active: false }]);
  const response = await module.POST(request({ email: tutor.email, password: "correct-password" }));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "Akun Anda dinonaktifkan. Hubungi admin.");
  assert.equal(module.sessions.length, 0);
});
test("an incorrect email password does not reveal account status", async () => {
  const module = moduleFor(loginSource, [{ ...tutor, active: false }]);
  assert.equal((await module.POST(request({ email: tutor.email, password: "wrong-password" }))).status, 401);
  assert.equal(module.sessions.length, 0);
});
test("valid credentials still create sessions for active tutors and admins", async () => {
  for (const role of ["tutor", "admin"]) {
    const module = moduleFor(loginSource, [{ ...tutor, role }]);
    assert.equal((await module.POST(request({ email: tutor.email, password: "correct-password" }))).status, 200);
    assert.equal(module.sessions[0].role, role);
  }
});
