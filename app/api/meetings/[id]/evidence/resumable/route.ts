import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonError, readJson } from "@/lib/http";
import { accessibleMeeting } from "@/lib/meeting-access";
import { createDriveResumableUpload, ensureEvidenceFolder, getDriveFile } from "@/lib/drive";

export const runtime = "nodejs";

const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const ALLOWED_VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

function safeFileName(value: string) {
  return value.replace(/[\\/]/g, "_").replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 140) || "dokumentasi-video";
}

async function saveFolderId(meetingId: string, existingFolderId: string | null, folderId: string) {
  if (existingFolderId) return;
  await db()`
    UPDATE meetings SET drive_folder_id = ${folderId} WHERE id = ${meetingId} AND drive_folder_id IS NULL
  `;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("tutor");
  if (auth.response) return auth.response;
  const { id } = await context.params;

  try {
    const input = await readJson<Record<string, unknown>>(request);
    if (!input || typeof input !== "object" || (input.action !== "init" && input.action !== "complete")) {
      return jsonError("Permintaan unggah video tidak valid.");
    }
    const meeting = await accessibleMeeting(id, auth.user!);
    if (!meeting) return jsonError("Pertemuan tidak ditemukan atau tidak ditugaskan kepada Anda.", 404);
    if (meeting.status === "cancelled" || meeting.status === "completed") return jsonError("Dokumentasi tidak dapat ditambahkan ke pertemuan ini.", 409);
    const checkin = await db()`
      SELECT id FROM tutor_checkins WHERE meeting_id = ${id} AND tutor_id = ${auth.user!.id} LIMIT 1
    `;
    if (!checkin.length) return jsonError("Lakukan check-in lokasi sebelum mengirim dokumentasi.", 409);

    if (input.action === "init") {
      if (typeof input.name !== "string" || typeof input.mimeType !== "string" || typeof input.size !== "number" || !Number.isSafeInteger(input.size)) {
        return jsonError("Informasi video tidak valid.");
      }
      if (!ALLOWED_VIDEO_TYPES.has(input.mimeType)) return jsonError("Format video yang didukung: MP4, MOV, dan WebM.");
      if (input.size < 1 || input.size > MAX_VIDEO_BYTES) return jsonError("Ukuran maksimal video adalah 100 MB per video.");

      const folder = await ensureEvidenceFolder(meeting.class_name, meeting.meeting_number, String(meeting.meeting_date), meeting.drive_folder_id);
      await saveFolderId(id, meeting.drive_folder_id, folder.id);
      const sessionUrl = await createDriveResumableUpload(folder.id, folder.token, {
        name: safeFileName(input.name), mimeType: input.mimeType, size: input.size,
      });
      return Response.json({ sessionUrl }, { status: 201, headers: { "Cache-Control": "no-store" } });
    }

    if (input.action !== "complete" || typeof input.fileId !== "string" || input.fileId.length > 300) {
      return jsonError("Permintaan unggah video tidak valid.");
    }

    const folder = await ensureEvidenceFolder(meeting.class_name, meeting.meeting_number, String(meeting.meeting_date), meeting.drive_folder_id);
    await saveFolderId(id, meeting.drive_folder_id, folder.id);
    const file = await getDriveFile(folder.token, input.fileId);
    if (!file.parents?.includes(folder.id)) return jsonError("Video tidak berada di folder pertemuan ini.", 403);
    if (!file.mimeType || !ALLOWED_VIDEO_TYPES.has(file.mimeType)) return jsonError("Jenis video di Google Drive tidak valid.");
    const size = Number(file.size);
    if (!Number.isSafeInteger(size) || size < 1 || size > MAX_VIDEO_BYTES) return jsonError("Ukuran video melebihi batas 100 MB.");

    const inserted = await db()`
      INSERT INTO evidence_files (meeting_id, uploaded_by, drive_file_id, name, mime_type, size_bytes, web_view_link)
      VALUES (${id}, ${auth.user!.id}, ${file.id}, ${file.name}, ${file.mimeType}, ${size}, ${file.webViewLink || null})
      ON CONFLICT (drive_file_id) DO NOTHING
      RETURNING id, name, mime_type, size_bytes, web_view_link, created_at
    `;
    if (inserted[0]) return Response.json({ evidence: inserted[0] }, { status: 201 });

    const existing = await db()`
      SELECT id, name, mime_type, size_bytes, web_view_link, created_at
      FROM evidence_files WHERE drive_file_id = ${file.id} AND meeting_id = ${id} LIMIT 1
    `;
    if (!existing[0]) return jsonError("Video sudah terdaftar pada data lain.", 409);
    return Response.json({ evidence: existing[0] }, { status: 200 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Gagal memproses video.", 500);
  }
}
