import { copyFile, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env.local");
const examplePath = resolve(root, ".env.example");

try {
  await readFile(envPath, "utf8");
} catch {
  await copyFile(examplePath, envPath);
}

const original = (await readFile(envPath, "utf8")).replace(/^\uFEFF/, "");
const newline = original.includes("\r\n") ? "\r\n" : "\n";
const lines = original.split(/\r?\n/);

function get(key) {
  const line = lines.find((value) => value.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).trim() : "";
}

function set(key, value) {
  const index = lines.findIndex((line) => line.startsWith(`${key}=`));
  if (index < 0) lines.push(`${key}=${value}`);
  else lines[index] = `${key}=${value}`;
}

if (!get("SESSION_SECRET") || get("SESSION_SECRET").startsWith("replace-")) {
  set("SESSION_SECRET", randomBytes(32).toString("hex"));
}
if (!get("BOOTSTRAP_ADMIN_PASSWORD") || get("BOOTSTRAP_ADMIN_PASSWORD").startsWith("change-this")) {
  set("BOOTSTRAP_ADMIN_PASSWORD", randomBytes(24).toString("hex"));
}
if (!get("BOOTSTRAP_ADMIN_NAME")) set("BOOTSTRAP_ADMIN_NAME", "Administrator");
if (!get("BOOTSTRAP_ADMIN_EMAIL") || get("BOOTSTRAP_ADMIN_EMAIL") === "admin@example.com") {
  set("BOOTSTRAP_ADMIN_EMAIL", "admin@kubik.local");
}

await writeFile(envPath, `${lines.join(newline).replace(/\n+$/, "")}${newline}`, "utf8");

console.log("File .env.local disiapkan. Nilai rahasia tidak ditampilkan.");
for (const key of ["DATABASE_URL", "SESSION_SECRET", "BOOTSTRAP_ADMIN_NAME", "BOOTSTRAP_ADMIN_EMAIL", "BOOTSTRAP_ADMIN_PASSWORD", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"]) {
  const value = get(key);
  const configured = Boolean(value) && !(key === "DATABASE_URL" && value.includes("USER:PASSWORD"));
  console.log(`${key}: ${configured ? "terisi" : "belum diisi"}`);
}
