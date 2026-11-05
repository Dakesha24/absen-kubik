import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { accessibleMeeting } from "@/lib/meeting-access";
import { asText, jsonError, readJson, validUuid } from "@/lib/http";

export const runtime = "nodejs";
const allowed = new Set(["present", "absent", "sick", "permission"]);

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("tutor");
  if (auth.response) return auth.response;
  const { id } = await context.params;
  try {
    const meeting = await accessibleMeeting(id, auth.user!);
    if (!meeting) return jsonError("Pertemuan tidak ditemukan atau tidak ditugaskan kepada Anda.", 404);
    if (meeting.status !== "scheduled") return jsonError("Absensi hanya dapat diubah pada pertemuan yang masih terjadwal.", 409);
    const checkin = await db()`
      SELECT id FROM tutor_checkins WHERE meeting_id = ${id} AND tutor_id = ${auth.user!.id} LIMIT 1
    `;
    if (!checkin.length) return jsonError("Lakukan check-in lokasi sebelum menyimpan absensi.", 409);
    const body = await readJson<{ records?: unknown }>(request);
    if (!Array.isArray(body.records)) return jsonError("Data absensi tidak valid.");
    const records = body.records.filter((record): record is { studentId: string; status: string; reason: string } => {
      if (!record || typeof record !== "object") return false;
      const row = record as Record<string, unknown>;
      return validUuid(row.studentId) && typeof row.status === "string" && allowed.has(row.status);
    }).map((record) => ({ student_id: record.studentId, status: record.status, reason: asText((record as Record<string, unknown>).reason, 300) || null }));
    if (records.length !== body.records.length) return jsonError("Ada status absensi atau siswa yang tidak valid.");
    if (new Set(records.map((r) => r.student_id)).size !== records.length) return jsonError("Siswa yang sama tercatat lebih dari satu kali.");

    const sql = db();
    const roster = await sql`SELECT student_id FROM class_students cs JOIN students s ON s.id = cs.student_id
      WHERE cs.class_id = ${meeting.class_id} AND cs.active = TRUE AND s.active = TRUE`;
    const rosterIds = new Set(roster.map((row) => String(row.student_id)));
    if (records.length !== rosterIds.size || records.some((r) => !rosterIds.has(r.student_id))) {
      return jsonError("Daftar absensi harus memuat seluruh siswa aktif di kelas. Muat ulang daftar siswa lalu coba lagi.", 409);
    }
    const payload = JSON.stringify(records);
    const saved = await sql`
      INSERT INTO attendance_records (meeting_id, student_id, status, reason, marked_by)
      SELECT ${id}, x.student_id, x.status, x.reason, ${auth.user!.id}
      FROM jsonb_to_recordset(${payload}::jsonb) AS x(student_id uuid, status text, reason text)
      ON CONFLICT (meeting_id, student_id) DO UPDATE SET status = EXCLUDED.status,
        reason = EXCLUDED.reason, marked_by = EXCLUDED.marked_by, updated_at = NOW()
      RETURNING student_id, status, reason
    `;
    return Response.json({ savedCount: saved.length });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Gagal menyimpan absensi.", 500);
  }
}
