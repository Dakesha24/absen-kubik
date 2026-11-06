# ABSEN-KUBIK

Aplikasi absensi kelas untuk tutor dan admin. Frontend React/TypeScript dan API Node.js berjalan sebagai aplikasi Next.js di Vercel; data tersimpan di Neon PostgreSQL dan dokumentasi pertemuan di Google Drive.

## Fitur yang tersedia

- Login admin dan tutor dengan sesi cookie HTTP-only.
- Tutor yang belum memiliki kata sandi dapat masuk dengan memilih nama, lalu mengaturnya dari menu Profil. Setelah diatur, pemilihan tutor meminta kata sandi.
- Admin dapat membuat/nonaktifkan akun tutor tanpa email, membuat siswa, membuat kelas, mengatur anggota kelas, mengatur lokasi/radius check-in, serta menjadwalkan atau membatalkan pertemuan.
- Tutor melihat pertemuan yang ditugaskan, check-in menggunakan lokasi browser, mengisi status tiap siswa, mengunggah dokumentasi, lalu menandai pertemuan selesai.
- Admin dapat memantau check-in, status absensi, jumlah dokumentasi, dan membuka laporan per pertemuan.
- Foto dikompres di browser bila perlu dan ukuran unggahan dibatasi 3 MB per file.

## Menjalankan secara lokal

Persyaratan: Node.js 20.9 atau lebih baru dan akun Neon.

1. Jalankan `npm run env:prepare` untuk membuat/menyiapkan `.env.local` serta menghasilkan `SESSION_SECRET` dan kata sandi admin awal secara lokal. Nilai rahasia tidak ditampilkan oleh skrip. Untuk demo, email awal disetel ke `admin@kubik.local`; ganti bila ingin memakai alamat lain.
2. Jalankan `npm install`.
3. Buka Neon SQL Editor, pilih database proyek, lalu jalankan seluruh isi `db/schema.sql`.
4. Isi `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL`, dan `BOOTSTRAP_ADMIN_PASSWORD` di `.env.local`. Kata sandi admin minimal 12 karakter.
5. Jalankan `npm run db:bootstrap-admin` satu kali untuk membuat akun admin pertama.
6. Jalankan `npm run setup:check` untuk memeriksa nilai konfigurasi, skema Neon, dan akun admin tanpa menampilkan rahasia.
7. Jalankan `npm run dev`, lalu buka alamat lokal yang ditampilkan Next.js.

Jika database sudah terlanjur dibuat dari skema sebelumnya, jalankan `npm run db:migrate-checkin-location-label` untuk menambahkan kolom nama area check-in dan pembatas permintaan geocoding.

Untuk mengizinkan tutor baru membuat kata sandi sendiri dari Profil, jalankan `npm run db:migrate-tutor-password` jika database dibuat sebelum perubahan ini. Setelah migrasi, akun tutor lama dianggap belum mengatur kata sandi; akun itu dapat masuk dengan memilih nama, lalu memakai menu Profil untuk membuat kata sandi.

Untuk mengosongkan email akun tutor lama dan membuat email tutor opsional, jalankan `npm run db:migrate-tutor-email`. Email akun admin tetap digunakan untuk login.

Skrip bootstrap aman dijalankan ulang untuk email yang sama: akun yang sudah ada tidak ditimpa.

Untuk database yang sudah ada, jalankan `npm run db:migrate-weekly-class-schedules` sebelum memakai halaman jadwal mingguan admin.

## Jadwal kelas dan monitoring admin

Halaman awal admin mengikuti komponen tampilan tutor dan menampilkan kelas yang sudah tersimpan per sekolah. Modal jadwal menyimpan hari belajar serta jam mulai/selesai dalam WIB; tidak ada tanggal pertemuan atau penugasan tutor pada jadwal mingguan. Satu kelas memiliki satu jadwal mingguan yang dapat diperbarui lewat **Edit**.

Identitas sekolah mengikuti konvensi nama kelas yang sudah dipakai: `Nama Sekolah — Nama Kelas`, dengan alamat di `location_name`. Siswa baru ditambahkan langsung melalui tombol **Siswa** pada jadwal; tidak ada menu siswa global atau dropdown pilihan siswa. Menu **Monitoring** hanya menampilkan presensi yang sudah disimpan tutor, dengan tanggal pertemuan, nama tutor, waktu check-in, presensi siswa, dan dokumentasi; tersedia filter rentang tanggal.

Check-in dan unggahan selama pengisian disimpan sebagai bagian dari draf pertemuan. Tombol akhir **Simpan absensi** mengirim seluruh status siswa ke endpoint finalisasi. Validasi lokasi, dokumentasi, dan daftar siswa serta penyimpanan absensi dan status selesai berlangsung dalam satu pernyataan SQL. Draf tidak dikirim oleh API laporan admin, dan detail draf tidak dapat dibuka melalui laporan admin. Laporan selesai memakai siswa yang benar-benar disimpan pada pertemuan tersebut, sehingga penambahan siswa berikutnya tidak mengubah riwayat.

Nama sekolah diisi melalui kolom teks dengan saran dropdown dari sekolah yang sudah tersimpan; admin juga bisa langsung mengetik sekolah baru. Nama kelas selalu diisi sebagai teks. Memilih saran sekolah mengisi alamat dan lokasi yang tersedia sebagai awal, dan admin dapat menyesuaikannya. Identitas kelas yang sudah ada dapat diedit melalui modal jadwal tanpa mengganti ID kelas atau riwayatnya.

Pada modal Siswa, admin memilih jumlah siswa yang akan dimasukkan (1–100), mengisi nama dan telepon orang tua opsional untuk setiap siswa, lalu menyimpan semuanya sekaligus. Semua nama divalidasi sebelum penyimpanan; pembuatan siswa dan keanggotaan kelas berlangsung dalam satu pernyataan SQL sehingga kegagalan tidak menyimpan sebagian batch.

Ikon hapus kelas meminta admin mengetik persis `delete`. Penghapusan mengarsipkan kelas (`active = FALSE`) sehingga hilang dari jadwal aktif dan tidak dapat dipakai untuk presensi baru; pertemuan, absensi, dan metadata Drive tetap tersimpan untuk laporan. Pada daftar siswa kelas tersedia ikon Edit (nama dan telepon) serta Hapus. Hapus siswa cukup konfirmasi tombol, tanpa mengetik `delete`; yang dinonaktifkan hanya keanggotaan pada kelas yang dipilih, sehingga riwayat absensi dan keanggotaan kelas lain tetap ada.

Menonaktifkan tutor memerlukan konfirmasi admin. Login tutor nonaktif ditolak dan status akun diperiksa dari database pada setiap permintaan API, termasuk sesi yang sudah terbuka. Akses yang ditolak memakai kode `ACCOUNT_DISABLED` dan pesan “Akun Anda dinonaktifkan. Hubungi admin.” Halaman tutor memeriksa ulang sesi saat tab kembali terlihat atau jendela mendapat fokus. Tutor nonaktif tidak muncul dalam dropdown tutor aktif; pilihan lama yang masih tersimpan di browser juga ditolak oleh server.

Penyimpanan kata sandi tutor melalui Profil membuka dialog konfirmasi sebelum mengirim perubahan. Modal sukses dengan animasi centang hanya muncul setelah server memastikan hash kata sandi benar-benar tersimpan; pemberitahuan sukses tidak ditampilkan sebagai banner di atas halaman. Kegagalan ditampilkan di dalam dialog dan isian tetap tersedia untuk diperbaiki. Dialog mendukung navigasi keyboard, menahan penutupan selama penyimpanan, dan menghormati preferensi pengurangan animasi perangkat.

Tabel `class_schedules` menyimpan hari (`0` Minggu sampai `6` Sabtu) dan jam lokal WIB secara terpisah dari `meetings`. Riwayat lama tetap digunakan. Hari/jam rutin yang belum tersedia tidak disimpulkan dari tanggal absensi; antarmuka menampilkan bahwa jadwal belum diatur.

Dropdown kelas tutor hanya memuat kelas aktif yang hari belajarnya cocok dengan hari ini di Asia/Jakarta, diurutkan menurut jam mulai. Jam mulai/selesai WIB ditampilkan pada pilihan kelas. Kelas yang belum memiliki jadwal tetap tersedia setiap hari dengan penanda Tanpa jadwal. Jika tidak ada pilihan yang cocok, tampil “Tidak ada kelas hari ini.” Server memeriksa hari lagi saat tutor membuka kelas, dan waktu mulai pertemuan baru mengikuti jadwal kelas. Daftar diperbarui ketika tab kembali aktif dan saat berganti hari; riwayat pertemuan tetap dapat dibuka tanpa pembatasan hari jadwal.

Pemilih kelas menampilkan nama kelas, sekolah, dan jam pada baris terpisah yang dapat membungkus sesuai lebar layar. Daftar terbuka menyesuaikan ruang di atas/bawah tombol, dapat digulir, dan mendukung tombol panah, Home/End, Enter, Escape, serta pencarian lewat ketikan. Tidak ada judul atau placeholder tambahan di dalam daftar pilihan.

Jika kelas belum memiliki siswa aktif, tutor cukup melakukan check-in dan mengunggah dokumentasi untuk menyimpan presensi. Daftar hadir siswa tidak ditampilkan pada kelas kosong. Finalisasi menerima array siswa kosong hanya jika roster server juga kosong; persyaratan lokasi, dokumentasi, akun aktif, dan kelas aktif tetap berlaku. Baris absensi draf yang sudah tidak sesuai roster dibersihkan dalam transaksi finalisasi tanpa mengubah pertemuan yang sudah selesai.

## Deploy ke Vercel

1. Push repository ke GitHub dan impor repository tersebut di Vercel.
2. Tambahkan environment variables dari `.env.example` pada Vercel Project Settings untuk environment Production (dan Preview bila diperlukan).
3. Jalankan `db/schema.sql` di Neon SQL Editor dan bootstrap admin dari komputer lokal dengan `DATABASE_URL` proyek yang sama.
4. Deploy. Vercel mendeteksi Next.js dan menjalankan build aplikasi.

Jangan pernah memakai `NEXT_PUBLIC_` untuk `DATABASE_URL`, `SESSION_SECRET`, atau kredensial Google. Nilai tersebut hanya digunakan oleh kode server.

## Menyiapkan Google Drive

Admin dapat mengisi kredensial melalui menu **Pengaturan → Pengaturan Google Drive**. Sebelum memakai menu ini, jalankan `npm run db:migrate-settings` dan pasang `SETTINGS_ENCRYPTION_KEY` di environment server. Buat kunci sekali dengan `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`, lalu simpan nilainya dengan aman; gunakan kunci yang sama untuk semua instance dan deployment yang memakai database yang sama. Mengganti atau kehilangan kunci membuat pengaturan tersimpan tidak dapat dibaca. Mulai ulang server setelah mengubah environment. Nilai kunci dan kredensial tidak boleh di-commit. Setelah menyimpan kredensial di admin, gunakan tombol **Uji koneksi**. Kolom yang dikosongkan saat mengubah pengaturan mempertahankan nilai sebelumnya.

Konfigurasi melalui environment berikut tetap didukung sebagai cadangan jika belum ada pengaturan yang disimpan admin:

1. Buat project di 
, aktifkan Google Drive API, dan siapkan OAuth Client ID/Client Secret.
2. Otorisasikan akun Google pemilik dokumentasi dengan scope `https://www.googleapis.com/auth/drive`, lalu siapkan refresh token untuk OAuth client tersebut.
3. Isi `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, dan `GOOGLE_REFRESH_TOKEN` di environment server. Opsional, isi `GOOGLE_DRIVE_ROOT_FOLDER_ID` dengan ID folder induk yang ingin dipakai.
4. Aplikasi menyimpan dokumentasi baru dalam `ABSEN-KUBIK / [Nama Sekolah] / [Nama Kelas] - [Jam Mulai WIB] / [Hari, Tanggal]` dan menyimpan ID folder/file ke database. Pertemuan tambahan pada kelas dan tanggal yang sama mendapat akhiran nomor pertemuan pada folder tanggalnya agar dokumentasi terpisah. Jika ID folder induk dikonfigurasi, folder tersebut digunakan sebagai pengganti `ABSEN-KUBIK`. Kelas tanpa jam memakai label `Tanpa jadwal`; kelas tanpa nama sekolah terpisah dikelompokkan dalam `Sekolah lainnya`. Pertemuan yang sudah memiliki folder tetap menggunakan folder lamanya.

OAuth refresh token dan folder Drive harus dapat diakses akun yang diotorisasikan. Jangan membuat file menjadi publik otomatis. Bila OAuth consent screen masih berstatus Testing, periksa masa berlaku token dan batasan akun penguji sebelum dipakai rutin.

## Skema database

`db/schema.sql` membuat tabel `app_users`, `classes`, `students`, `class_students`, `meetings`, `tutor_checkins`, `geocoding_rate_limit`, `attendance_records`, dan `evidence_files`. Absensi disimpan satu baris per siswa per pertemuan; sistem tidak menyimpan daftar nama absen sebagai teks saja.

## Catatan operasional

- Check-in browser memerlukan HTTPS dan izin lokasi. Jika kelas memiliki koordinat dan radius, API memvalidasi jarak check-in di server.
- Nama area koordinat diambil secara opsional lewat reverse geocoding Nominatim. Hanya koordinat yang dibulatkan sekitar 100 meter yang dikirim, tanpa identitas tutor. Permintaan dipicu oleh check-in, di-cache, dan dijeda agar tidak melebihi satu permintaan per detik. Jika layanan gagal atau slot sedang penuh, check-in tetap tersimpan dan koordinat tetap menjadi data utamanya. Nama area bersifat perkiraan. Atribusi OpenStreetMap ditampilkan di peta; URL penyedia kompatibel dapat diganti lewat `GEOCODING_REVERSE_URL`.
- Koordinat menyimpan posisi dan akurasi yang dilaporkan perangkat; data tersebut merupakan bukti pendukung.
- Vercel Functions membatasi ukuran request. Aplikasi menahan unggahan pada 3 MB per file untuk menyediakan ruang bagi overhead multipart.
- Paket gratis Vercel, Neon, dan Google Drive memiliki batas kuota/ketentuan yang dapat berubah. Vercel Hobby ditujukan untuk penggunaan pribadi/nonkomersial; pastikan ketentuan saat aplikasi dipakai dalam operasional lembaga.
- Waktu ditampilkan dalam zona `Asia/Jakarta`.

## Konteks untuk AI

Baca [AGENTS.md](./AGENTS.md) sebelum membuat perubahan lanjutan. Pertahankan stack TypeScript/React/Node.js, Vercel, Neon PostgreSQL, dan Google Drive; periksa kode yang ada sebelum memilih pustaka atau mengubah struktur.
