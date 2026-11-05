import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL belum diatur.");
const sql = neon(process.env.DATABASE_URL);
const schema = await readFile(new URL("../db/migrations/20261105_weekly_class_schedules.sql", import.meta.url), "utf8");
await sql.query(schema);
console.log("Tabel jadwal mingguan kelas siap. Riwayat pertemuan tetap tersimpan.");
