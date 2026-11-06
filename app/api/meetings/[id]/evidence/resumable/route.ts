import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonError, readJson } from "@/lib/http";
import { accessibleMeeting } from "@/lib/meeting-access";
import { createDriveResumableUpload, ensureEvidenceFolder, getDriveFile } from "@/lib/drive";
import { createHash } from "node:crypto";
import { EncryptJWT, jwtDecrypt } from "jose";

export const runtime = "nodejs";

const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_CHUNK_BYTES = 4 * 1024 * 1024;
const ALLOWED_VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

function uploadKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("Konfigurasi sesi unggah belum tersedia.");
  return createHash("sha256").update("drive-upload-v1:").update(secret).digest();
}

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

      const folder = await ensureEvidenceFolder(meeting.class_name, String(meeting.meeting_date), meeting.starts_at, meeting.drive_folder_id, meeting.id, meeting.class_id, meeting.meeting_number);
      await saveFolderId(id, meeting.drive_folder_id, folder.id);
      const sessionUrl = await createDriveResumableUpload(folder.id, folder.token, {
        name: safeFileName(input.name), mimeType: input.mimeType, size: input.size,
      });
      const uploadToken = await new EncryptJWT({ sessionUrl, meetingId: id, tutorId: auth.user!.id, size: input.size, mimeType: input.mimeType })
        .setProtectedHeader({ alg: "dir", enc: "A256GCM" }).setIssuedAt().setExpirationTime("2h").encrypt(uploadKey());
      return Response.json({ uploadToken }, { status: 201, headers: { "Cache-Control": "no-store" } });
    }

    if (input.action !== "complete" || typeof input.fileId !== "string" || input.fileId.length > 300) {
      return jsonError("Permintaan unggah video tidak valid.");
    }

    const folder = await ensureEvidenceFolder(meeting.class_name, String(meeting.meeting_date), meeting.starts_at, meeting.drive_folder_id, meeting.id, meeting.class_id, meeting.meeting_number);
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

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("tutor");
  if (auth.response) return auth.response;
  const { id } = await context.params;
  const token = request.headers.get("x-upload-token");
  const range = request.headers.get("content-range");
  if (!token || token.length > 8192 || !range) return jsonError("Sesi unggah tidak valid.");
  try {
    const { payload } = await jwtDecrypt(token, uploadKey(), { keyManagementAlgorithms: ["dir"], contentEncryptionAlgorithms: ["A256GCM"] });
    if (payload.meetingId !== id || payload.tutorId !== auth.user!.id || typeof payload.sessionUrl !== "string" || typeof payload.size !== "number" || typeof payload.mimeType !== "string" || !ALLOWED_VIDEO_TYPES.has(payload.mimeType)) return jsonError("Sesi unggah tidak valid.", 403);
    const url = new URL(payload.sessionUrl);
    if (url.protocol !== "https:" || url.hostname !== "www.googleapis.com" || url.port || url.username || url.password || url.pathname !== "/upload/drive/v3/files") return jsonError("Sesi unggah tidak valid.", 403);
    const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range);
    if (!match) return jsonError("Rentang unggahan tidak valid.");
    const start = Number(match[1]), end = Number(match[2]), total = Number(match[3]);
    const size = end - start + 1;
    if (![start, end, total].every(Number.isSafeInteger) || total !== payload.size || total < 1 || total > MAX_VIDEO_BYTES || start < 0 || end < start || end >= total || size > MAX_CHUNK_BYTES || (end + 1 < total && size % (256 * 1024) !== 0)) return jsonError("Ukuran potongan video tidak valid.");
    const meeting = await accessibleMeeting(id, auth.user!);
    if (!meeting || meeting.status !== "scheduled") return jsonError("Pertemuan tidak ditemukan atau absensi sudah dikirim.", 409);
    const data = await request.arrayBuffer();
    if (data.byteLength !== size) return jsonError("Ukuran data video tidak sesuai.");
    const response = await fetch(url, { method: "PUT", headers: { "Content-Type": payload.mimeType, "Content-Range": range, "Content-Length": String(size) }, body: data, redirect: "manual", cache: "no-store" });
    if (response.status === 308) {
      const accepted = /^bytes=0-(\d+)$/.exec(response.headers.get("range") || "");
      const next = accepted ? Number(accepted[1]) + 1 : 0;
      if (!Number.isSafeInteger(next) || next <= start || next > end + 1) return jsonError("Google Drive belum mengonfirmasi potongan video. Coba unggah lagi.", 502);
      return Response.json({ next }, { headers: { "Cache-Control": "no-store" } });
    }
    const result = await response.json().catch(() => ({})) as { id?: string };
    if (!response.ok || !result.id) return jsonError("Google Drive gagal menerima video. Coba unggah lagi.", 502);
    return Response.json({ fileId: result.id }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return jsonError("Sesi unggah berakhir atau video gagal dikirim. Coba unggah lagi.", 500);
  }
}
