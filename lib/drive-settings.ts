import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { db } from "@/lib/db";

export type DriveSettings = { clientId: string; clientSecret: string; refreshToken: string; rootFolderId: string };

export function settingsKeyAvailable() {
  const value = process.env.SETTINGS_ENCRYPTION_KEY || "";
  return /^[A-Za-z0-9+/]{43}=$/.test(value) && Buffer.from(value, "base64").length === 32;
}

function encryptionKey() {
  if (!settingsKeyAvailable()) throw new Error("Kunci pengaturan belum dikonfigurasi di server. Hubungi pengelola aplikasi.");
  return Buffer.from(process.env.SETTINGS_ENCRYPTION_KEY!, "base64");
}

export async function savedDriveSettings(): Promise<DriveSettings | null> {
  let rows;
  try { rows = await db()`SELECT encrypted_value FROM app_settings WHERE key = 'google_drive'`; }
  catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "42P01") return null;
    throw error;
  }
  if (!rows.length) return null;
  const [version, iv, tag, ciphertext] = String(rows[0].encrypted_value).split(":");
  if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error("Pengaturan Google Drive tidak dapat dibaca.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8")) as DriveSettings;
  } catch { throw new Error("Pengaturan Google Drive tidak dapat dibuka. Periksa kunci enkripsi server."); }
}

export async function effectiveDriveSettings(): Promise<DriveSettings | null> {
  const saved = await savedDriveSettings();
  if (saved) return saved;
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_DRIVE_ROOT_FOLDER_ID } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) return null;
  return { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET, refreshToken: GOOGLE_REFRESH_TOKEN, rootFolderId: GOOGLE_DRIVE_ROOT_FOLDER_ID || "" };
}

export async function saveDriveSettings(settings: DriveSettings) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(settings), "utf8"), cipher.final()]);
  const value = ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(":");
  await db()`INSERT INTO app_settings (key, encrypted_value) VALUES ('google_drive', ${value}) ON CONFLICT (key) DO UPDATE SET encrypted_value = EXCLUDED.encrypted_value, updated_at = NOW()`;
}
