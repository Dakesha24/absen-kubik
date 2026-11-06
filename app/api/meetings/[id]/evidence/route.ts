import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureEvidenceFolder, uploadDriveFile } from "@/lib/drive";
import { accessibleMeeting } from "@/lib/meeting-access";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("tutor");
  if (auth.response) return auth.response;
  const { id } = await context.params;
  try {
    const meeting = await accessibleMeeting(id, auth.user!);
    if (!meeting) return jsonError("Pertemuan tidak ditemukan atau tidak ditugaskan kepada Anda.", 404);
    if (meeting.status === "cancelled" || meeting.status === "completed") return jsonError("Dokumentasi tidak dapat ditambahkan ke pertemuan ini.", 409);
    const checkin = await db()`
      SELECT id FROM tutor_checkins WHERE meeting_id = ${id} AND tutor_id = ${auth.user!.id} LIMIT 1
    `;
    if (!checkin.length) return jsonError("Lakukan check-in lokasi sebelum mengirim dokumentasi.", 409);
    const form = await request.formData();
    const fileValue = form.get("file");
    if (!(fileValue instanceof File)) return jsonError("Pilih berkas dokumentasi terlebih dahulu.");
    const file = fileValue;
    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
    if (!allowedTypes.has(file.type)) return jsonError("Jenis berkas yang didukung: JPG, PNG, WebP, dan PDF.");
    if (file.size < 1 || file.size > 3 * 1024 * 1024) return jsonError("Ukuran berkas maksimal 3 MB. Kompres foto sebelum mengunggah.");

    const safeName = file.name.replace(/[\\/]/g, "_").replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 140) || "dokumentasi";
    const namedFile = new File([file], safeName, { type: file.type });
    const folder = await ensureEvidenceFolder(meeting.class_name, String(meeting.meeting_date), meeting.starts_at, meeting.drive_folder_id, meeting.id, meeting.class_id, meeting.meeting_number);
    if (!meeting.drive_folder_id) {
      await db()`
        UPDATE meetings SET drive_folder_id = ${folder.id} WHERE id = ${id} AND drive_folder_id IS NULL
      `;
    }
    const uploaded = await uploadDriveFile(folder.id, folder.token, namedFile);
    const rows = await db()`
      INSERT INTO evidence_files (meeting_id, uploaded_by, drive_file_id, name, mime_type, size_bytes, web_view_link)
      VALUES (${id}, ${auth.user!.id}, ${uploaded.id}, ${uploaded.name}, ${uploaded.mimeType || file.type}, ${Number(uploaded.size || file.size)}, ${uploaded.webViewLink || null})
      RETURNING id, name, mime_type, size_bytes, web_view_link, created_at
    `;
    return Response.json({ evidence: rows[0] }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Gagal mengirim dokumentasi.", 500);
  }
}
