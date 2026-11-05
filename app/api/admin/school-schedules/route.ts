import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { asText, asOptionalNumber, jsonError, readJson, validUuid } from "@/lib/http";

export const runtime = "nodejs";

export async function DELETE(request: Request) {
  const auth = await requireRole("admin");
  if (auth.response) return auth.response;
  try {
    const body = await readJson<Record<string, unknown>>(request);
    if (!validUuid(body.classId)) return jsonError("Kelas tidak valid.");
    if (body.confirmation !== "delete") return jsonError("Ketik delete untuk mengonfirmasi penghapusan kelas.");
    const rows = await db()`UPDATE classes SET active = FALSE
      WHERE id = ${body.classId} AND active = TRUE RETURNING id`;
    if (!rows.length) return jsonError("Kelas tidak ditemukan atau sudah dihapus.", 404);
    return Response.json({ deleted: true });
  } catch { return jsonError("Gagal menghapus kelas.", 500); }
}

function schoolDetails(body: Record<string, unknown>) {
  const school = asText(body.schoolName, 80);
  const className = asText(body.className, 80);
  const location = asText(body.address, 160);
  const name = school + " — " + className;
  if (!school || !className || !location) return jsonError("Isi nama sekolah, alamat, dan nama kelas.");
  if (name.length > 120) return jsonError("Gabungan nama sekolah dan kelas maksimal 120 karakter.");
  const latitude = asOptionalNumber(body.latitude);
  const longitude = asOptionalNumber(body.longitude);
  const radius = asOptionalNumber(body.radiusM);
  for (const key of ["latitude", "longitude", "radiusM"]) {
    if (body[key] !== "" && body[key] != null && asOptionalNumber(body[key]) === null) return jsonError("Koordinat dan radius harus berupa angka.");
  }
  if ((latitude === null) !== (longitude === null)) return jsonError("Isi latitude dan longitude bersama-sama.");
  if (latitude !== null && (latitude < -90 || latitude > 90)) return jsonError("Latitude tidak valid.");
  if (longitude !== null && (longitude < -180 || longitude > 180)) return jsonError("Longitude tidak valid.");
  if (radius !== null && (!Number.isInteger(radius) || radius < 25 || radius > 5000)) return jsonError("Radius harus 25–5000 meter.");
  return { name, location, latitude, longitude, radius, notes: asText(body.notes, 500) || null };
}

export async function POST(request: Request) {
  const auth = await requireRole("admin");
  if (auth.response) return auth.response;
  try {
    const body = await readJson<Record<string, unknown>>(request);
    const weekday = typeof body.weekday === "number" || typeof body.weekday === "string" && body.weekday.trim() !== "" ? Number(body.weekday) : NaN;
    const start = asText(body.startTime, 10);
    const end = asText(body.endTime, 10) || null;
    const validTime = (time: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return jsonError("Pilih hari belajar yang valid.");
    if (!validTime(start) || end && !validTime(end)) return jsonError("Jam belajar tidak valid.");
    if (end && end <= start) return jsonError("Jam selesai harus setelah jam mulai.");
    if (body.classId && !validUuid(body.classId)) return jsonError("Kelas tidak valid.");
    const details = !body.classId || body.schoolName !== undefined || body.className !== undefined || body.address !== undefined ? schoolDetails(body) : null;
    if (details instanceof Response) return details;
    const sql = db();
    let rows;
    if (body.classId && details) {
      rows = await sql`
        WITH updated_class AS (
          UPDATE classes SET name = ${details.name}, location_name = ${details.location},
            description = ${details.notes}, latitude = ${details.latitude}, longitude = ${details.longitude}, radius_m = ${details.radius}
          WHERE id = ${body.classId} AND active = TRUE RETURNING id
        )
        INSERT INTO class_schedules (class_id, weekday, start_time, end_time)
        SELECT id, ${weekday}, ${start}::time, ${end}::time FROM updated_class WHERE TRUE
        ON CONFLICT (class_id) DO UPDATE SET weekday = EXCLUDED.weekday,
          start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time, updated_at = NOW()
        RETURNING class_id, weekday, start_time, end_time
      `;
    } else if (body.classId) {
      rows = await sql`
        INSERT INTO class_schedules (class_id, weekday, start_time, end_time)
        SELECT id, ${weekday}, ${start}::time, ${end}::time FROM classes
        WHERE id = ${body.classId} AND active = TRUE
        ON CONFLICT (class_id) DO UPDATE SET weekday = EXCLUDED.weekday,
          start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time, updated_at = NOW()
        RETURNING class_id, weekday, start_time, end_time
      `;
    } else {
      if (!details) return jsonError("Isi identitas sekolah dan kelas.");
      rows = await sql`
        WITH created_class AS (
          INSERT INTO classes (name, location_name, description, latitude, longitude, radius_m)
          VALUES (${details.name}, ${details.location}, ${details.notes}, ${details.latitude}, ${details.longitude}, ${details.radius})
          RETURNING id
        )
        INSERT INTO class_schedules (class_id, weekday, start_time, end_time)
        SELECT id, ${weekday}, ${start}::time, ${end}::time FROM created_class
        RETURNING class_id, weekday, start_time, end_time
      `;
    }
    if (!rows.length) return jsonError("Kelas tidak ditemukan atau sudah nonaktif.", 404);
    return Response.json({ schedule: rows[0] }, { status: 201 });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") return jsonError("Nama kelas tersebut sudah digunakan di sekolah ini. Gunakan nama kelas lain atau atur jadwal kelas yang sudah ada.", 409);
    return jsonError(error instanceof Error ? error.message : "Gagal menyimpan jadwal.", 500);
  }
}
