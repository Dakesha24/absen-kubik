import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { accessibleMeeting } from "@/lib/meeting-access";
import { asOptionalNumber, asText, jsonError, readJson } from "@/lib/http";
import { reverseGeocodeLabel } from "@/lib/reverse-geocode";

export const runtime = "nodejs";

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radians = (deg: number) => deg * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("tutor");
  if (auth.response) return auth.response;
  const { id } = await context.params;
  try {
    const meeting = await accessibleMeeting(id, auth.user!);
    if (!meeting) return jsonError("Pertemuan tidak ditemukan atau tidak ditugaskan kepada Anda.", 404);
    if (meeting.status !== "scheduled") return jsonError("Check-in hanya dapat dilakukan pada pertemuan yang masih terjadwal.", 409);
    const body = await readJson<{ latitude?: unknown; longitude?: unknown; accuracyM?: unknown; note?: unknown }>(request);
    const latitude = asOptionalNumber(body.latitude);
    const longitude = asOptionalNumber(body.longitude);
    const accuracy = asOptionalNumber(body.accuracyM);
    if (latitude === null || longitude === null || accuracy === null) return jsonError("Lokasi dan akurasi perangkat wajib dikirim.");
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || accuracy < 0 || accuracy > 100000) return jsonError("Data lokasi tidak valid.");
    let distance: number | null = null;
    if (meeting.class_latitude !== null && meeting.class_longitude !== null) {
      distance = distanceMeters(latitude, longitude, Number(meeting.class_latitude), Number(meeting.class_longitude));
      if (meeting.radius_m !== null && distance > Number(meeting.radius_m)) {
        const locationName = meeting.location_name || meeting.class_name;
        return Response.json({
          error: `Anda berada di luar lokasi ${locationName}.`,
          code: "OUTSIDE_SCHOOL_RADIUS",
          distanceM: Math.round(distance),
          radiusM: Number(meeting.radius_m),
          locationName,
        }, { status: 403 });
      }
    }
    const locationLabel = await reverseGeocodeLabel(latitude, longitude);
    const rows = await db()`
      INSERT INTO tutor_checkins (meeting_id, tutor_id, latitude, longitude, accuracy_m, distance_m, location_label, note)
      VALUES (${id}, ${auth.user!.id}, ${latitude}, ${longitude}, ${accuracy}, ${distance}, ${locationLabel}, ${asText(body.note, 300) || null})
      ON CONFLICT (meeting_id) DO UPDATE SET tutor_id = EXCLUDED.tutor_id, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
        accuracy_m = EXCLUDED.accuracy_m, distance_m = EXCLUDED.distance_m, location_label = EXCLUDED.location_label,
        note = EXCLUDED.note, checked_in_at = NOW()
      RETURNING id, latitude, longitude, accuracy_m, distance_m, location_label, checked_in_at, note
    `;
    return Response.json({ checkin: rows[0] });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Gagal menyimpan check-in.", 500);
  }
}
