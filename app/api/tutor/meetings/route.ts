import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonError, readJson, validUuid } from "@/lib/http";
import { jakartaCalendar } from "@/lib/time";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireRole("tutor");
  if (auth.response) return auth.response;
  try {
    const today = jakartaCalendar();
    const [meetings, classes] = await Promise.all([db()`
      SELECT m.id, m.meeting_number, to_char(m.meeting_date, 'YYYY-MM-DD') AS meeting_date, m.starts_at, m.status, m.submitted_at,
        c.id AS class_id, c.name AS class_name, c.location_name,
        tc.checked_in_at, tc.latitude, tc.longitude, tc.accuracy_m,
        COUNT(DISTINCT ar.student_id)::int AS attendance_count,
        COUNT(DISTINCT ar.student_id) FILTER (WHERE ar.status <> 'present')::int AS absent_count,
        COUNT(DISTINCT ef.id)::int AS evidence_count
      FROM meetings m JOIN classes c ON c.id = m.class_id
        LEFT JOIN tutor_checkins tc ON tc.meeting_id = m.id
        LEFT JOIN attendance_records ar ON ar.meeting_id = m.id
        LEFT JOIN evidence_files ef ON ef.meeting_id = m.id
      WHERE m.tutor_id = ${auth.user!.id} AND m.status <> 'cancelled'
      GROUP BY m.id, c.id, tc.id
      ORDER BY m.meeting_date DESC, m.meeting_number DESC
    `, db()`
      SELECT c.id, c.name, c.location_name, sch.weekday, sch.start_time, sch.end_time
      FROM classes c LEFT JOIN class_schedules sch ON sch.class_id = c.id
      WHERE c.active = TRUE AND (sch.class_id IS NULL OR sch.weekday = ${today.weekday})
      ORDER BY sch.start_time ASC NULLS LAST, c.name
    `]);
    return Response.json({ meetings, classes, date: today.date, weekday: today.weekday });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Gagal memuat pertemuan." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireRole("tutor");
  if (auth.response) return auth.response;
  try {
    const { date: today, weekday } = jakartaCalendar();
    const body = await readJson<{ classId?: unknown }>(request);
    if (!validUuid(body.classId)) return jsonError("Pilih kelas yang valid.");
    const classRows = await db()`
      SELECT c.id, sch.weekday FROM classes c LEFT JOIN class_schedules sch ON sch.class_id = c.id
      WHERE c.id = ${body.classId} AND c.active = TRUE LIMIT 1
    `;
    if (!classRows.length) return jsonError("Kelas tidak ditemukan atau sudah tidak aktif.", 404);
    if (classRows[0].weekday != null && Number(classRows[0].weekday) !== weekday) return jsonError("Kelas ini tidak dijadwalkan hari ini. Muat ulang pilihan kelas.", 409);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const existing = await db()`
        SELECT m.id, m.class_id, c.name AS class_name, c.location_name,
          m.meeting_number, to_char(m.meeting_date, 'YYYY-MM-DD') AS meeting_date, m.starts_at, m.status
        FROM meetings m JOIN classes c ON c.id = m.class_id
        WHERE m.class_id = ${body.classId} AND m.tutor_id = ${auth.user!.id}
          AND m.status <> 'cancelled'
          AND m.meeting_date = ${today}::date
        ORDER BY CASE WHEN m.status = 'scheduled' THEN 0 ELSE 1 END, m.meeting_number DESC
        LIMIT 1
      `;
      if (existing.length) return Response.json({ meeting: existing[0], created: false });

      const nextRows = await db()`
        SELECT COALESCE(MAX(meeting_number), 0)::int + 1 AS meeting_number
        FROM meetings WHERE class_id = ${body.classId}
      `;
      const meetingNumber = Number(nextRows[0]?.meeting_number || 1);
      const created = await db()`
        INSERT INTO meetings (class_id, tutor_id, meeting_number, meeting_date, starts_at)
        SELECT c.id, ${auth.user!.id}, ${meetingNumber}, ${today}::date,
          CASE WHEN sch.start_time IS NOT NULL THEN (${today}::date + sch.start_time) AT TIME ZONE 'Asia/Jakarta' ELSE NULL END
        FROM classes c LEFT JOIN class_schedules sch ON sch.class_id = c.id
        WHERE c.id = ${body.classId} AND c.active = TRUE AND (sch.class_id IS NULL OR sch.weekday = ${weekday})
        ON CONFLICT (class_id, meeting_number) DO NOTHING
        RETURNING id, class_id, meeting_number, to_char(meeting_date, 'YYYY-MM-DD') AS meeting_date, starts_at, status
      `;
      if (created.length) {
        return Response.json({ meeting: created[0], created: true }, { status: 201 });
      }
    }
    return jsonError("Pertemuan kelas sedang dibuat. Coba pilih kelas itu lagi.", 409);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Gagal memulai presensi kelas.", 500);
  }
}
