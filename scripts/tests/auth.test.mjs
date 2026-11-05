import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as jose from "jose";

const secret = "test-session-secret-with-at-least-32-characters";
const user = { id: "f93b2c79-b257-4f95-8ed1-62bd93f17524", name: "Tutor", email: null, role: "tutor", active: true };
const source = await readFile(new URL("../../lib/auth.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

async function token(options = {}) {
  return new jose.SignJWT({ role: options.role ?? user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setExpirationTime(options.expires ?? "1h")
    .sign(new TextEncoder().encode(options.secret ?? secret));
}

function authModule({ cookie, rows = [user], databaseError, sessionSecret = secret } = {}) {
  let databaseCalls = 0;
  const exports = {};
  runInNewContext(compiled, {
    exports, TextEncoder, Response,
    process: { env: { SESSION_SECRET: sessionSecret } },
    require(name) {
      if (name === "server-only") return {};
      if (name === "jose") return jose;
      if (name === "next/headers") return { cookies: async () => ({ get: () => cookie ? { value: cookie } : undefined }) };
      if (name === "@/lib/db") return { db: () => async () => {
        databaseCalls += 1;
        if (databaseError) throw databaseError;
        return rows;
      } };
      throw new Error(`Unexpected module: ${name}`);
    },
  });
  return { ...exports, databaseCalls: () => databaseCalls };
}

test("missing cookie requires login without querying the database", async () => {
  const auth = authModule();
  const result = await auth.requireRole("tutor");
  assert.equal(result.response.status, 401);
  assert.equal((await result.response.json()).code, "SESSION_REQUIRED");
  assert.equal(auth.databaseCalls(), 0);
});

test("valid session authorizes tutor routes", async () => {
  const result = await authModule({ cookie: await token() }).requireRole("tutor");
  assert.equal(result.response, null);
  assert.equal(result.user.id, user.id);
});

test("expired or incorrectly signed sessions require login", async () => {
  for (const options of [{ expires: 1 }, { secret: "a-different-session-secret-with-32-characters" }]) {
    const auth = authModule({ cookie: await token(options) });
    assert.equal((await auth.requireRole()).response.status, 401);
    assert.equal(auth.databaseCalls(), 0);
  }
});

test("database failures return 503 and preserve the distinction from logout", async () => {
  const result = await authModule({ cookie: await token(), databaseError: new Error("private connection details") }).requireRole("tutor");
  assert.equal(result.response.status, 503);
  const body = await result.response.json();
  assert.equal(body.code, "SESSION_UNAVAILABLE");
  assert.doesNotMatch(body.error, /private connection details/);
});

test("missing server secret is a configuration failure", async () => {
  const result = await authModule({ cookie: await token(), sessionSecret: "" }).requireRole();
  assert.equal(result.response.status, 503);
});

test("removed users cannot use their existing session", async () => {
  const result = await authModule({ cookie: await token(), rows: [] }).requireRole();
  assert.equal(result.response.status, 401);
});
test("an inactive tutor's signed session is rejected with the deactivation notice", async () => {
  const auth = authModule({ cookie: await token(), rows: [{ ...user, active: false }] });
  const result = await auth.requireRole("tutor");
  assert.equal(result.user, null);
  assert.equal(result.response.status, 403);
  const body = await result.response.json();
  assert.equal(body.code, "ACCOUNT_DISABLED");
  assert.equal(body.error, "Akun Anda dinonaktifkan. Hubungi admin.");
  assert.equal(auth.databaseCalls(), 1);
});
test("an admin can reactivate a tutor without leaving a disabled flag in the JWT", async () => {
  const cookie = await token();
  assert.equal((await authModule({ cookie, rows: [{ ...user, active: false }] }).requireRole("tutor")).response.status, 403);
  const active = await authModule({ cookie, rows: [{ ...user, active: true }] }).requireRole("tutor");
  assert.equal(active.response, null);
  assert.equal(active.user.id, user.id);
});

test("a tutor session cannot access administrator routes", async () => {
  const result = await authModule({ cookie: await token() }).requireRole("admin");
  assert.equal(result.response.status, 403);
});
