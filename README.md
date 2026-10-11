# Nazuaf Music

Website katalog musik statis dengan desain putih minimalis dan aksen biru. Frontend memakai HTML, CSS, dan JavaScript biasa tanpa build step sehingga bisa diunggah langsung ke GitHub dan dipublikasikan lewat Cloudflare Pages.

## Fitur yang tersedia

- Pencarian global dan filter Lagu, Album, Artis, Playlist
- Halaman detail album, artis, dan playlist
- Daftar lagu/album artis, pagination playlist, dan rekomendasi otomatis
- Antrean lagu, kontrol pemutar, progress bar, volume, autoplay rekomendasi
- Favorit disimpan secara lokal di browser dengan `localStorage`
- Layout responsif untuk desktop dan ponsel
- Loading state, penanganan error, dan fallback saat API tidak tersedia

## File utama

- `index.html` — struktur halaman
- `styles.css` — UI responsif
- `app.js` — logika katalog, pencarian, detail, favorit, antrean, dan pemutar
- `config.js` — base URL API serta pengaturan
- `_headers` — header keamanan sederhana untuk Cloudflare Pages
- `favicon.svg` — ikon tab browser

## Cara unggah ke GitHub dari HP

1. Unduh dan ekstrak ZIP ini.
2. Buka repository GitHub yang ingin dipakai untuk `music.nazuaf.com`.
3. Pilih **Add file → Upload files**.
4. Unggah isi folder `Nazuaf-Music` (jangan unggah folder ZIP sebagai satu berkas). Pastikan `index.html`, `app.js`, `styles.css`, dan `config.js` berada di root repository.
5. Commit perubahan.

## Deploy ke Cloudflare Pages

1. Buka Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Pilih repository GitHub tempat file di atas diunggah.
3. Karena ini website statis tanpa proses build, pilih pengaturan berikut:
   - **Framework preset:** None
   - **Build command:** kosongkan
   - **Build output directory:** `.` (folder root repository)
4. Deploy. Setelah sukses, buka URL `*.pages.dev` untuk menguji pencarian dan tampilan.
5. Untuk domain khusus, buka proyek Pages → **Custom domains** → tambahkan `music.nazuaf.com`, lalu ikuti petunjuk DNS yang ditampilkan Cloudflare.

## API

Frontend memakai endpoint publik `https://saavn.sumit.co` dari proyek [sumitkolhe/jiosaavn-api](https://github.com/sumitkolhe/jiosaavn-api). Endpoint ini adalah API tidak resmi. Ketersediaan, skema respons, CORS, dan akses ke sumber media bisa berubah atau gagal sewaktu-waktu. Aplikasi menampilkan pesan error jika permintaan tidak berhasil.

Jika halaman hasil menampilkan error jaringan, cek dulu endpoint di browser secara langsung. Contoh:

`https://saavn.sumit.co/api/search/songs?query=alan%20walker&page=0&limit=5`

Kalau endpoint bisa dibuka tetapi website tetap gagal, masalah mungkin terkait CORS atau respons API yang berubah. Jangan mengandalkan API tidak resmi untuk layanan publik yang harus selalu tersedia. Pertimbangkan API yang punya SLA/dokumentasi resmi atau backend milik sendiri dengan izin yang benar.

## Tentang audio dan hak penggunaan

`config.js` mengatur:

```js
ENABLE_API_AUDIO_PLAYBACK: false
```

Pemutaran langsung URL audio dari API sengaja **nonaktif secara default**. Metadata hasil pencarian dan keberadaan `downloadUrl` tidak membuktikan bahwa musik boleh disiarkan ulang atau di-stream di website publik. Aktifkan pemutaran langsung hanya setelah kamu memastikan izin/lisensi untuk audio yang digunakan dan ketentuan sumber mengizinkannya. Setelah ada izin yang sesuai, ubah nilai menjadi `true` dan commit ulang. Tanpa itu, aplikasi tetap bisa menampilkan katalog dan tautan untuk membuka halaman sumber.

Tidak ada tombol untuk mengunduh berkas audio di website ini.

## Catatan implementasi

- Tidak membutuhkan Node.js, npm, database, Worker, atau environment variable.
- Favorit hanya tersimpan di browser/perangkat yang digunakan, bukan tersinkron antarperangkat.
- Pemutaran audio, jika diaktifkan dengan izin yang sesuai, tetap bergantung pada URL audio yang valid dan dukungan CORS/range dari server asal.
- API yang tidak tersedia tidak dapat diperbaiki hanya dari kode frontend. Antarmuka akan menampilkan pesan error dan menyediakan tombol coba lagi.

## Lisensi proyek frontend

Kode frontend ini disiapkan untuk proyek Nazuaf Music. Repository API pihak ketiga memiliki lisensi dan ketentuannya sendiri; periksa repository sumber sebelum memakai atau mendistribusikan komponen dari sana.
