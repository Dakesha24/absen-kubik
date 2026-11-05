import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL belum diisi di .env.local.");
  process.exit(1);
}

const groups = [
  {
    className: "SD Islam Cendekia Muda — Scratch Jr/Beginner — Bawah",
    students: [
      ["Arnasthya Zaara Sheza", "Zaara"],
      ["Ansyanendra Aunurullah Putra Purnomo", "Aunu"],
      ["Jinan Orina Arfin", "Jinan"],
      ["Muhammad Rafa Ferdiansyah", "Rafa"],
      ["Jan Tasaka Subagya", "Saka"],
      ["Umar Hamza Abdurasyid", "Umar"],
      ["Muhammad Zayn Aryadi", "Zayn"],
      ["Adreena Syafa Nunza", "Syafa"],
      ["Aksa Taamir Dawala", "Aksa"],
      ["Kanaya Zafirah Ayunindya", "Nanay"],
      ["Asya Hanania Rizqi", "Caca"],
      ["Aby Kassabian Ramadhani", "Bian"],
      ["Khalil Muhammad Azzam", "Azzam"],
      ["Aldebaran Lokasvara Ash Shiddiq", "Al/Alde"],
      ["Khalisa Yumna Setyadi", "Khalisa"],
    ],
  },
  {
    className: "SD Islam Cendekia Muda — Scratch Intermediate — Bawah",
    moveFromClassName: "SD Islam Cendekia Muda — PictoBlox/Roblox — Atas",
    students: [
      ["Haidar Shawqi Zeroun", "Shawqi"],
      ["Muhammad Keandra Adhiyarzo", "Kean"],
      ["Ilyas Arfan Hamizan", "Ilyas"],
      ["Muhammad Prabu Arunanta Widodo", "Bubu"],
      ["Narendra Arsyad Renjana", "Naren"],
      ["Rd Abdurrahman Saleh", "Babam"],
      ["Akhtar Muhammad Hamzah", "Akhtar"],
    ],
  },
];

const sql = neon(databaseUrl);
let insertedCount = 0;
let movedCount = 0;

for (const group of groups) {
  const classes = await sql`SELECT id FROM classes WHERE name = ${group.className} AND active = TRUE LIMIT 1`;
  if (!classes[0]) throw new Error(`Kelas aktif tidak ditemukan: ${group.className}`);
  const classId = String(classes[0].id);
  let sourceClassId = null;
  if (group.moveFromClassName) {
    const sourceClasses = await sql`SELECT id FROM classes WHERE name = ${group.moveFromClassName} LIMIT 1`;
    if (!sourceClasses[0]) throw new Error(`Kelas asal siswa tidak ditemukan: ${group.moveFromClassName}`);
    sourceClassId = String(sourceClasses[0].id);
  }

  for (const [fullName, nickname] of group.students) {
    const displayName = `${fullName} (${nickname})`;
    const existingTarget = await sql`
      SELECT s.id
      FROM students s
      JOIN class_students cs ON cs.student_id = s.id
      WHERE cs.class_id = ${classId} AND LOWER(s.name) = LOWER(${displayName})
      LIMIT 1
    `;

    let studentId;
    if (existingTarget[0]) studentId = String(existingTarget[0].id);
    if (!studentId && sourceClassId) {
      const existingSource = await sql`
        SELECT s.id
        FROM students s
        JOIN class_students cs ON cs.student_id = s.id
        WHERE cs.class_id = ${sourceClassId} AND LOWER(s.name) = LOWER(${displayName})
        LIMIT 1
      `;
      if (existingSource[0]) studentId = String(existingSource[0].id);
    }
    if (!studentId) {
      const created = await sql`INSERT INTO students (name) VALUES (${displayName}) RETURNING id`;
      studentId = String(created[0].id);
      insertedCount += 1;
    }
    await sql`
      INSERT INTO class_students (class_id, student_id, active)
      VALUES (${classId}, ${studentId}, TRUE)
      ON CONFLICT (class_id, student_id) DO UPDATE SET active = TRUE
    `;
    if (sourceClassId && sourceClassId !== classId) {
      const moved = await sql`
        UPDATE class_students SET active = FALSE
        WHERE class_id = ${sourceClassId} AND student_id = ${studentId} AND active = TRUE
        RETURNING student_id
      `;
      movedCount += moved.length;
    }
  }
  const roster = await sql`
    SELECT COUNT(*)::int AS count FROM class_students
    WHERE class_id = ${classId} AND active = TRUE
  `;
  console.log(`${group.className}: ${Number(roster[0]?.count ?? 0)} siswa aktif`);
}

console.log(`Siswa baru pada proses ini: ${insertedCount}`);
console.log(`Keanggotaan siswa dipindahkan dari kelas lama: ${movedCount}`);
