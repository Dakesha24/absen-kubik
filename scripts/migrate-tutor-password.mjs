import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL belum diatur.");
  process.exit(1);
}

const sql = neon(databaseUrl);
await sql`ALTER TABLE app_users ALTER COLUMN password_hash DROP NOT NULL`;
await sql`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS tutor_password_set BOOLEAN NOT NULL DEFAULT FALSE`;
console.log("Tutor kini dapat mengatur kata sandi dari menu Profil.");
