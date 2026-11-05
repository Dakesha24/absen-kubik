import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { asText, jsonError, readJson, validUuid } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireRole("admin");
  if (auth.response) return auth.response;
  const classId = new URL(request.url).searchParams.get("classId");
  if (!validUuid(classId)) return jsonError("Kelas tidak valid.");
  try {
    const members = await db()`SELECT s.id, s.name, s.phone FROM class_students cs JOIN students s ON s.id = cs.student_id
      WHERE cs.class_id = ${classId} AND cs.active = TRUE AND s.active = TRUE ORDER BY s.name`;
    return Response.json({ members });
  } catch { return jsonError("Tidak dapat memuat siswa.", 500); }
}

export async function POST(request: Request) {
  const auth = await requireRole("admin");
  if (auth.response) return auth.response;
  try {
    const body = await readJson<Record<string, unknown>>(request);
    if (!validUuid(body.classId)) return jsonError("Kelas tidak valid.");
    const submitted = body.students === undefined ? [{ name: body.name, phone: body.phone }] : body.students;
    if (!Array.isArray(submitted) || submitted.length < 1 || submitted.length > 100) return jsonError("Jumlah siswa harus antara 1–100 untuk sekali simpan.");
    const students: { name: string; phone: string | null }[] = [];
    for (let index = 0; index < submitted.length; index++) {
      const row = submitted[index];
      if (!row || typeof row !== "object" || Array.isArray(row)) return jsonError("Data siswa ke-" + (index + 1) + " tidak valid.");
      const name = typeof row.name === "string" ? row.name.trim() : "";
      if (!name || name.length > 120) return jsonError("Nama siswa ke-" + (index + 1) + " wajib diisi, maksimal 120 karakter.");
      if (row.phone != null && typeof row.phone !== "string") return jsonError("Telepon siswa ke-" + (index + 1) + " tidak valid.");
      if (typeof row.phone === "string" && row.phone.trim().length > 40) return jsonError("Telepon siswa ke-" + (index + 1) + " maksimal 40 karakter.");
      students.push({ name, phone: asText(row.phone, 40) || null });
    }
    const payload = JSON.stringify(students);
    const rows = await db()`WITH target AS (
      SELECT id FROM classes WHERE id = ${body.classId} AND active = TRUE
    ), new_student AS (
      INSERT INTO students (name, phone)
      SELECT x.name, x.phone FROM target CROSS JOIN jsonb_to_recordset(${payload}::jsonb) AS x(name text, phone text)
      RETURNING id
    )
    INSERT INTO class_students (class_id, student_id) SELECT t.id, s.id FROM target t CROSS JOIN new_student s RETURNING student_id`;
    if (!rows.length) return jsonError("Kelas tidak ditemukan atau sudah nonaktif.");
    return Response.json({ saved: true, savedCount: rows.length }, { status: 201 });
  } catch { return jsonError("Gagal menambahkan siswa.", 500); }
}

export async function PATCH(request: Request) {
  const auth = await requireRole("admin");
  if (auth.response) return auth.response;
  try {
    const body = await readJson<Record<string, unknown>>(request);
    if (!validUuid(body.classId) || !validUuid(body.studentId)) return jsonError("Kelas atau siswa tidak valid.");
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 120) return jsonError("Nama siswa wajib diisi, maksimal 120 karakter.");
    if (body.phone != null && typeof body.phone !== "string" || typeof body.phone === "string" && body.phone.trim().length > 40) return jsonError("Telepon tidak valid atau melebihi 40 karakter.");
    const rows = await db()`UPDATE students s SET name = ${name}, phone = ${asText(body.phone, 40) || null}
      WHERE s.id = ${body.studentId} AND s.active = TRUE AND EXISTS (
        SELECT 1 FROM class_students cs JOIN classes c ON c.id = cs.class_id
        WHERE cs.student_id = s.id AND cs.class_id = ${body.classId} AND cs.active = TRUE AND c.active = TRUE
      ) RETURNING s.id, s.name, s.phone`;
    if (!rows.length) return jsonError("Siswa tidak ditemukan di kelas ini.", 404);
    return Response.json({ student: rows[0] });
  } catch { return jsonError("Gagal memperbarui siswa.", 500); }
}

export async function DELETE(request: Request) {
  const auth = await requireRole("admin");
  if (auth.response) return auth.response;
  try {
    const body = await readJson<Record<string, unknown>>(request);
    if (!validUuid(body.classId) || !validUuid(body.studentId)) return jsonError("Kelas atau siswa tidak valid.");
    if (body.confirmed !== true) return jsonError("Konfirmasi penghapusan siswa terlebih dahulu.");
    const rows = await db()`UPDATE class_students cs SET active = FALSE FROM classes c
      WHERE cs.class_id = c.id AND c.id = ${body.classId} AND c.active = TRUE
        AND cs.student_id = ${body.studentId} AND cs.active = TRUE
      RETURNING cs.student_id`;
    if (!rows.length) return jsonError("Siswa tidak ditemukan di kelas ini atau sudah dihapus.", 404);
    return Response.json({ deleted: true });
  } catch { return jsonError("Gagal menghapus siswa dari kelas.", 500); }
}
