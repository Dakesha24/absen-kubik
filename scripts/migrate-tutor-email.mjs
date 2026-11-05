import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL belum diatur.");
  process.exit(1);
}

const sql = neon(databaseUrl);
await sql`ALTER TABLE app_users ALTER COLUMN email DROP NOT NULL`;
const rows = await sql`UPDATE app_users SET email = NULL WHERE role = 'tutor' RETURNING id`;
console.log(`Email tutor dikosongkan: ${rows.length} akun.`);
