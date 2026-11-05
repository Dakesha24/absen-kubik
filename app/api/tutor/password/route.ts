import { compare, hash } from "bcryptjs";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonError, readJson } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireRole("tutor");
  if (auth.response) return auth.response;

  try {
    const body = await readJson<{ currentPassword?: unknown; newPassword?: unknown; confirmPassword?: unknown }>(request);
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : "";
    const newPasswordBytes = new TextEncoder().encode(newPassword).length;

    if (newPassword.length < 12) return jsonError("Kata sandi baru minimal 12 karakter.");
    if (newPasswordBytes > 72) return jsonError("Kata sandi terlalu panjang. Gunakan kombinasi yang lebih singkat.");
    if (newPassword !== confirmPassword) return jsonError("Konfirmasi kata sandi belum sama.");
    if (newPassword === currentPassword) return jsonError("Gunakan kata sandi baru yang berbeda.");

    const rows = await db()`
      SELECT password_hash, tutor_password_set
      FROM app_users
      WHERE id = ${auth.user!.id} AND role = 'tutor' AND active = TRUE
      LIMIT 1
    `;
    if (!rows.length) return jsonError("Akun tutor tidak ditemukan atau sudah tidak aktif.", 404);

    const account = rows[0] as { password_hash: string | null; tutor_password_set: boolean };
    if (account.tutor_password_set) {
      if (!account.password_hash) return jsonError("Kata sandi akun belum tersedia. Hubungi admin.", 401);
      if (!currentPassword || new TextEncoder().encode(currentPassword).length > 72) return jsonError("Masukkan kata sandi saat ini.", 401);
      if (!(await compare(currentPassword, account.password_hash))) return jsonError("Kata sandi saat ini tidak sesuai.", 401);
    }

    const nextHash = await hash(newPassword, 12);
    const updated = await db()`
      UPDATE app_users
      SET password_hash = ${nextHash}, tutor_password_set = TRUE, updated_at = NOW()
      WHERE id = ${auth.user!.id} AND role = 'tutor' AND active = TRUE
      RETURNING id
    `;
    if (!updated.length) return Response.json({ error: "Akun Anda dinonaktifkan. Hubungi admin.", code: "ACCOUNT_DISABLED" }, { status: 403 });

    return Response.json({ hasPassword: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Gagal menyimpan kata sandi.", 500);
  }
}
