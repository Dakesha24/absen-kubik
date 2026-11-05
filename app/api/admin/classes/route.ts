import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { asOptionalNumber, asText, jsonError, readJson, validUuid } from "@/lib/http";

export const runtime = "nodejs";

function selectedIds(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return [...new Set(value.filter(validUuid))];
}

async function saveMembers(classId: string, studentIds: string[]) {
  const sql = db();
  const payload = JSON.stringify(studentIds.map((student_id) => ({ student_id })));
  if (studentIds.length) {
    const valid = await sql`
      SELECT COUNT(DISTINCT s.id)::int AS count FROM students s
      JOIN jsonb_to_recordset(${payload}::jsonb) AS x(student_id uuid) ON x.student_id = s.id
      WHERE s.active = TRUE
    `;
    if (Number(valid[0]?.count) !== studentIds.length) throw new Error("Ada siswa yang tidak ditemukan atau sudah nonaktif.");
  }
  await sql.transaction([
    sql`UPDATE class_students SET active = FALSE WHERE class_id = ${classId}`,
    sql`INSERT INTO class_students (class_id, student_id, active)
      SELECT ${classId}, x.student_id, TRUE FROM jsonb_to_recordset(${payload}::jsonb) AS x(student_id uuid)
      ON CONFLICT (class_id, student_id) DO UPDATE SET active = TRUE`,
  ]);
}

export async function GET() {
  const auth = await requireRole("admin");
  if (auth.response) return auth.response;
  try {
    const sql = db();
    const [classes, students] = await Promise.all([
      sql`SELECT c.id, c.name, c.description, c.location_name, c.latitude, c.longitude, c.radius_m, c.active,
        COALESCE(json_agg(json_build_object('id', s.id, 'name', s.name)) FILTER (WHERE s.id IS NOT NULL AND cs.active = TRUE), '[]'::json)::text AS students_json
        FROM classes c LEFT JOIN class_students cs ON cs.class_id = c.id LEFT JOIN students s ON s.id = cs.student_id
        GROUP BY c.id ORDER BY c.name`,
      sql`SELECT id, name FROM students WHERE active = TRUE ORDER BY name`,
    ]);
    return Response.json({ classes, students });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Gagal memuat kelas.", 500);
  }
}

export async function POST(request: Request) {
  const auth = await requireRole("admin");
  if (auth.response) return auth.response;
  try {
    const body = await readJson<Record<string, unknown>>(request);
    const name = asText(body.name, 120);
    if (!name) return jsonError("Nama kelas wajib diisi.");
    const description = asText(body.description, 500) || null;
    const locationName = asText(body.locationName, 160) || null;
    const latitude = asOptionalNumber(body.latitude);
    const longitude = asOptionalNumber(body.longitude);
    const radius = asOptionalNumber(body.radiusM);
    if (body.latitude !== undefined && body.latitude !== null && body.latitude !== "" && latitude === null) return jsonError("Latitude harus berupa angka.");
    if (body.longitude !== undefined && body.longitude !== null && body.longitude !== "" && longitude === null) return jsonError("Longitude harus berupa angka.");
    if (body.radiusM !== undefined && body.radiusM !== null && body.radiusM !== "" && radius === null) return jsonError("Radius harus berupa angka.");
    if ((latitude === null) !== (longitude === null)) return jsonError("Isi latitude dan longitude bersama-sama.");
    if (latitude !== null && (latitude < -90 || latitude > 90)) return jsonError("Latitude tidak valid.");
    if (longitude !== null && (longitude < -180 || longitude > 180)) return jsonError("Longitude tidak valid.");
    if (radius !== null && (!Number.isInteger(radius) || radius < 25 || radius > 5000)) return jsonError("Radius harus 25–5000 meter.");
    const rows = await db()`
      INSERT INTO classes (name, description, location_name, latitude, longitude, radius_m)
      VALUES (${name}, ${description}, ${locationName}, ${latitude}, ${longitude}, ${radius})
      RETURNING id, name, description, location_name, latitude, longitude, radius_m, active
    `;
    const created = rows[0] as { id: string };
    await saveMembers(created.id, selectedIds(body.studentIds));
    return Response.json({ class: rows[0] }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal membuat kelas.";
    return jsonError(message.includes("unique") ? "Nama kelas sudah digunakan." : message, 500);
  }
}

export async function PATCH(request: Request) {
  const auth = await requireRole("admin");
  if (auth.response) return auth.response;
  try {
    const body = await readJson<Record<string, unknown>>(request);
    if (!validUuid(body.id)) return jsonError("ID kelas tidak valid.");
    const name = asText(body.name, 120);
    if (!name) return jsonError("Nama kelas wajib diisi.");
    const description = asText(body.description, 500) || null;
    const locationName = asText(body.locationName, 160) || null;
    const latitude = asOptionalNumber(body.latitude);
    const longitude = asOptionalNumber(body.longitude);
    const radius = asOptionalNumber(body.radiusM);
    if (body.latitude !== undefined && body.latitude !== null && body.latitude !== "" && latitude === null) return jsonError("Latitude harus berupa angka.");
    if (body.longitude !== undefined && body.longitude !== null && body.longitude !== "" && longitude === null) return jsonError("Longitude harus berupa angka.");
    if (body.radiusM !== undefined && body.radiusM !== null && body.radiusM !== "" && radius === null) return jsonError("Radius harus berupa angka.");
    if ((latitude === null) !== (longitude === null)) return jsonError("Isi latitude dan longitude bersama-sama.");
    if (latitude !== null && (latitude < -90 || latitude > 90)) return jsonError("Latitude tidak valid.");
    if (longitude !== null && (longitude < -180 || longitude > 180)) return jsonError("Longitude tidak valid.");
    if (radius !== null && (!Number.isInteger(radius) || radius < 25 || radius > 5000)) return jsonError("Radius harus 25–5000 meter.");
    const rows = await db()`
      UPDATE classes SET name = ${name}, description = ${description}, location_name = ${locationName},
        latitude = ${latitude}, longitude = ${longitude}, radius_m = ${radius}, active = ${body.active === false ? false : true}
      WHERE id = ${body.id}
      RETURNING id, name, description, location_name, latitude, longitude, radius_m, active
    `;
    if (!rows.length) return jsonError("Kelas tidak ditemukan.", 404);
    if (Array.isArray(body.studentIds)) await saveMembers(body.id, selectedIds(body.studentIds));
    return Response.json({ class: rows[0] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal memperbarui kelas.";
    return jsonError(message.includes("unique") ? "Nama kelas sudah digunakan." : message, 500);
  }
}
