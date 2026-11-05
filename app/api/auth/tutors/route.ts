import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const tutors = await db()`
      SELECT id, name, (tutor_password_set AND password_hash IS NOT NULL) AS "hasPassword"
      FROM app_users
      WHERE role = 'tutor' AND active = TRUE
      ORDER BY name
    `;
    return Response.json({ tutors }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Gagal memuat daftar tutor." }, { status: 500 });
  }
}
