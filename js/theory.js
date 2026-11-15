// Teori musik dasar, tidak terikat ke instrumen tertentu.
// Semua nada disimpan sebagai angka MIDI (C4 = 60, A4 = 69 = 440 Hz).

export const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

export const pc = (m) => ((Math.round(m) % 12) + 12) % 12;
export const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const freqToMidi = (f) => 69 + 12 * Math.log2(f / 440);
export const noteName = (m) => NOTE_NAMES[pc(m)];
export const octaveOf = (m) => Math.floor(Math.round(m) / 12) - 1;

// Label interval dalam bentuk "rumus chord" (1, 3, 5, b7, ...).
export const INTERVAL_LABELS = {
  0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4', 6: 'b5', 7: '5',
  8: '#5', 9: '6', 10: 'b7', 11: '7', 13: 'b9', 14: '9', 17: '11', 21: '13',
};

// Tipe chord didefinisikan murni lewat interval dari root.
// `required` = interval yang wajib ada saat mencari posisi jari (kwint boleh hilang di chord 4 nada).
export const CHORD_TYPES = [
  { id: 'maj', symbol: '', label: 'Mayor', name: 'mayor', intervals: [0, 4, 7], required: [0, 4, 7],
    desc: 'Chord paling dasar. Kesannya cerah dan bahagia.' },
  { id: 'min', symbol: 'm', label: 'm', name: 'minor', intervals: [0, 3, 7], required: [0, 3, 7],
    desc: 'Seperti mayor, tapi nada ke-3 turun setengah. Kesannya sedih / mellow.' },
  { id: '5', symbol: '5', label: '5', name: 'power chord', intervals: [0, 7], required: [0, 7], power: true,
    desc: 'Hanya root + nada ke-5, tanpa nada ke-3. Netral dan tebal, khas musik rock.' },
  { id: '7', symbol: '7', label: '7', name: 'dominan 7', intervals: [0, 4, 7, 10], required: [0, 4, 10],
    desc: 'Mayor + b7. Kesannya "menggantung", ingin pindah ke chord berikutnya. Sering di blues.' },
  { id: 'maj7', symbol: 'maj7', label: 'maj7', name: 'mayor 7', intervals: [0, 4, 7, 11], required: [0, 4, 11],
    desc: 'Mayor + 7. Kesannya lembut, jazzy, romantis.' },
  { id: 'm7', symbol: 'm7', label: 'm7', name: 'minor 7', intervals: [0, 3, 7, 10], required: [0, 3, 10],
    desc: 'Minor + b7. Kesannya santai, adem.' },
  { id: 'sus2', symbol: 'sus2', label: 'sus2', name: 'suspended 2', intervals: [0, 2, 7], required: [0, 2, 7],
    desc: 'Nada ke-3 diganti nada ke-2. Bukan mayor, bukan minor: terdengar terbuka/mengambang.' },
  { id: 'sus4', symbol: 'sus4', label: 'sus4', name: 'suspended 4', intervals: [0, 5, 7], required: [0, 5, 7],
    desc: 'Nada ke-3 diganti nada ke-4. Terdengar menggantung, biasanya lalu kembali ke mayor.' },
  { id: 'add9', symbol: 'add9', label: 'add9', name: 'add 9', intervals: [0, 4, 7, 14], required: [0, 4, 14],
    desc: 'Mayor + nada ke-9 (= nada ke-2, satu oktaf lebih tinggi). Kesannya berkilau.' },
  { id: '9', symbol: '9', label: '9', name: 'dominan 9', intervals: [0, 4, 7, 10, 14], required: [0, 4, 10, 14],
    desc: 'Chord 7 + nada ke-9. Kesannya funky / soulful.' },
];

export const chordType = (id) => CHORD_TYPES.find((t) => t.id === id);

export function chordSymbol(rootPc, typeId) {
  return NOTE_NAMES[rootPc] + chordType(typeId).symbol;
}

// Daftar nada & label interval untuk sebuah chord.
export function chordTones(rootPc, typeId) {
  return chordType(typeId).intervals.map((iv) => ({
    interval: iv,
    label: INTERVAL_LABELS[iv],
    pc: pc(rootPc + iv),
    name: NOTE_NAMES[pc(rootPc + iv)],
  }));
}

// Instrumen = daftar senar (MIDI nada terbuka, dari senar paling bawah/tebal).
// Nanti tinggal tambah ukulele, bass, dst.
export const INSTRUMENTS = {
  guitar: {
    id: 'guitar',
    name: 'Gitar',
    tuning: [40, 45, 50, 55, 59, 64], // E2 A2 D3 G3 B3 E4
    frets: 15,
  },
};
