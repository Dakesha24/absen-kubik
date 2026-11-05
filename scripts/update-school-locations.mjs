import { neon } from "@neondatabase/serverless";
import { schoolClasses } from "./school-location-data.mjs";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL belum diisi di .env.local.");
  process.exit(1);
}

const sql = neon(databaseUrl);
let updated = 0;

for (const kubikClass of schoolClasses) {
  const rows = await sql`
    UPDATE classes
    SET location_name = ${kubikClass.locationName},
        latitude = ${kubikClass.latitude},
        longitude = ${kubikClass.longitude},
        radius_m = ${kubikClass.radiusM}
    WHERE name = ${kubikClass.name}
    RETURNING id
  `;
  updated += rows.length;
}

console.log(`Lokasi kelas diperbarui: ${updated}/${schoolClasses.length}`);
if (updated !== schoolClasses.length) {
  console.error("Sebagian kelas belum ditemukan. Pastikan data kelas awal sudah dimasukkan.");
  process.exitCode = 1;
}
