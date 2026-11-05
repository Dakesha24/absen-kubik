# ABSEN-KUBIK — konteks proyek untuk AI

## Tujuan

Bangun aplikasi absensi kelas untuk tutor ABSEN-KUBIK. Tutor memilih pertemuan kelas yang ditugaskan, mencatat siswa yang tidak hadir, melakukan check-in lokasi, lalu mengirim dokumentasi. Admin mengelola data tutor, siswa, kelas, dan jadwal serta memantau kehadiran tutor pada setiap pertemuan.

## Stack dan batasan yang sudah dipilih

- Framework full-stack: Next.js App Router, React, dan TypeScript. Gunakan `.tsx` untuk UI dan `app/api/**/route.ts` untuk Node.js API Vercel Functions.
- Database driver: `@neondatabase/serverless` dengan query SQL bertag yang terparameterisasi. Skema ada di `db/schema.sql`.
- Autentikasi: kata sandi di-hash dengan bcryptjs; sesi JWT ditandatangani dengan jose dan disimpan dalam cookie HTTP-only.
- Hosting aplikasi: Vercel.
- Database: Neon PostgreSQL.
- Dokumentasi pertemuan: Google Drive melalui Google Drive API.
- Target biaya: mulai dengan layanan gratis. Periksa kuota dan ketentuan paket gratis terkini sebelum memilih layanan atau fitur. Jangan menambahkan layanan berbayar tanpa menjelaskan kebutuhan dan biayanya.
- Jangan mengubah stack menjadi PHP.

Jangan membuat server Node yang berjalan terus-menerus; API harus mengikuti pola Route Handler/Node.js Functions agar sesuai dengan Vercel. Sebelum mengubah struktur aplikasi, periksa dependensi dan skema database yang ada, lalu pertahankan konvensi proyek.

## Peran dan kebutuhan utama

### Admin

- Mengelola akun tutor.
- Mengelola data siswa dan keanggotaan siswa di kelas.
- Mengelola kelas, jadwal, pertemuan, serta penugasan tutor.
- Memantau status kehadiran tutor per pertemuan, absensi siswa, lokasi check-in, dan dokumentasi.

### Tutor

- Memilih tutor dari dropdown di halaman awal untuk membuka sesi demo.
- Memilih kelas aktif dan mengisi presensi pada pertemuan yang ada atau yang dibuat otomatis hari itu.
- Melakukan check-in lokasi untuk pertemuan tersebut.
- Mencatat siswa yang tidak hadir dan keterangan jika diperlukan.
- Mengunggah dokumentasi pertemuan.

## Alur tutor dan tampilan yang disepakati

- Halaman tutor membuka tab Presensi secara default.
- Navigasi tutor berada di bottom bar pada ponsel maupun laptop. Tampilkan ikon tanpa teks; ikon aktif memakai lingkaran biru.
- Sebelum sesi tutor aktif, halaman awal menampilkan dropdown nama tutor aktif. Memilih tutor langsung membuka sesi tutor tanpa kata sandi sesuai permintaan pemilik proyek untuk demo ini. Login admin tetap memakai email dan kata sandi.
- Saat sesi aktif, tampilkan nama tutor pada halaman Presensi.
- Tutor melihat semua kelas aktif yang dimasukkan admin, termasuk yang belum memiliki jadwal. Jika ada jadwal aktif untuk tutor itu, gunakan jadwal berikutnya; jika belum ada, buat pertemuan baru untuk tanggal hari ini dengan nomor pertemuan berikutnya. Tutor hanya memilih nama kelas, bukan tanggal.
- Alur Presensi: ambil dan simpan koordinat lokasi, unggah satu atau beberapa foto ke Google Drive, pilih status tiap siswa menggunakan H (Hadir), S (Sakit), I (Izin), atau A (Alpha), lalu kirim lewat satu tombol akhir.
- Setelah kelas dipilih, ringkasan tutor menampilkan nama kelas dan tanggal saja; jangan tampilkan nomor pertemuan pada ringkasan tersebut.
- Header kartu tutor cukup menampilkan judul utama. Jangan menambahkan label generik atau nomor langkah dan ikon dekoratif di samping judul; simpan ikon untuk tombol aksi yang memerlukannya.
- Saat check-in, tampilkan animasi pelacakan. Cocokkan jarak di server dengan koordinat dan radius sekolah pada kelas yang dipilih; bila di luar radius, tampilkan peringatan merah dengan jarak dan nama sekolah. Jangan mengarang radius; beri tahu tutor jika admin belum mengatur koordinat/radius sekolah.
- Gunakan skala tipografi tutor yang konsisten dan mudah dibaca, termasuk ukuran metadata dan keterangan.
- Data absensi tetap tersimpan per siswa per pertemuan. Foto Drive tetap terhubung ke kelas, nomor pertemuan, dan tanggal yang dijadwalkan admin.

Simpan absensi sebagai data per siswa per pertemuan agar riwayat dan laporan bisa ditelusuri. Jangan hanya menyimpan satu daftar teks nama siswa yang absen.

## Lokasi check-in

- Minta lokasi perangkat melalui browser hanya saat tutor melakukan check-in, dengan penjelasan yang jelas kepada pengguna.
- Simpan latitude, longitude, akurasi, dan waktu pengambilan lokasi bersama catatan check-in tutor.
- Simpan nama area perkiraan dari reverse geocoding sebagai informasi pendukung. Default-nya Nominatim; kirim koordinat yang dibulatkan sekitar 100 meter, batasi permintaan global maksimal satu per detik, tampilkan atribusi OpenStreetMap, dan jangan gagalkan check-in jika pencarian nama area tidak tersedia. URL provider dapat diatur melalui `GEOCODING_REVERSE_URL`.
- Peta check-in ditampilkan dari OpenStreetMap dengan titik peta yang dibulatkan; koordinat presisi tetap disimpan di Neon.
- Akses lokasi browser memerlukan HTTPS dan izin pengguna.
- Jika lokasi kelas dan radius check-in belum dikonfigurasi, jangan mengarang nilai radius atau menolak check-in berdasarkan lokasi.
- Perlakukan koordinat sebagai bukti pendukung; jangan menyatakan bahwa koordinat perangkat menjamin keberadaan fisik tutor.
- Tangani izin lokasi yang ditolak, lokasi tidak tersedia, dan akurasi yang buruk dengan pesan yang dapat dipahami serta alur pencatatan kendala.

## Dokumentasi Google Drive

- Gunakan pola folder yang konsisten, misalnya `ABSEN-KUBIK / [Nama Kelas] / Pertemuan [Nomor] - [YYYY-MM-DD]`.
- Buat folder secara idempoten: pertemuan yang sama tidak boleh menghasilkan folder duplikat saat tutor mengunggah lebih dari satu kali.
- Simpan ID folder dan ID file Drive di Neon, terkait dengan kelas/pertemuan yang benar.
- Simpan rahasia OAuth atau kredensial Google hanya di environment variables server. Jangan kirim kredensial ke browser atau commit rahasia ke Git.
- Terapkan validasi tipe dan ukuran file. Batas ukuran unggahan perlu disesuaikan dengan batas runtime Vercel dan kebutuhan dokumentasi.
- Jangan membuat file publik secara otomatis. Atur akses file/folder sesuai kebutuhan admin.
- Strategi akun Drive (akun pemilik atau Shared Drive) masih perlu dipastikan saat integrasi dibuat.

## Urutan pengembangan yang disarankan

1. Periksa aplikasi yang ada, lalu tetapkan struktur tabel dan relasi berdasarkan model/domain yang sudah digunakan.
2. Selesaikan autentikasi dan otorisasi untuk peran admin dan tutor.
3. Bangun pengelolaan tutor, siswa, kelas, keanggotaan kelas, jadwal, dan penugasan.
4. Bangun alur pertemuan tutor: pilih pertemuan, check-in, isi absensi siswa, dan simpan.
5. Hubungkan unggahan dokumentasi ke Google Drive dan simpan metadata file di database.
6. Bangun halaman admin untuk memantau kehadiran tutor, absensi siswa, dan dokumentasi per pertemuan.
7. Tambahkan laporan dan ekspor setelah alur inti berjalan.

## Prinsip implementasi

- Jaga pemisahan UI React, API server Node.js, dan akses database.
- Semua operasi database dan integrasi Google Drive dilakukan di server, bukan langsung dari browser.
- Otorisasi harus memeriksa peran dan penugasan tutor di server; menyembunyikan tombol di UI saja tidak cukup.
- Gunakan foreign key, unique constraint, dan transaksi untuk mencegah absensi ganda atau data pertemuan yang tidak konsisten.
- Simpan waktu dalam format yang konsisten; tampilkan waktu kepada pengguna dalam zona waktu `Asia/Jakarta`.
- Gunakan label dan pesan antarmuka berbahasa Indonesia.
- Buat perubahan bertahap dan sesuai pola repository. Jangan mengganti framework, menghapus data, atau merombak modul yang tidak terkait tanpa kebutuhan yang jelas.
- Jika keputusan produk belum jelas, gunakan pilihan paling sederhana yang mendukung alur absensi; catat asumsi penting agar mudah dikoreksi.

## Hal yang belum diputuskan

- Apakah autentikasi akan tetap memakai sesi lokal yang sudah dibuat atau beralih ke penyedia identitas.
- Cara aman mengelola/reset kata sandi tutor setelah akun dibuat.
- Status absensi siswa yang akan dipakai selain hadir/tidak hadir.
- Apakah check-in dibatasi dengan koordinat lokasi kelas dan radius tertentu.
- Jenis dokumentasi yang diizinkan, batas ukuran foto, serta kebijakan retensi file.
- Akun Google/Drive yang menjadi pemilik folder dokumentasi.

Periksa repository dan minta keputusan hanya bila salah satu hal tersebut benar-benar memengaruhi implementasi yang sedang dikerjakan.
