import { requireRole } from "@/lib/auth";
import { checkDriveConnection } from "@/lib/drive";
import { effectiveDriveSettings, saveDriveSettings, savedDriveSettings, settingsKeyAvailable } from "@/lib/drive-settings";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireRole("admin");
  if (auth.response) return auth.response;
  try {
    const saved = await savedDriveSettings();
    const configured = Boolean(saved || await effectiveDriveSettings());
    return Response.json({ configured, source: saved ? "admin" : configured ? "environment" : null, encryptionReady: settingsKeyAvailable(), hasRootFolder: Boolean((saved || await effectiveDriveSettings())?.rootFolderId) });
  } catch { return jsonError("Pengaturan Google Drive tidak dapat dibaca. Periksa kunci enkripsi dan database server.", 500); }
}

export async function PUT(request: Request) {
  const auth = await requireRole("admin");
  if (auth.response) return auth.response;
  try {
    const body = await request.json() as Record<string, unknown>;
    const field = (name: string) => typeof body[name] === "string" ? (body[name] as string).trim() : "";
    const previous = await effectiveDriveSettings();
    const settings = {
      clientId: field("clientId") || previous?.clientId || "",
      clientSecret: field("clientSecret") || previous?.clientSecret || "",
      refreshToken: field("refreshToken") || previous?.refreshToken || "",
      rootFolderId: body.clearRootFolder === true ? "" : field("rootFolderId") || previous?.rootFolderId || "",
    };
    if (!settings.clientId || !settings.clientSecret || !settings.refreshToken) return jsonError("Isi Client ID, Client Secret, dan Refresh Token terlebih dahulu.");
    if (Object.values(settings).some((value) => value.length > 4096)) return jsonError("Nilai pengaturan terlalu panjang.");
    if (!settingsKeyAvailable()) return jsonError("Kunci enkripsi pengaturan belum diatur di server. Hubungi pengelola aplikasi.", 503);
    await saveDriveSettings(settings);
    return Response.json({ ok: true });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "42P01") return jsonError("Tabel pengaturan belum tersedia. Jalankan migrasi database.", 503);
    return jsonError("Pengaturan gagal disimpan. Periksa kunci enkripsi dan database server.", 500);
  }
}

export async function POST() {
  const auth = await requireRole("admin");
  if (auth.response) return auth.response;
  try { await checkDriveConnection(); return Response.json({ ok: true }); }
  catch (error) {
    const allowed = ["Google Drive belum dikonfigurasi.", "Otorisasi Google Drive gagal.", "Folder Google Drive tidak dapat diakses.", "Akun Google tidak memiliki izin", "Pengaturan Google Drive tidak dapat dibuka."];
    const message = error instanceof Error && allowed.some((prefix) => error.message.startsWith(prefix)) ? error.message : "Tidak dapat menguji Google Drive. Periksa koneksi dan konfigurasi server.";
    return jsonError(message, 502);
  }
}
