import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDriveAccessToken } from "@/lib/drive";
import { jsonError } from "@/lib/http";
import { accessibleMeeting } from "@/lib/meeting-access";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string; evidenceId: string }> }) {
  const auth = await requireRole();
  if (auth.response) return auth.response;
  const { id, evidenceId } = await context.params;
  try {
    const meeting = await accessibleMeeting(id, auth.user!);
    if (!meeting || (auth.user!.role === "admin" && meeting.status !== "completed")) return jsonError("Pertemuan tidak ditemukan.", 404);
    const files = await db()`SELECT drive_file_id, mime_type FROM evidence_files WHERE id = ${evidenceId} AND meeting_id = ${id} LIMIT 1`;
    const file = files[0];
    if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.mime_type)) return jsonError("Pratinjau foto tidak tersedia.", 404);
    const token = await getDriveAccessToken();
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.drive_file_id)}?alt=media&supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    });
    if (!response.ok || !response.body) return jsonError("Foto tidak dapat dimuat dari Google Drive.", 502);
    return new Response(response.body, { headers: { "Content-Type": file.mime_type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return jsonError("Pratinjau foto tidak dapat dimuat.", 500);
  }
}
