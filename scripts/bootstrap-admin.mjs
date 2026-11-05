import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";

const databaseUrl = process.env.DATABASE_URL;
const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "Administrator";
const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

if (!databaseUrl || !email || !password || password.length < 12) {
  console.error("Isi DATABASE_URL, BOOTSTRAP_ADMIN_EMAIL, dan BOOTSTRAP_ADMIN_PASSWORD (minimal 12 karakter) terlebih dahulu.");
  process.exit(1);
}

const sql = neon(databaseUrl);
const passwordHash = await bcrypt.hash(password, 12);
const rows = await sql`
  INSERT INTO app_users (name, email, password_hash, role)
  VALUES (${name}, ${email}, ${passwordHash}, 'admin')
  ON CONFLICT (email) DO NOTHING
  RETURNING id, email
`;

if (rows.length) console.log(`Akun admin dibuat: ${email}`);
else console.log(`Akun ${email} sudah ada; tidak ada perubahan.`);
