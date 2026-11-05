import { compare } from "bcryptjs";
import { createSession, type AppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonError, readJson, validUuid } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readJson<{ tutorId?: unknown; password?: unknown }>(request);
    if (!validUuid(body.tutorId)) return jsonError("Pilih nama tutor yang tersedia.");
    const password = typeof body.password === "string" ? body.password : "";
    const rows = await db()`
      SELECT id, name, email, active, password_hash, tutor_password_set
      FROM app_users
      WHERE id = ${body.tutorId} AND role = 'tutor'
      LIMIT 1
    `;
    const row = rows[0] as { id: string; name: string; email: string | null; active: boolean; password_hash: string | null; tutor_password_set: boolean } | undefined;
    if (!row) return jsonError("Tutor tidak ditemukan.", 404);
    if (!row.active) return Response.json({ error: "Akun Anda dinonaktifkan. Hubungi admin.", code: "ACCOUNT_DISABLED" }, { status: 403 });
    if (row.tutor_password_set) {
      if (!row.password_hash) return jsonError("Kata sandi tutor belum tersedia. Hubungi admin.", 401);
      if (!password) return jsonError("Masukkan kata sandi tutor.", 401);
      if (new TextEncoder().encode(password).length > 72 || !(await compare(password, row.password_hash))) return jsonError("Kata sandi tutor tidak sesuai.", 401);
    }
    const user: AppUser = { id: row.id, name: row.name, email: row.email, role: "tutor", hasPassword: row.tutor_password_set && Boolean(row.password_hash) };
    await createSession(user);
    return Response.json({ user });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Tidak dapat membuka sesi tutor saat ini.", 500);
  }
}
