import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDriveAccessToken } from "@/lib/drive";
import { jsonError } from "@/lib/http";
import { accessibleMeeting } from "@/lib/meeting-access";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string; evidenceId: string }> }) {
  const auth = await requireRole();
  if (auth.response) return auth.response;
  const { id, evidenceId } = await context.params;
  try {
    const meeting = await accessibleMeeting(id, auth.user!);
    if (!meeting || (auth.user!.role === "admin" && meeting.status !== "completed")) return jsonError("Pertemuan tidak ditemukan.", 404);
    const files = await db()`SELECT drive_file_id, mime_type, size_bytes FROM evidence_files WHERE id = ${evidenceId} AND meeting_id = ${id} LIMIT 1`;
    const file = files[0];
    const isVideo = file && ["video/mp4", "video/webm", "video/quicktime"].includes(file.mime_type);
    if (!file || (!isVideo && !["image/jpeg", "image/png", "image/webp"].includes(file.mime_type))) return jsonError("Pratinjau tidak tersedia.", 404);
    const size = Number(file.size_bytes);
    let range: string | undefined;
    if (isVideo) {
      if (!Number.isSafeInteger(size) || size < 1) return jsonError("Ukuran video tidak valid.", 502);
      const header = request.headers.get("range");
      const match = header ? /^bytes=(\d*)-(\d*)$/.exec(header) : null;
      if (header && (!match || (!match[1] && !match[2]))) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
      const suffix = match && !match[1] ? Number(match[2]) : null;
      const start = suffix !== null ? Math.max(0, size - suffix) : match?.[1] ? Number(match[1]) : 0;
      const requestedEnd = suffix !== null ? size - 1 : match?.[2] ? Number(match[2]) : size - 1;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || (suffix !== null && (!Number.isSafeInteger(suffix) || suffix < 1)) || start >= size || requestedEnd < start) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
      const end = Math.min(requestedEnd, size - 1, start + 2 * 1024 * 1024 - 1);
      range = `bytes=${start}-${end}`;
    }
    const token = await getDriveAccessToken();
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.drive_file_id)}?alt=media&supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${token}`, ...(range ? { Range: range } : {}) }, cache: "no-store",
    });
    if (!response.ok || !response.body || (isVideo && response.status !== 206)) return jsonError("Dokumentasi tidak dapat dimuat dari Google Drive.", 502);
    const headers = new Headers({ "Content-Type": file.mime_type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
    if (isVideo) {
      const contentRange = response.headers.get("content-range");
      const contentLength = response.headers.get("content-length");
      if (!contentRange || !contentLength || Number(contentLength) > 2 * 1024 * 1024) return jsonError("Rentang video dari Google Drive tidak valid.", 502);
      headers.set("Content-Range", contentRange);
      headers.set("Content-Length", contentLength);
      headers.set("Accept-Ranges", "bytes");
    }
    return new Response(response.body, { status: isVideo ? 206 : 200, headers });
  } catch {
    return jsonError("Pratinjau tidak dapat dimuat.", 500);
  }
}
