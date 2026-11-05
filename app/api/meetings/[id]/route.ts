import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { accessibleMeeting } from "@/lib/meeting-access";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRole();
  if (auth.response) return auth.response;
  const { id } = await context.params;
  try {
    const meeting = await accessibleMeeting(id, auth.user!);
    if (!meeting) return jsonError("Pertemuan tidak ditemukan atau tidak ditugaskan kepada Anda.", 404);
    if (auth.user!.role === "admin" && meeting.status !== "completed") return jsonError("Presensi belum dikirim oleh tutor.", 404);
    const sql = db();
    const [students, checkins, evidence, savedAttendance] = await Promise.all([
      meeting.status === "completed"
        ? sql`SELECT s.id, s.name, ar.status, ar.reason FROM attendance_records ar
            JOIN students s ON s.id = ar.student_id
            WHERE ar.meeting_id = ${id} ORDER BY s.name`
        : sql`SELECT s.id, s.name, COALESCE(ar.status, 'present') AS status, ar.reason
        FROM class_students cs JOIN students s ON s.id = cs.student_id AND s.active = TRUE
        LEFT JOIN attendance_records ar ON ar.meeting_id = ${id} AND ar.student_id = s.id
        WHERE cs.class_id = ${meeting.class_id} AND cs.active = TRUE ORDER BY s.name`,
      sql`SELECT id, latitude, longitude, accuracy_m, distance_m, location_label, checked_in_at, note
        FROM tutor_checkins WHERE meeting_id = ${id} LIMIT 1`,
      sql`SELECT id, name, mime_type, size_bytes, web_view_link, created_at
        FROM evidence_files WHERE meeting_id = ${id} ORDER BY created_at DESC`,
      sql`SELECT COUNT(*)::int AS count FROM attendance_records ar
        JOIN class_students cs ON cs.class_id = ${meeting.class_id} AND cs.student_id = ar.student_id AND cs.active = TRUE
        JOIN students s ON s.id = ar.student_id AND s.active = TRUE
        WHERE ar.meeting_id = ${id}`,
    ]);
    return Response.json({ meeting, students, checkin: checkins[0] ?? null, evidence,
      attendanceSaved: meeting.status === "completed" || students.length > 0 && Number(savedAttendance[0]?.count) === students.length });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Gagal memuat detail pertemuan.", 500);
  }
}
