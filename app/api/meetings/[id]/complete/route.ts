import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { accessibleMeeting } from "@/lib/meeting-access";
import { asText, jsonError, readJson, validUuid } from "@/lib/http";

export const runtime = "nodejs";
const allowed = new Set(["present", "absent", "sick", "permission"]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("tutor");
  if (auth.response) return auth.response;
  const { id } = await context.params;
  try {
    const meeting = await accessibleMeeting(id, auth.user!);
    if (!meeting) return jsonError("Pertemuan tidak ditemukan atau tidak ditugaskan kepada Anda.", 404);
    if (meeting.status === "completed") return Response.json({ meeting: { id, status: "completed" } });
    if (meeting.status !== "scheduled") return jsonError("Pertemuan ini sudah dibatalkan.", 409);
    const body = await readJson<{ records?: unknown }>(request);
    if (!Array.isArray(body.records)) return jsonError("Data absensi siswa tidak valid.");
    const records: { student_id: string; status: string; reason: string | null }[] = [];
    for (const value of body.records) {
      if (!value || typeof value !== "object") return jsonError("Data absensi tidak valid.");
      const row = value as Record<string, unknown>;
      if (!validUuid(row.studentId) || typeof row.status !== "string" || !allowed.has(row.status)) return jsonError("Siswa atau status absensi tidak valid.");
      records.push({ student_id: row.studentId, status: row.status, reason: row.status === "present" ? null : asText(row.reason, 300) || null });
    }
    if (new Set(records.map((record) => record.student_id)).size !== records.length) return jsonError("Siswa yang sama tercatat lebih dari satu kali.");
    const payload = JSON.stringify(records);
    const rows = await db()`
      WITH target AS (
        SELECT m.id FROM meetings m
        WHERE m.id = ${id} AND m.tutor_id = ${auth.user!.id} AND m.status = 'scheduled'
          AND EXISTS (SELECT 1 FROM classes c WHERE c.id = m.class_id AND c.active = TRUE)
          AND EXISTS (SELECT 1 FROM tutor_checkins tc WHERE tc.meeting_id = m.id AND tc.tutor_id = m.tutor_id)
          AND EXISTS (SELECT 1 FROM evidence_files ef WHERE ef.meeting_id = m.id)
          AND (SELECT COUNT(*) FROM class_students cs JOIN students s ON s.id = cs.student_id
            WHERE cs.class_id = m.class_id AND cs.active = TRUE AND s.active = TRUE) = ${records.length}
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_to_recordset(${payload}::jsonb) AS x(student_id uuid)
            WHERE NOT EXISTS (SELECT 1 FROM class_students cs JOIN students s ON s.id = cs.student_id
              WHERE cs.class_id = m.class_id AND cs.student_id = x.student_id AND cs.active = TRUE AND s.active = TRUE)
          )
        FOR UPDATE OF m
      ), saved AS (
        INSERT INTO attendance_records (meeting_id, student_id, status, reason, marked_by)
        SELECT target.id, x.student_id, x.status, x.reason, ${auth.user!.id}
        FROM target CROSS JOIN jsonb_to_recordset(${payload}::jsonb) AS x(student_id uuid, status text, reason text)
        WHERE TRUE
        ON CONFLICT (meeting_id, student_id) DO UPDATE SET status = EXCLUDED.status,
          reason = EXCLUDED.reason, marked_by = EXCLUDED.marked_by, updated_at = NOW()
        RETURNING meeting_id
      ), pruned AS (
        DELETE FROM attendance_records ar USING target
        WHERE ar.meeting_id = target.id AND NOT EXISTS (
          SELECT 1 FROM jsonb_to_recordset(${payload}::jsonb) AS x(student_id uuid)
          WHERE x.student_id = ar.student_id
        )
        RETURNING ar.meeting_id
      )
      UPDATE meetings m SET status = 'completed', submitted_at = NOW() FROM target
      WHERE m.id = target.id AND (SELECT COUNT(*) FROM saved) = ${records.length}
      RETURNING m.id, m.status, m.submitted_at
    `;
    if (!rows.length) return jsonError("Presensi belum dapat disimpan. Pastikan lokasi dan dokumentasi sudah lengkap. Jika kelas memiliki siswa, isi seluruh siswa aktif dan muat ulang daftar jika berubah.", 409);
    return Response.json({ meeting: rows[0] });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Gagal menyimpan presensi. Silakan coba lagi.", 500);
  }
}
