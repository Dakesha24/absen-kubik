const keys = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"];
const missing = keys.filter((key) => !process.env[key]);
if (missing.length) {
  console.log(`Google Drive belum dikonfigurasi. Isi: ${missing.join(", ")}`);
  process.exit(1);
}

try {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const tokenData = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenData.access_token) {
    console.log("Google OAuth gagal memperbarui token. Periksa Client ID, Client Secret, dan Refresh Token.");
    process.exit(1);
  }

  const headers = { Authorization: `Bearer ${tokenData.access_token}` };
  let driveResponse;
  if (process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID) {
    const query = new URLSearchParams({ supportsAllDrives: "true", fields: "id,name,mimeType" });
    driveResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID)}?${query}`, { headers, cache: "no-store" });
    const folder = await driveResponse.json().catch(() => ({}));
    if (!driveResponse.ok || folder.mimeType !== "application/vnd.google-apps.folder") {
      console.log("Token Google valid, tetapi folder Drive yang dikonfigurasi tidak dapat diakses.");
      process.exit(1);
    }
    console.log("Google Drive terhubung; folder dokumentasi dapat diakses.");
  } else {
    const query = new URLSearchParams({
      q: "name = 'ABSEN-KUBIK' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and 'root' in parents",
      pageSize: "1",
      fields: "files(id)",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      corpora: "allDrives",
    });
    driveResponse = await fetch(`https://www.googleapis.com/drive/v3/files?${query}`, { headers, cache: "no-store" });
    if (!driveResponse.ok) {
      console.log("Token Google valid, tetapi Google Drive API tidak dapat diakses.");
      process.exit(1);
    }
    console.log("Google Drive terhubung; pemeriksaan akses baca berhasil.");
  }
} catch {
  console.log("Pemeriksaan Google Drive gagal karena koneksi jaringan atau layanan tidak tersedia.");
  process.exit(1);
}
