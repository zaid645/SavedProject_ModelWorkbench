# Model Workbench

Aplikasi web lokal untuk menyusun beberapa model 3D menjadi satu scene GLB. Dibangun dengan React, TypeScript, Vite, dan Three.js.

## Fitur

- Preview 3D dengan orbit, zoom, grid, dan pemilihan node melalui panel atau klik model.
- Impor `.glb`, `.gltf`, `.obj`, serta `.zip` yang berisi satu atau beberapa model.
- Untuk OBJ, baca pasangan `.mtl` dan tekstur yang direferensikan oleh MTL (misalnya `map_Kd`).
- Untuk GLTF eksternal, file `.bin` dan tekstur yang direferensikan ikut dicari di paket yang sama.
- Setiap file model dalam ZIP ditambahkan sebagai node terpisah; file dependensi tidak menjadi node.
- Transform tiap node: lokasi X/Y/Z, skala seragam, dan rotasi X/Y/Z dalam derajat.
- Normalisasi transform: lokasi `0,0,0`, rotasi `0°,0°,0°`, skala `1`.
- Ekspor semua node menjadi **satu scene, satu mesh, satu material, dan satu tekstur palet**. Setiap warna unik memakai satu piksel pada tekstur palet.

## Menjalankan

Persyaratan: Node.js 18 atau lebih baru.

```bash
npm install
npm run dev
```

Buka alamat lokal yang ditampilkan Vite, biasanya `http://localhost:5173`.

Untuk membuat build statis:

```bash
npm run build
npm run preview
```

Hasil build berada di folder `dist/` dan dapat di-host sebagai situs statis. Pemrosesan model dilakukan di browser; server backend tidak diperlukan.

## Struktur ZIP yang disarankan

Jaga struktur folder dan nama file tetap sesuai dengan referensi di dalam OBJ/MTL/GLTF. Contoh:

```text
asset-pack.zip
├── characters/
│   ├── hero.obj
│   ├── hero.mtl
│   └── textures/
│       ├── cloth.png
│       └── leather.jpg
├── props/
│   ├── chest.glb
│   └── lamp.gltf
│       ├── lamp.bin
│       └── textures/
│           └── metal.png
└── environment/
    ├── tree.obj
    └── tree.mtl
```

Catatan: pada ZIP, setiap `.obj`, `.gltf`, atau `.glb` akan dicoba sebagai model terpisah. File `.mtl`, `.bin`, dan gambar hanya diperlakukan sebagai dependensi. Hindari memasukkan salinan model yang sama dalam format `.gltf` dan `.glb` sekaligus kecuali memang ingin keduanya menjadi node.

Untuk impor lewat pemilihan banyak file (tanpa ZIP), pilih model dan semua file dependensinya sekaligus. ZIP lebih direkomendasikan karena mempertahankan struktur direktori.

## Cara kerja palet material

Ketika ekspor:

1. Transform node diterapkan ke geometri.
2. Geometri setiap mesh diubah ke koordinat dunia, atribut diseragamkan, lalu seluruh geometri statis digabung.
3. Warna material dibaca dari warna dasar. Jika material memiliki tekstur warna, proses mengambil sampel rata-rata gambar tekstur lalu menggabungkannya dengan warna dasar.
4. Setiap warna hasil yang unik ditempatkan pada satu piksel tekstur palet. UV tiap segitiga diarahkan ke pusat piksel terkait.
5. Scene GLB ditulis dengan satu mesh dan satu material yang memakai tekstur palet tersebut.

Konsekuensi desain palet: detail gambar tekstur (pola kain, tulisan, noise, dan sebagainya) tidak dipertahankan; tekstur diringkas menjadi warna rata-rata. Perbedaan roughness, metalness, normal map, opacity, dan properti material lain juga disatukan ke satu material standar. Ini memang ditujukan untuk aset low-poly yang mengutamakan palet warna sederhana dan ukuran material yang ringkas.

## Batasan versi ini

- Penggabungan ekspor ditujukan untuk **mesh statis**. Skinned mesh, skeletal animation, morph target, dan instanced mesh dilewati; bila sebuah paket hanya berisi tipe tersebut, ekspor akan menampilkan pesan kesalahan.
- Material OBJ/MTL dan GLTF dibaca untuk preview. Pada ekspor palet, tekstur diringkas menjadi warna rata-rata, bukan di-atlas dengan detail penuh.
- Untuk material transparan, material khusus, atau shader non-standar, hasil warna palet dapat berbeda dari preview.
- Berkas model diproses lokal di browser dan tidak diunggah ke server.
- File ZIP yang sangat besar atau berisi ribuan tekstur dapat membutuhkan RAM cukup besar.

## Modularisasi source

```text
src/
├── components/
│   ├── Inspector.tsx    # daftar node dan kontrol transform
│   └── Viewport.tsx     # renderer Three.js dan kontrol kamera
├── lib/
│   ├── exportGLB.ts     # normalisasi atribut, merge mesh, palet, ekspor GLB
│   ├── modelIO.ts       # pembacaan GLB/GLTF, OBJ/MTL, dan ZIP
│   └── types.ts         # tipe data node/model
├── App.tsx              # state aplikasi dan alur impor/ekspor
├── main.tsx
└── styles.css
```
