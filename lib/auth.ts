import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/lib/db";

export type AppRole = "admin" | "tutor";
export type AppUser = { id: string; name: string; email: string | null; role: AppRole; hasPassword?: boolean };

const COOKIE_NAME = "kubik_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;

class AccountDisabledError extends Error {
  constructor() { super("Akun Anda dinonaktifkan. Hubungi admin."); }
}

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET harus berisi minimal 32 karakter.");
  return new TextEncoder().encode(secret);
}

export async function createSession(user: AppUser) {
  const token = await new SignJWT({ role: user.role, name: user.name, email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_SECONDS}s`)
    .sign(secretKey());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export async function clearSession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function currentUser(): Promise<AppUser | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;

  const key = secretKey();
  let userId: string;
  try {
    const { payload } = await jwtVerify(token, key);
    if (!payload.sub || (payload.role !== "admin" && payload.role !== "tutor")) return null;
    userId = payload.sub;
  } catch {
    return null;
  }

  let row: (AppUser & { active: boolean }) | undefined;
  try {
    const rows = await db()`
      SELECT id, name, email, role, active, (tutor_password_set AND password_hash IS NOT NULL) AS "hasPassword"
      FROM app_users
      WHERE id = ${userId}
      LIMIT 1
    `;
    row = rows[0] as (AppUser & { active: boolean }) | undefined;
  } catch {
    throw new Error("Sesi belum dapat diperiksa karena database tidak dapat diakses. Coba lagi beberapa saat.");
  }
  if (!row) return null;
  if (row.active === false) throw new AccountDisabledError();
  const { active: _active, ...user } = row;
  return user;
}

export async function requireRole(role?: AppRole) {
  let user: AppUser | null;
  try {
    user = await currentUser();
  } catch (error) {
    if (error instanceof AccountDisabledError) return { user: null, response: Response.json({ error: error.message, code: "ACCOUNT_DISABLED" }, { status: 403 }) };
    return { user: null, response: Response.json({ error: "Sesi belum dapat diperiksa. Periksa koneksi database atau konfigurasi server, lalu coba lagi.", code: "SESSION_UNAVAILABLE" }, { status: 503 }) };
  }
  if (!user) return { user: null, response: Response.json({ error: "Sesi Anda sudah berakhir atau belum aktif. Silakan masuk kembali.", code: "SESSION_REQUIRED" }, { status: 401 }) };
  if (role && user.role !== role) return { user: null, response: Response.json({ error: "Anda tidak memiliki akses." }, { status: 403 }) };
  return { user, response: null };
}
