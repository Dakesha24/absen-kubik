const tutorPhotoPaths: Record<string, string> = {
  yesha: "/images/foto-tutor/yesha.jpg",
  kania: "/images/foto-tutor/kania.jpg",
  nisa: "/images/foto-tutor/khairunnisa.jpg",
  tata: "/images/foto-tutor/yohanda.jpg",
  danis: "/images/foto-tutor/danis.jpg",
  esa: "/images/foto-tutor/salsabila.jpg",
  tyka: "/images/foto-tutor/tyka.jpg",
  naren: "/images/foto-tutor/narendra.jpg",
  aldi: "/images/foto-tutor/aldi.jpg",
  alifa: "/images/foto-tutor/alifa.jpg",
  hafsah: "/images/foto-tutor/hafsah.jpg",
};

function normalizeName(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("id-ID");
}

export function tutorPhotoFor(name: string) {
  const normalized = normalizeName(name);
  if (tutorPhotoPaths[normalized.trim()]) return tutorPhotoPaths[normalized.trim()];
  const alias = normalized.match(/\(([^)]+)\)/)?.[1]?.trim();
  if (alias && tutorPhotoPaths[alias]) return tutorPhotoPaths[alias];

  const fullNameMatches: Array<[string, string]> = [
    ["yesha rahma oktavia", "yesha"],
    ["kania lisdiana", "kania"],
    ["khairunnisa", "nisa"],
    ["yohanda gita pratiwi", "tata"],
    ["danis keysara saputra", "danis"],
    ["salsabila husaini", "esa"],
    ["tyka yulistiany", "tyka"],
    ["narendra ridha baihaqi", "naren"],
    ["aldi prasetyo widodo", "aldi"],
    ["alifa salsabila", "alifa"],
    ["hafsah hamidah", "hafsah"],
  ];
  const match = fullNameMatches.find(([fullName]) => normalized.includes(fullName));
  return match ? tutorPhotoPaths[match[1]] : null;
}
