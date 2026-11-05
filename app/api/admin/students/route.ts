import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { asText, jsonError, readJson, validUuid } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireRole("admin");
  if (auth.response) return auth.response;
  const rows = await db()`
    SELECT id, name, email, phone, active, created_at FROM students ORDER BY name
  `;
  return Response.json({ students: rows });
}

export async function POST(request: Request) {
  const auth = await requireRole("admin");
  if (auth.response) return auth.response;
  try {
    const body = await readJson<{ name?: unknown; email?: unknown; phone?: unknown }>(request);
    const name = asText(body.name, 120);
    const email = asText(body.email, 254).toLowerCase() || null;
    const phone = asText(body.phone, 40) || null;
    if (!name) return jsonError("Nama siswa wajib diisi.");
    const rows = await db()`
      INSERT INTO students (name, email, phone) VALUES (${name}, ${email}, ${phone})
      RETURNING id, name, email, phone, active
    `;
    return Response.json({ student: rows[0] }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Gagal membuat siswa.", 500);
  }
}

export async function PATCH(request: Request) {
  const auth = await requireRole("admin");
  if (auth.response) return auth.response;
  try {
    const body = await readJson<{ id?: unknown; name?: unknown; email?: unknown; phone?: unknown; active?: unknown }>(request);
    if (!validUuid(body.id)) return jsonError("ID siswa tidak valid.");
    const name = asText(body.name, 120);
    if (!name) return jsonError("Nama siswa wajib diisi.");
    const email = asText(body.email, 254).toLowerCase() || null;
    const phone = asText(body.phone, 40) || null;
    const active = body.active === false ? false : true;
    const rows = await db()`
      UPDATE students SET name = ${name}, email = ${email}, phone = ${phone}, active = ${active}
      WHERE id = ${body.id} RETURNING id, name, email, phone, active
    `;
    if (!rows.length) return jsonError("Siswa tidak ditemukan.", 404);
    return Response.json({ student: rows[0] });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Gagal memperbarui siswa.", 500);
  }
}
