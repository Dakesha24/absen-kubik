import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireRole("admin");
  if (auth.response) return auth.response;
  try {
    const sql = db();
    const [tutors, classes, meetings] = await Promise.all([
      sql`SELECT id, name, active, created_at, (tutor_password_set AND password_hash IS NOT NULL) AS "hasPassword" FROM app_users WHERE role = 'tutor' ORDER BY name`,
      sql`SELECT c.id, c.name, c.description, c.location_name, c.latitude, c.longitude, c.radius_m, c.active,
          sch.weekday, sch.start_time, sch.end_time,
          COUNT(cs.student_id) FILTER (WHERE cs.active = TRUE AND s.active = TRUE)::int AS student_count
          FROM classes c LEFT JOIN class_students cs ON cs.class_id = c.id LEFT JOIN students s ON s.id = cs.student_id
          LEFT JOIN class_schedules sch ON sch.class_id = c.id
          GROUP BY c.id, sch.class_id ORDER BY c.name`,
      sql`SELECT m.id, m.meeting_number, to_char(m.meeting_date, 'YYYY-MM-DD') AS meeting_date, m.starts_at, m.status, m.submitted_at, m.drive_folder_id,
          c.id AS class_id, c.name AS class_name, u.id AS tutor_id, u.name AS tutor_name,
          tc.checked_in_at, tc.latitude, tc.longitude, tc.accuracy_m,
          COUNT(DISTINCT ar.student_id)::int AS attendance_count,
          COUNT(DISTINCT ar.student_id) FILTER (WHERE ar.status IN ('absent', 'sick', 'permission'))::int AS absent_count,
          COUNT(DISTINCT ef.id)::int AS evidence_count
          FROM meetings m JOIN classes c ON c.id = m.class_id JOIN app_users u ON u.id = m.tutor_id
          LEFT JOIN tutor_checkins tc ON tc.meeting_id = m.id
          LEFT JOIN attendance_records ar ON ar.meeting_id = m.id
          LEFT JOIN evidence_files ef ON ef.meeting_id = m.id
          WHERE m.status = 'completed'
          GROUP BY m.id, c.id, u.id, tc.id ORDER BY m.meeting_date DESC, m.meeting_number DESC`,
    ]);
    return Response.json({ tutors, classes, meetings });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Gagal memuat ringkasan." }, { status: 500 });
  }
}
