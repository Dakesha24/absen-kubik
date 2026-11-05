import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL belum diatur.");
const sql = neon(process.env.DATABASE_URL);
await sql`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ`;
console.log("Kolom waktu pengiriman absensi siap digunakan.");
