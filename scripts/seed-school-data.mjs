import { neon } from "@neondatabase/serverless";
import { schoolClasses } from "./school-location-data.mjs";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL belum diisi di .env.local.");
  process.exit(1);
}

const tutors = [
  { name: "Yesha Rahma Oktavia (Yesha)" },
  { name: "Kania Lisdiana, M.Pd (Kania)" },
  { name: "Khairunnisa (Nisa)" },
  { name: "Yohanda Gita Pratiwi (Tata)" },
  { name: "Danis Keysara Saputra, S.Pd (Danis)" },
  { name: "Salsabila Husaini (Esa)" },
  { name: "Tyka Yulistiany (Tyka)" },
  { name: "Narendra Ridha Baihaqi (Naren)" },
  { name: "Hafsah Hamidah (Hafsah)" },
  { name: "Aldi Prasetyo Widodo, S.Pd (Aldi)" },
  { name: "Alifa Salsabila (Alifa)" },
];

const sql = neon(databaseUrl);
let tutorsAdded = 0;
let classesAdded = 0;

for (const tutor of tutors) {
  const rows = await sql`
    INSERT INTO app_users (name, email, password_hash, tutor_password_set, role)
    SELECT ${tutor.name}, NULL, NULL, FALSE, 'tutor'
    WHERE NOT EXISTS (
      SELECT 1 FROM app_users WHERE role = 'tutor' AND name = ${tutor.name}
    )
    RETURNING id
  `;
  tutorsAdded += rows.length;
}

for (const kubikClass of schoolClasses) {
  const rows = await sql`
    INSERT INTO classes (name, description, location_name, latitude, longitude, radius_m)
    VALUES (${kubikClass.name}, ${kubikClass.description}, ${kubikClass.locationName}, ${kubikClass.latitude}, ${kubikClass.longitude}, ${kubikClass.radiusM})
    ON CONFLICT (name) DO UPDATE SET
      description = CASE
        WHEN classes.description LIKE 'Jadwal rutin:%' AND classes.description LIKE '%Pengajar:%' THEN EXCLUDED.description
        ELSE classes.description
      END,
      location_name = EXCLUDED.location_name,
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      radius_m = EXCLUDED.radius_m
    RETURNING id
  `;
  classesAdded += rows.length;
}

console.log(`Tutor ditambahkan: ${tutorsAdded}/${tutors.length}`);
console.log(`Kelas ditambahkan atau dilengkapi: ${classesAdded}/${schoolClasses.length}`);
console.log("Data siswa belum dimasukkan karena daftar siswa tidak ada di sumber.");
