// Koordinat lokasi diambil dari peta/data sekolah, bukan perkiraan radius.
const locations = {
  firdaus: {
    locationName: "Taman Pendidikan Firdaus Percikan Iman — Kompleks, Jl. Gegerkalong Permai, Jl. Bukit Firdaus No. 9, Ciwaruga, Kec. Parongpong, Kabupaten Bandung Barat, Jawa Barat 40559",
    latitude: -6.8594,
    longitude: 107.579,
    radiusM: 100,
  },
  cendekiaAtas: {
    locationName: "SD Cendekia Muda Atas — Jl. Puri Ayu Pratama No. 17, Sukamiskin, Kec. Arcamanik, Kota Bandung, Jawa Barat 40293",
    latitude: -6.9213,
    longitude: 107.6752,
    radiusM: 100,
  },
  cendekiaBawah: {
    locationName: "SD Cendekia Muda Bawah — Jl. Arcamanik Endah No. 35, Sukamiskin, Kec. Arcamanik, Kota Bandung, Jawa Barat 40293",
    latitude: -6.9154093,
    longitude: 107.6769922,
    radiusM: 100,
  },
  tunasUnggul: {
    locationName: "Playground Tunas Unggul — Jl. Pasir Impun No. 94, Pasir Impun, Kec. Mandalajati, Kota Bandung, Jawa Barat 40195",
    latitude: -6.8942,
    longitude: 107.6778,
    radiusM: 100,
  },
};

const classDefinitions = [
  { school: "SD Firdaus Percikan Iman", category: "Scratch Beginner", level: "Bawah", location: "firdaus" },
  { school: "SD Firdaus Percikan Iman", category: "Scratch Intermediate", level: "Bawah", location: "firdaus" },
  { school: "SD Firdaus Percikan Iman", category: "PictoBlox/Roblox", level: "Atas", location: "firdaus" },
  { school: "SD Islam Cendekia Muda", category: "Scratch Jr/Beginner", level: "Bawah", location: "cendekiaBawah" },
  { school: "SD Islam Cendekia Muda", category: "Scratch Intermediate", level: "Bawah", location: "cendekiaBawah" },
  { school: "SD Islam Cendekia Muda", category: "PictoBlox/Roblox", level: "Atas", location: "cendekiaAtas" },
  { school: "SD Tunas Unggul", category: "PictoBlox Beginner", level: "Bawah", location: "tunasUnggul" },
  { school: "SD Tunas Unggul", category: "PictoBlox Intermediate", level: "Bawah", location: "tunasUnggul" },
  { school: "SD Tunas Unggul", category: "Roblox Beginner", level: "Atas", location: "tunasUnggul" },
  { school: "SD Tunas Unggul", category: "Roblox Intermediate", level: "Atas", location: "tunasUnggul" },
];

export const schoolClasses = classDefinitions.map((item) => ({
  name: `${item.school} — ${item.category} — ${item.level}`,
  description: null,
  ...locations[item.location],
}));
