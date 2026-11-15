# Belajar Gitar

Aplikasi web (PWA) untuk belajar gitar: bisa dibuka di HP/iPad dan di-install ke layar utama.

**Fitur sekarang**
- **Tuner visual**: pakai mikrofon, jarum + warna (hijau = pas), instruksi "kencangkan/kendurkan".
- **Metronom**: 30–250 BPM, 2/4 · 3/4 · 4/4 · 6/8, tap tempo, ketukan berkedip.
- **Kamus chord**: 12 nada × mayor, m, 5, 7, maj7, m7, sus2, sus4, add9, 9. Diagram jari, nama nada, rumus interval, beberapa posisi, dan suara.

**Struktur**
- `js/theory.js`: nada, interval, tipe chord, instrumen (generik, siap untuk instrumen lain).
- `js/chords.js`: posisi chord (bentuk standar + barre + pencari otomatis).
- `js/pitch.js`, `js/tuner.js`: deteksi nada dari mic.
- `js/metronome.js`, `js/audio.js`: suara.
- `sw.js`: offline. Naikkan `VERSION` tiap ada perubahan.

Tanpa build step: cukup file statis, di-host di GitHub Pages.
