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
const [source, httpSource] = await Promise.all([compile("app/api/tutor/password/route.ts"), compile("lib/http.ts")]);
const http = {};
runInNewContext(httpSource, { exports: http, Response });
const id = "f93b2c79-b257-4f95-8ed1-62bd93f17524";
const valid = { currentPassword: "current-password", newPassword: "new-password-value", confirmPassword: "new-password-value" };
function moduleFor({ forbidden = false, firstPassword = false, inactiveDuringSave = false, failed = false } = {}) {
  const exports = {}, calls = [], hashes = [];
  runInNewContext(source, { exports, Request, Response, TextEncoder, require(name) {
    if (name === "@/lib/http") return http;
    if (name === "@/lib/auth") return { requireRole: async (role) => {
      assert.equal(role, "tutor");
      return { user: { id }, response: forbidden ? Response.json({}, { status: 403 }) : null };
    } };
    if (name === "bcryptjs") return {
      compare: async (password) => password === valid.currentPassword,
      hash: async (password, rounds) => { hashes.push({ password, rounds }); return "HASHED_VALUE"; },
    };
    if (name === "@/lib/db") return { db: () => async (strings, ...values) => {
      const text = strings.join("?");
      calls.push({ text, values });
      if (text.includes("UPDATE app_users")) {
        if (failed) throw new Error("Simulated database failure");
        return inactiveDuringSave ? [] : [{ id }];
      }
      return [{ password_hash: firstPassword ? null : "EXISTING_HASH", tutor_password_set: !firstPassword }];
    } };
    throw new Error("Unexpected import " + name);
  } });
  return { ...exports, calls, hashes };
}
function request(body = valid) {
  return new Request("http://localhost/api/tutor/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
test("password changes require an authorized tutor", async () => {
  const module = moduleFor({ forbidden: true });
  assert.equal((await module.POST(request())).status, 403);
  assert.equal(module.calls.length, 0);
  assert.equal(module.hashes.length, 0);
});
test("invalid new passwords are rejected before database writes", async () => {
  for (const changes of [
    { newPassword: "short", confirmPassword: "short" },
    { confirmPassword: "different-password" },
    { newPassword: valid.currentPassword, confirmPassword: valid.currentPassword },
    { newPassword: "😀".repeat(40), confirmPassword: "😀".repeat(40) },
  ]) {
    const module = moduleFor();
    assert.equal((await module.POST(request({ ...valid, ...changes }))).status, 400);
    assert.equal(module.calls.length, 0);
    assert.equal(module.hashes.length, 0);
  }
});
test("an incorrect current password cannot change the account", async () => {
  const module = moduleFor();
  assert.equal((await module.POST(request({ ...valid, currentPassword: "wrong-password" }))).status, 401);
  assert.equal(module.calls.length, 1);
  assert.equal(module.hashes.length, 0);
});
test("success is returned only after the new password hash is stored", async () => {
  const module = moduleFor();
  const response = await module.POST(request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).hasPassword, true);
  assert.equal(module.hashes[0].rounds, 12);
  assert.equal(module.calls.length, 2);
  assert.ok(module.calls[1].values.includes("HASHED_VALUE"));
  assert.ok(!module.calls[1].values.includes(valid.newPassword));
});
test("first-time password setup does not require an old password", async () => {
  const module = moduleFor({ firstPassword: true });
  assert.equal((await module.POST(request({ ...valid, currentPassword: "" }))).status, 200);
  assert.equal(module.hashes.length, 1);
});
test("deactivation during hashing cannot produce a false success notification", async () => {
  const module = moduleFor({ inactiveDuringSave: true });
  const response = await module.POST(request());
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "ACCOUNT_DISABLED");
});
test("database write failures never return success", async () => {
  const module = moduleFor({ failed: true });
  assert.equal((await module.POST(request())).status, 500);
});
