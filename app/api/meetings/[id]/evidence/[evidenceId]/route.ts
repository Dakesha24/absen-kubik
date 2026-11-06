import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDriveAccessToken } from "@/lib/drive";
import { jsonError, validUuid } from "@/lib/http";
import { accessibleMeeting } from "@/lib/meeting-access";

export const runtime = "nodejs";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string; evidenceId: string }> }) {
  const auth = await requireRole("tutor");
  if (auth.response) return auth.response;
  const { id, evidenceId } = await context.params;
  if (!validUuid(id) || !validUuid(evidenceId)) return jsonError("Data dokumentasi tidak valid.");
  try {
    const meeting = await accessibleMeeting(id, auth.user!);
    if (!meeting) return jsonError("Pertemuan tidak ditemukan atau tidak ditugaskan kepada Anda.", 404);
    if (meeting.status !== "scheduled") return jsonError("Dokumentasi hanya dapat dihapus sebelum absensi dikirim.", 409);
    const token = await getDriveAccessToken();
    const removed = await db()`
      WITH target AS (
        SELECT id FROM meetings WHERE id = ${id} AND tutor_id = ${auth.user!.id} AND status = 'scheduled' FOR UPDATE
      )
      DELETE FROM evidence_files ef USING target
      WHERE ef.id = ${evidenceId} AND ef.meeting_id = target.id AND ef.uploaded_by = ${auth.user!.id}
      RETURNING ef.drive_file_id
    `;
    if (!removed.length) return jsonError("Dokumentasi tidak ditemukan atau absensi sudah dikirim. Muat ulang halaman.", 409);
    try {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(removed[0].drive_file_id)}?supportsAllDrives=true`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ trashed: true }), cache: "no-store",
      });
      if (!response.ok && response.status !== 404) throw new Error("Drive gagal memindahkan berkas ke sampah.");
    } catch {
      return Response.json({ warning: "Dokumentasi sudah dihapus dari absensi, tetapi berkas belum berhasil dipindahkan ke sampah Google Drive. Hubungi admin." });
    }
    return Response.json({ success: true });
  } catch {
    return jsonError("Dokumentasi belum dapat dihapus. Periksa koneksi Google Drive dan coba lagi.", 500);
  }
}
