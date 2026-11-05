import { compare } from "bcryptjs";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { asText, jsonError, readJson } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readJson<{ email?: unknown; password?: unknown }>(request);
    const email = asText(body.email, 254).toLowerCase();
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password || new TextEncoder().encode(password).length > 72) return jsonError("Email atau kata sandi tidak sesuai.", 401);

    const rows = await db()`
      SELECT id, name, email, role, active, password_hash, tutor_password_set
      FROM app_users
      WHERE email = ${email}
      LIMIT 1
    `;
    const user = rows[0] as { id: string; name: string; email: string | null; role: "admin" | "tutor"; active: boolean; password_hash: string | null; tutor_password_set: boolean } | undefined;
    if (!user || !user.password_hash || (user.role === "tutor" && !user.tutor_password_set) || !(await compare(password, user.password_hash))) return jsonError("Email atau kata sandi tidak sesuai.", 401);
    if (!user.active) return Response.json({ error: "Akun Anda dinonaktifkan. Hubungi admin.", code: "ACCOUNT_DISABLED" }, { status: 403 });
    await createSession({ id: user.id, name: user.name, email: user.email, role: user.role });
    return Response.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Tidak dapat masuk saat ini.", 500);
  }
}
