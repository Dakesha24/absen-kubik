import { neon } from "@neondatabase/serverless";

const requiredTables = [
  "app_users", "classes", "class_schedules", "students", "class_students", "meetings",
  "tutor_checkins", "geocoding_rate_limit", "attendance_records", "evidence_files",
];

const checks = {
  DATABASE_URL: Boolean(process.env.DATABASE_URL),
  SESSION_SECRET: Boolean(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32),
  BOOTSTRAP_ADMIN_EMAIL: Boolean(process.env.BOOTSTRAP_ADMIN_EMAIL && process.env.BOOTSTRAP_ADMIN_EMAIL !== "admin@example.com"),
  BOOTSTRAP_ADMIN_PASSWORD: Boolean(process.env.BOOTSTRAP_ADMIN_PASSWORD && process.env.BOOTSTRAP_ADMIN_PASSWORD.length >= 12),
  GOOGLE_DRIVE_OAUTH: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN),
};

for (const [name, ready] of Object.entries(checks)) {
  console.log(`${name}: ${ready ? "siap" : "belum"}`);
}

if (!checks.DATABASE_URL) {
  console.log("Neon: belum diperiksa karena DATABASE_URL belum diisi.");
  process.exitCode = 1;
} else {
  try {
    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
    const existing = new Set(rows.map((row) => String(row.table_name)));
    const missing = requiredTables.filter((table) => !existing.has(table));
    const checkinColumns = await sql`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tutor_checkins'`;
    const hasLocationLabel = checkinColumns.some((column) => String(column.column_name) === "location_label");
    console.log(`Koneksi Neon: berhasil`);
    const schemaProblems = [...missing, ...(!hasLocationLabel ? ["tutor_checkins.location_label"] : [])];
    console.log(`Skema database: ${schemaProblems.length ? `belum lengkap (${schemaProblems.join(", ")})` : "lengkap"}`);
    if (!schemaProblems.length) {
      const admins = await sql`SELECT COUNT(*)::int AS count FROM app_users WHERE role = 'admin' AND active = TRUE`;
      console.log(`Akun admin aktif: ${Number(admins[0]?.count) > 0 ? "ada" : "belum ada"}`);
      if (Number(admins[0]?.count) === 0) process.exitCode = 1;
    } else {
      process.exitCode = 1;
    }
  } catch {
    console.log("Koneksi Neon: gagal. Periksa DATABASE_URL dan izinkan koneksi jaringan.");
    process.exitCode = 1;
  }
}

console.log("Deploy Vercel: periksa terpisah bahwa environment variables sudah ditambahkan di Vercel.");
