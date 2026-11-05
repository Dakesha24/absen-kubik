import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { asText, jsonError, readJson, validUuid } from "@/lib/http";
import { parseJakartaDateTime } from "@/lib/time";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireRole("admin");
  if (auth.response) return auth.response;
  const rows = await db()`
    SELECT m.id, m.class_id, c.name AS class_name, m.tutor_id, u.name AS tutor_name,
      m.meeting_number, to_char(m.meeting_date, 'YYYY-MM-DD') AS meeting_date, m.starts_at, m.status, m.submitted_at, tc.checked_in_at,
      COUNT(DISTINCT ar.student_id)::int AS attendance_count,
      COUNT(DISTINCT ar.student_id) FILTER (WHERE ar.status <> 'present')::int AS absent_count,
      COUNT(DISTINCT ef.id)::int AS evidence_count
    FROM meetings m JOIN classes c ON c.id = m.class_id JOIN app_users u ON u.id = m.tutor_id
      LEFT JOIN tutor_checkins tc ON tc.meeting_id = m.id
      LEFT JOIN attendance_records ar ON ar.meeting_id = m.id
      LEFT JOIN evidence_files ef ON ef.meeting_id = m.id
    WHERE m.status = 'completed'
    GROUP BY m.id, c.id, u.id, tc.id ORDER BY m.meeting_date DESC, m.meeting_number DESC
  `;
  return Response.json({ meetings: rows });
}

export async function POST(request: Request) {
  const auth = await requireRole("admin");
  if (auth.response) return auth.response;
  try {
    const body = await readJson<{ classId?: unknown; tutorId?: unknown; meetingNumber?: unknown; meetingDate?: unknown; startsAt?: unknown }>(request);
    if (!validUuid(body.classId) || !validUuid(body.tutorId)) return jsonError("Pilih kelas dan tutor yang valid.");
    const meetingNumber = Number(body.meetingNumber);
    const meetingDate = asText(body.meetingDate, 10);
    const startsAt = asText(body.startsAt, 40);
    if (!Number.isInteger(meetingNumber) || meetingNumber < 1) return jsonError("Nomor pertemuan harus bilangan positif.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(meetingDate) || Number.isNaN(Date.parse(`${meetingDate}T00:00:00Z`))) return jsonError("Tanggal pertemuan tidak valid.");
    const startDate = startsAt ? parseJakartaDateTime(startsAt) : null;
    if (startDate && Number.isNaN(startDate.getTime())) return jsonError("Waktu mulai tidak valid.");
    const rows = await db()`
      INSERT INTO meetings (class_id, tutor_id, meeting_number, meeting_date, starts_at)
      SELECT c.id, u.id, ${meetingNumber}, ${meetingDate}::date, ${startDate?.toISOString() ?? null}::timestamptz
      FROM classes c CROSS JOIN app_users u
      WHERE c.id = ${body.classId} AND c.active = TRUE AND u.id = ${body.tutorId} AND u.role = 'tutor' AND u.active = TRUE
      RETURNING id, class_id, tutor_id, meeting_number, to_char(meeting_date, 'YYYY-MM-DD') AS meeting_date, starts_at, status
    `;
    if (!rows.length) return jsonError("Kelas atau tutor tidak aktif/tidak ditemukan.", 400);
    return Response.json({ meeting: rows[0] }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal membuat pertemuan.";
    return jsonError(message.includes("unique") ? "Nomor pertemuan tersebut sudah dipakai untuk kelas ini." : message, 500);
  }
}

export async function PATCH(request: Request) {
  const auth = await requireRole("admin");
  if (auth.response) return auth.response;
  try {
    const body = await readJson<{ id?: unknown; tutorId?: unknown; meetingDate?: unknown; startsAt?: unknown; status?: unknown }>(request);
    if (!validUuid(body.id) || !validUuid(body.tutorId)) return jsonError("ID pertemuan atau tutor tidak valid.");
    const meetingDate = asText(body.meetingDate, 10);
    const startsAt = asText(body.startsAt, 40);
    if (body.status === "completed") return jsonError("Presensi hanya dapat diselesaikan melalui tombol Simpan absensi tutor.", 409);
    const status = body.status === "cancelled" ? "cancelled" : "scheduled";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(meetingDate)) return jsonError("Tanggal pertemuan tidak valid.");
    const startDate = startsAt ? parseJakartaDateTime(startsAt) : null;
    if (startDate && Number.isNaN(startDate.getTime())) return jsonError("Waktu mulai tidak valid.");
    const rows = await db()`
      UPDATE meetings m SET tutor_id = u.id, meeting_date = ${meetingDate}::date,
        starts_at = ${startDate?.toISOString() ?? null}::timestamptz, status = ${status}
      FROM app_users u WHERE m.id = ${body.id} AND m.status <> 'completed' AND u.id = ${body.tutorId} AND u.role = 'tutor' AND u.active = TRUE
      RETURNING m.id, m.class_id, m.tutor_id, m.meeting_number, to_char(m.meeting_date, 'YYYY-MM-DD') AS meeting_date, m.starts_at, m.status
    `;
    if (!rows.length) return jsonError("Pertemuan atau tutor tidak ditemukan.", 404);
    return Response.json({ meeting: rows[0] });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Gagal memperbarui pertemuan.", 500);
  }
}
