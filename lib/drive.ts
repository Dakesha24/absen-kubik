import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { effectiveDriveSettings } from "@/lib/drive-settings";
import { db } from "@/lib/db";

type DriveFile = { id: string; name: string; mimeType?: string; size?: string; webViewLink?: string; parents?: string[] };

async function accessToken() {
  const config = await effectiveDriveSettings();
  if (!config) throw new Error("Google Drive belum dikonfigurasi. Hubungi admin.");
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const result = await response.json() as { access_token?: string; error_description?: string };
  if (!response.ok || !result.access_token) throw new Error("Otorisasi Google Drive gagal. Periksa kredensial dan refresh token di pengaturan admin.");
  return result.access_token;
}

export async function createDriveResumableUpload(folderId: string, token: string, file: { name: string; mimeType: string; size: number }) {
  const query = new URLSearchParams({
    uploadType: "resumable",
    supportsAllDrives: "true",
    fields: "id,name,mimeType,size,webViewLink,parents",
  });
  const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files?${query}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": file.mimeType,
      "X-Upload-Content-Length": String(file.size),
    },
    body: JSON.stringify({ name: file.name, mimeType: file.mimeType, parents: [folderId] }),
    cache: "no-store",
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(result.error?.message || "Tidak dapat menyiapkan unggahan video ke Google Drive.");
  }
  const sessionUrl = response.headers.get("location");
  if (!sessionUrl) throw new Error("Google Drive tidak memberikan sesi unggah video.");
  return sessionUrl;
}

export async function getDriveFile(token: string, fileId: string): Promise<DriveFile> {
  const query = new URLSearchParams({ supportsAllDrives: "true", fields: "id,name,mimeType,size,webViewLink,parents" });
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const result = await response.json() as DriveFile & { error?: { message?: string } };
  if (!response.ok || !result.id) throw new Error(result.error?.message || "Tidak dapat memverifikasi video di Google Drive.");
  return result;
}

export async function getDriveAccessToken() {
  return accessToken();
}

function escapeDriveQuery(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

async function findOrCreateFolder(token: string, name: string, parentId?: string): Promise<string> {
  // Serialize folder creation across serverless instances, including different meetings.
  const lockKey = "drive-folder-lock:" + createHash("sha256").update(JSON.stringify([parentId || "root", name])).digest("hex");
  const lockOwner = randomUUID();
  let acquired = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const rows = await db()`
      INSERT INTO app_settings (key, encrypted_value, updated_at) VALUES (${lockKey}, ${lockOwner}, NOW())
      ON CONFLICT (key) DO UPDATE SET encrypted_value = EXCLUDED.encrypted_value, updated_at = NOW()
      WHERE app_settings.updated_at < NOW() - INTERVAL '60 seconds'
      RETURNING key
    `;
    if (rows.length) { acquired = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!acquired) throw new Error("Folder dokumentasi sedang disiapkan. Coba unggah lagi sebentar lagi.");
  try {
  const folderKey = lockKey.replace("drive-folder-lock:", "drive-folder-id:");
  const saved = await db()`SELECT encrypted_value FROM app_settings WHERE key = ${folderKey} LIMIT 1`;
  if (saved.length) {
    const savedId = String(saved[0].encrypted_value);
    const metadataResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(savedId)}?supportsAllDrives=true&fields=id,name,mimeType,trashed,parents`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(15000),
    });
    if (metadataResponse.ok) {
      const folder = await metadataResponse.json() as { id?: string; name?: string; mimeType?: string; trashed?: boolean; parents?: string[] };
      if (folder.id && folder.name === name && folder.mimeType === "application/vnd.google-apps.folder" && !folder.trashed && (parentId ? folder.parents?.includes(parentId) : true)) return folder.id;
    } else if (metadataResponse.status !== 404) {
      throw new Error("Gagal memeriksa folder dokumentasi di Google Drive.");
    }
    await db()`DELETE FROM app_settings WHERE key = ${folderKey}`;
  }
  const clauses = [
    `name = '${escapeDriveQuery(name)}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
  ];
  if (parentId) clauses.push(`'${escapeDriveQuery(parentId)}' in parents`);
  else clauses.push("'root' in parents");
  const query = new URLSearchParams({ q: clauses.join(" and "), pageSize: "10", orderBy: "createdTime", fields: "files(id,name)", supportsAllDrives: "true", includeItemsFromAllDrives: "true", corpora: "allDrives" });
  const searchResponse = await fetch(`https://www.googleapis.com/drive/v3/files?${query}`, {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(15000),
  });
  const found = await searchResponse.json() as { files?: Array<{ id: string }> };
  if (!searchResponse.ok) throw new Error("Gagal mencari folder di Google Drive.");
  if (found.files?.[0]?.id) {
    const id = found.files[0].id;
    await db()`INSERT INTO app_settings (key, encrypted_value, updated_at) VALUES (${folderKey}, ${id}, NOW()) ON CONFLICT (key) DO UPDATE SET encrypted_value = EXCLUDED.encrypted_value, updated_at = NOW()`;
    return id;
  }

  const createResponse = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", ...(parentId ? { parents: [parentId] } : {}) }),
    cache: "no-store", signal: AbortSignal.timeout(15000),
  });
  const created = await createResponse.json() as { id?: string };
  if (!createResponse.ok || !created.id) throw new Error("Gagal membuat folder Google Drive.");
  await db()`INSERT INTO app_settings (key, encrypted_value, updated_at) VALUES (${folderKey}, ${created.id}, NOW()) ON CONFLICT (key) DO UPDATE SET encrypted_value = EXCLUDED.encrypted_value, updated_at = NOW()`;
  return created.id;
  } finally {
    await db()`DELETE FROM app_settings WHERE key = ${lockKey} AND encrypted_value = ${lockOwner}`;
  }
}

export async function ensureEvidenceFolder(className: string, meetingDate: string, startsAt: string | null, existingFolderId: string | null) {
  if (typeof meetingDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(meetingDate)) {
    throw new Error("Tanggal pertemuan tidak valid. Muat ulang aplikasi atau mulai ulang server, lalu coba lagi.");
  }
  const dateValue = new Date(`${meetingDate}T00:00:00+07:00`);
  if (Number.isNaN(dateValue.getTime())) throw new Error("Tanggal pertemuan tidak valid. Hubungi admin.");
  const token = await accessToken();
  if (existingFolderId) return { id: existingFolderId, token };
  const config = await effectiveDriveSettings();
  const root = config?.rootFolderId || await findOrCreateFolder(token, "ABSEN-KUBIK");
  const parts = className.split(/\s+[—–]\s+/);
  const school = parts.length > 1 ? parts[0].trim() : "Sekolah lainnya";
  const name = parts.length > 1 ? parts.slice(1).join(" — ").trim() : className;
  const time = startsAt ? new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(startsAt)).replace(":", ".") + " WIB" : "Tanpa jadwal";
  const schoolFolder = await findOrCreateFolder(token, school, root);
  const classFolder = await findOrCreateFolder(token, `${name} - ${time}`, schoolFolder);
  const dateName = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(dateValue);
  const meetingFolder = await findOrCreateFolder(token, dateName, classFolder);
  return { id: meetingFolder, token };
}

export async function checkDriveConnection() {
  const config = await effectiveDriveSettings();
  if (!config) throw new Error("Google Drive belum dikonfigurasi.");
  const token = await accessToken();
  const target = config.rootFolderId || "root";
  const query = new URLSearchParams({ supportsAllDrives: "true", fields: "id,mimeType,capabilities(canAddChildren)" });
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(target)}?${query}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  const result = await response.json().catch(() => ({})) as { mimeType?: string; capabilities?: { canAddChildren?: boolean } };
  if (!response.ok || result.mimeType !== "application/vnd.google-apps.folder") throw new Error("Folder Google Drive tidak dapat diakses. Periksa ID folder dan izin akun Google.");
  if (!result.capabilities?.canAddChildren) throw new Error("Akun Google tidak memiliki izin menambahkan file ke folder tersebut.");
}

export async function uploadDriveFile(folderId: string, token: string, file: File): Promise<DriveFile> {
  const bytes = Buffer.from(await file.arrayBuffer());
  const boundary = `kubik_${randomBytes(18).toString("hex")}`;
  const metadata = JSON.stringify({ name: file.name, mimeType: file.type, parents: [folderId] });
  const parts = [
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${file.type}\r\nContent-Transfer-Encoding: binary\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--`),
  ];
  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,size,webViewLink", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body: Buffer.concat(parts),
    cache: "no-store",
  });
  const result = await response.json() as DriveFile & { error?: { message?: string } };
  if (!response.ok || !result.id) throw new Error(result.error?.message || "Gagal mengunggah dokumentasi ke Google Drive.");
  return result;
}
