import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL belum diatur.");
  process.exit(1);
}

const sql = neon(databaseUrl);
await sql`ALTER TABLE tutor_checkins ADD COLUMN IF NOT EXISTS location_label TEXT`;
await sql`CREATE TABLE IF NOT EXISTS geocoding_rate_limit (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  next_request_at TIMESTAMPTZ NOT NULL
)`;
console.log("Kolom nama lokasi check-in siap digunakan.");
