import { hash } from "bcryptjs";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { asText, jsonError, readJson, validUuid } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireRole("admin");
  if (auth.response) return auth.response;
  const rows = await db()`
    SELECT id, name, active, created_at, (tutor_password_set AND password_hash IS NOT NULL) AS "hasPassword"
    FROM app_users WHERE role = 'tutor' ORDER BY name
  `;
  return Response.json({ tutors: rows });
}

export async function POST(request: Request) {
  const auth = await requireRole("admin");
  if (auth.response) return auth.response;
  try {
    const body = await readJson<{ name?: unknown; password?: unknown }>(request);
    const name = asText(body.name, 120);
    const password = typeof body.password === "string" ? body.password : "";
    if (!name) return jsonError("Nama tutor wajib diisi.");
    if (password && (password.length < 12 || new TextEncoder().encode(password).length > 72)) return jsonError("Kata sandi awal harus 12–72 byte, atau kosongkan agar tutor mengaturnya sendiri.");
    const passwordHash = password ? await hash(password, 12) : null;
    const rows = await db()`
      INSERT INTO app_users (name, email, password_hash, tutor_password_set, role)
      VALUES (${name}, NULL, ${passwordHash}, ${Boolean(passwordHash)}, 'tutor')
      RETURNING id, name, active, created_at, (tutor_password_set AND password_hash IS NOT NULL) AS "hasPassword"
    `;
    return Response.json({ tutor: rows[0] }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal membuat akun tutor.";
    return jsonError(message.includes("unique") ? "Email sudah digunakan." : message, 500);
  }
}

export async function PATCH(request: Request) {
  const auth = await requireRole("admin");
  if (auth.response) return auth.response;
  try {
    const body = await readJson<{ id?: unknown; name?: unknown; active?: unknown; password?: unknown }>(request);
    if (!validUuid(body.id)) return jsonError("ID tutor tidak valid.");
    const name = asText(body.name, 120);
    const active = body.active === false ? false : true;
    const password = typeof body.password === "string" ? body.password : "";
    if (!name) return jsonError("Nama tutor wajib diisi.");
    if (password && (password.length < 12 || new TextEncoder().encode(password).length > 72)) return jsonError("Kata sandi baru harus 12–72 byte.");
    const rows = password.length >= 12
      ? await db()`
          UPDATE app_users SET name = ${name}, active = ${active}, password_hash = ${await hash(password, 12)}, tutor_password_set = TRUE, updated_at = NOW()
          WHERE id = ${body.id} AND role = 'tutor' RETURNING id, name, active, (tutor_password_set AND password_hash IS NOT NULL) AS "hasPassword"
        `
      : await db()`
          UPDATE app_users SET name = ${name}, active = ${active}, updated_at = NOW()
          WHERE id = ${body.id} AND role = 'tutor' RETURNING id, name, active, (tutor_password_set AND password_hash IS NOT NULL) AS "hasPassword"
        `;
    if (!rows.length) return jsonError("Tutor tidak ditemukan.", 404);
    return Response.json({ tutor: rows[0] });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Gagal memperbarui tutor.", 500);
  }
}

export async function DELETE(request: Request) {
  const auth = await requireRole("admin");
  if (auth.response) return auth.response;
  try {
    const body = await readJson<{ id?: unknown }>(request);
    if (!validUuid(body.id)) return jsonError("ID tutor tidak valid.");

    const rows = await db()`
      DELETE FROM app_users AS tutor
      WHERE tutor.id = ${body.id}
        AND tutor.role = 'tutor'
        AND NOT EXISTS (SELECT 1 FROM meetings WHERE tutor_id = tutor.id)
        AND NOT EXISTS (SELECT 1 FROM tutor_checkins WHERE tutor_id = tutor.id)
        AND NOT EXISTS (SELECT 1 FROM attendance_records WHERE marked_by = tutor.id)
        AND NOT EXISTS (SELECT 1 FROM evidence_files WHERE uploaded_by = tutor.id)
      RETURNING id
    `;
    if (rows.length) return Response.json({ deleted: true });

    const existing = await db()`
      SELECT id FROM app_users WHERE id = ${body.id} AND role = 'tutor' LIMIT 1
    `;
    if (!existing.length) return jsonError("Tutor tidak ditemukan.", 404);
    return jsonError("Tutor memiliki riwayat pertemuan, presensi, atau dokumentasi. Nonaktifkan tutor agar riwayatnya tetap tersimpan.", 409);
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "23503") return jsonError("Tutor memiliki data terkait dan tidak dapat dihapus. Nonaktifkan tutor agar riwayatnya tetap tersimpan.", 409);
    return jsonError(error instanceof Error ? error.message : "Gagal menghapus tutor.", 500);
  }
}
