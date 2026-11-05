import type { AppUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function accessibleMeeting(meetingId: string, user: AppUser) {
  const rows = await db()`
    SELECT m.id, m.class_id, m.tutor_id, m.meeting_number, to_char(m.meeting_date, 'YYYY-MM-DD') AS meeting_date, m.starts_at, m.status, m.submitted_at,
      m.drive_folder_id, c.name AS class_name, c.location_name, c.latitude AS class_latitude,
      c.longitude AS class_longitude, c.radius_m
    FROM meetings m JOIN classes c ON c.id = m.class_id
    WHERE m.id = ${meetingId} AND (${user.role} = 'admin' OR m.tutor_id = ${user.id})
      AND (${user.role} = 'admin' OR c.active = TRUE OR m.status = 'completed')
    LIMIT 1
  `;
  return rows[0] as {
    id: string; class_id: string; tutor_id: string; meeting_number: number; meeting_date: string;
    starts_at: string | null; status: string; submitted_at: string | null; drive_folder_id: string | null; class_name: string;
    location_name: string | null; class_latitude: number | null; class_longitude: number | null; radius_m: number | null;
  } | undefined;
}
