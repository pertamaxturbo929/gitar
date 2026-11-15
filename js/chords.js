// Posisi jari chord (voicing). Generik: bekerja untuk instrumen apa pun
// yang didefinisikan sebagai daftar senar di theory.js.
import { INSTRUMENTS, chordType, pc, NOTE_NAMES } from './theory.js';

// Bentuk chord terbuka yang sudah umum diajarkan (gitar standar).
// frets: dari senar 6 (E bawah) ke senar 1. x = tidak dibunyikan.
// fingers: 0 = tanpa jari, 1 telunjuk, 2 tengah, 3 manis, 4 kelingking.
const CURATED_GUITAR = {
  'C:maj': [['x32010', '032010']],
  'D:maj': [['xx0232', '000132']],
  'E:maj': [['022100', '023100']],
  'F:maj': [['133211', '134211'], ['xx3211', '003211']],
  'G:maj': [['320003', '210003'], ['320033', '210034']],
  'A:maj': [['x02220', '001230']],
  'B:maj': [['x24442', '013331']],
  'A:min': [['x02210', '002310']],
  'B:min': [['x24432', '013421']],
  'D:min': [['xx0231', '000231']],
  'E:min': [['022000', '023000']],
  'C:7': [['x32310', '032410']],
  'D:7': [['xx0212', '000213']],
  'E:7': [['020100', '020100']],
  'G:7': [['320001', '320001']],
  'A:7': [['x02020', '002030']],
  'B:7': [['x21202', '021304']],
  'C:maj7': [['x32000', '032000']],
  'D:maj7': [['xx0222', '000111']],
  'E:maj7': [['021100', '031200']],
  'F:maj7': [['xx3210', '003210']],
  'G:maj7': [['320002', '320001']],
  'A:maj7': [['x02120', '002130']],
  'A:m7': [['x02010', '002010']],
  'B:m7': [['x20202', '010203']],
  'D:m7': [['xx0211', '000211']],
  'E:m7': [['020000', '020000'], ['022030', '023040']],
  'A:sus2': [['x02200', '001200']],
  'D:sus2': [['xx0230', '000130']],
  'A:sus4': [['x02230', '001230']],
  'D:sus4': [['xx0233', '000134']],
  'E:sus4': [['022200', '023400']],
  'C:add9': [['x32033', '021034']],
  'E:5': [['022xxx', '011000']],
  'A:5': [['x022xx', '001100']],
  'D:5': [['xx023x', '000130']],
  'C:9': [['x32333', '021333']],
};

// Bentuk barre yang bisa digeser (movable). Angka = jarak fret dari fret root.
// null = senar tidak dibunyikan. rootString = senar tempat root (0 = senar 6).
const MOVABLE_GUITAR = [
  { name: 'Bentuk E (barre)', rootString: 0, shapes: {
    maj: [[0, 2, 2, 1, 0, 0], [1, 3, 4, 2, 1, 1]],
    min: [[0, 2, 2, 0, 0, 0], [1, 3, 4, 1, 1, 1]],
    7: [[0, 2, 0, 1, 0, 0], [1, 3, 1, 2, 1, 1]],
    maj7: [[0, null, 1, 1, 0, null], [1, 0, 3, 4, 2, 0]],
    m7: [[0, 2, 0, 0, 0, 0], [1, 3, 1, 1, 1, 1]],
    sus4: [[0, 2, 2, 2, 0, 0], [1, 2, 3, 4, 1, 1]],
    5: [[0, 2, 2, null, null, null], [1, 3, 4, 0, 0, 0]],
  } },
  { name: 'Bentuk A (barre)', rootString: 1, shapes: {
    maj: [[null, 0, 2, 2, 2, 0], [0, 1, 3, 3, 3, 1]],
    min: [[null, 0, 2, 2, 1, 0], [0, 1, 3, 4, 2, 1]],
    7: [[null, 0, 2, 0, 2, 0], [0, 1, 3, 1, 4, 1]],
    maj7: [[null, 0, 2, 1, 2, 0], [0, 1, 3, 2, 4, 1]],
    m7: [[null, 0, 2, 0, 1, 0], [0, 1, 3, 1, 2, 1]],
    sus2: [[null, 0, 2, 2, 0, 0], [0, 1, 3, 4, 1, 1]],
    sus4: [[null, 0, 2, 2, 3, 0], [0, 1, 2, 3, 4, 1]],
    5: [[null, 0, 2, 2, null, null], [0, 1, 3, 4, 0, 0]],
    9: [[null, 0, -1, 0, 0, 0], [0, 2, 1, 3, 3, 3]],
  } },
];

function movableVoicings(instrument, rootPc, typeId) {
  const out = [];
  for (const m of MOVABLE_GUITAR) {
    const shape = m.shapes[typeId];
    if (!shape) continue;
    const open = instrument.tuning[m.rootString];
    let r = pc(rootPc - open);
    if (r === 0) r = 12; // fret 0 = chord terbuka, sudah ada di daftar standar
    const frets = shape[0].map((o) => (o === null ? -1 : r + o));
    if (frets.some((f) => f === 0) || Math.max(...frets) > instrument.frets) continue;
    const fingers = shape[1].slice();
    const v = makeVoicing(instrument, frets, fingers, detectBarre(frets, fingers), 'shape');
    v.label = m.name;
    out.push(v);
  }
  return out;
}

const parseFrets = (s) => [...s].map((c) => (c === 'x' ? -1 : parseInt(c, 10)));

// Tentukan jari & barre secara otomatis. null kalau tidak mungkin dimainkan.
export function assignFingers(frets) {
  const fingers = frets.map(() => 0);
  const fretted = frets.map((f, s) => ({ f, s })).filter((o) => o.f > 0);
  if (!fretted.length) return { fingers, barre: null };
  const sortFn = (a, b) => a.f - b.f || a.s - b.s;

  if (fretted.length <= 4) {
    fretted.sort(sortFn).forEach((o, i) => (fingers[o.s] = i + 1));
    return { fingers, barre: null };
  }
  // Butuh barre (telunjuk menekan beberapa senar sekaligus) di fret terendah.
  const min = Math.min(...fretted.map((o) => o.f));
  const atMin = fretted.filter((o) => o.f === min);
  const from = Math.min(...atMin.map((o) => o.s));
  const to = Math.max(...atMin.map((o) => o.s));
  if (to === from) return null;
  for (let s = from; s <= to; s++) if (frets[s] < min) return null;
  const rest = fretted.filter((o) => !(o.f === min)).sort(sortFn);
  if (rest.length > 3) return null;
  atMin.forEach((o) => (fingers[o.s] = 1));
  rest.forEach((o, i) => (fingers[o.s] = i + 2));
  return { fingers, barre: { fret: min, from, to } };
}

function detectBarre(frets, fingers) {
  const ones = frets.map((f, s) => ({ f, s, fi: fingers[s] })).filter((o) => o.fi === 1 && o.f > 0);
  if (ones.length < 2) return null;
  const fret = ones[0].f;
  if (!ones.every((o) => o.f === fret)) return null;
  return { fret, from: Math.min(...ones.map((o) => o.s)), to: Math.max(...ones.map((o) => o.s)) };
}

function makeVoicing(instrument, frets, fingers, barre, source) {
  const notes = frets.map((f, s) => (f < 0 ? null : instrument.tuning[s] + f));
  const fretted = frets.filter((f) => f > 0);
  const maxF = fretted.length ? Math.max(...fretted) : 0;
  const minF = fretted.length ? Math.min(...fretted) : 0;
  const baseFret = maxF <= 4 ? 1 : minF;
  return { frets, fingers, barre, notes, baseFret, source, key: frets.join(',') };
}

// Cari semua posisi yang masuk akal lalu beri skor (makin kecil makin mudah).
function generate(instrument, rootPc, type) {
  const strings = instrument.tuning.length;
  const allowed = new Set(type.intervals.map((iv) => pc(rootPc + iv)));
  const required = type.required.map((iv) => pc(rootPc + iv));
  const results = new Map();

  for (let base = 1; base <= 12; base++) {
    const options = instrument.tuning.map((open) => {
      const opts = [-1];
      if (allowed.has(pc(open))) opts.push(0);
      for (let f = base; f <= base + 3 && f <= instrument.frets; f++) if (allowed.has(pc(open + f))) opts.push(f);
      return opts;
    });
    const cur = new Array(strings);
    const walk = (s) => {
      if (s === strings) return consider(cur.slice());
      for (const o of options[s]) { cur[s] = o; walk(s + 1); }
    };
    const consider = (frets) => {
      const sounding = frets.map((f, s) => (f >= 0 ? s : -1)).filter((s) => s >= 0);
      const minSounding = type.power ? 2 : 3;
      if (sounding.length < minSounding) return;
      const lo = sounding[0], hi = sounding[sounding.length - 1];
      if (hi - lo + 1 !== sounding.length) return; // tidak boleh ada senar mati di tengah
      const notes = sounding.map((s) => instrument.tuning[s] + frets[s]);
      if (pc(notes[0]) !== rootPc) return; // nada terendah harus root
      const pcs = new Set(notes.map(pc));
      if (!required.every((r) => pcs.has(r))) return;
      const fretted = frets.filter((f) => f > 0);
      if (fretted.length && Math.max(...fretted) - Math.min(...fretted) > 3) return;
      const fa = assignFingers(frets);
      if (!fa) return;
      const minF = fretted.length ? Math.min(...fretted) : 0;
      const opens = frets.filter((f) => f === 0).length;
      let score = minF * 1.0;
      if (type.power) score += -Math.min(sounding.length, 3) * 1.2 + Math.max(0, sounding.length - 3) * 2;
      else score -= sounding.length * 1.2;
      if (fa.barre) score += 2.5;
      score += fretted.length * 0.4;
      score += minF <= 4 ? -0.3 * opens : 0.6 * opens;
      if (!pcs.has(pc(rootPc + 7)) && type.intervals.includes(7)) score += 0.8;
      const key = frets.join(',');
      if (!results.has(key) || results.get(key).score > score) {
        results.set(key, { ...makeVoicing(instrument, frets, fa.fingers, fa.barre, 'auto'), score });
      }
    };
    walk(0);
  }

  // Ambil yang terbaik, lalu variasi posisi lain yang berbeda (fret/senar bass beda).
  const sorted = [...results.values()].sort((a, b) => a.score - b.score);
  const picked = [];
  const seen = new Set();
  for (const v of sorted) {
    const fretted = v.frets.filter((f) => f > 0);
    const pos = fretted.length ? Math.min(...fretted) : 0;
    const bass = v.frets.findIndex((f) => f >= 0);
    const sig = `${pos > 4 ? pos : 0}:${bass}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    picked.push(v);
    if (picked.length >= 6) break;
  }
  return picked;
}

const cache = new Map();

// Semua posisi untuk satu chord: bentuk standar dulu, lalu hasil generator.
export function voicingsFor(rootPc, typeId, instrumentId = 'guitar') {
  const cacheKey = `${instrumentId}:${rootPc}:${typeId}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const instrument = INSTRUMENTS[instrumentId];
  const type = chordType(typeId);
  const list = [];
  const keys = new Set();
  if (instrumentId === 'guitar') {
    const curated = CURATED_GUITAR[`${NOTE_NAMES[rootPc]}:${typeId}`] || [];
    for (const [f, fi] of curated) {
      const frets = parseFrets(f);
      const fingers = [...fi].map(Number);
      const v = makeVoicing(instrument, frets, fingers, detectBarre(frets, fingers), 'curated');
      list.push(v);
      keys.add(v.key);
    }
  }
  if (instrumentId === 'guitar') {
    for (const v of movableVoicings(instrument, rootPc, typeId).sort((a, b) => a.baseFret - b.baseFret)) {
      if (!keys.has(v.key)) { list.push(v); keys.add(v.key); }
    }
  }
  for (const v of generate(instrument, rootPc, type)) {
    if (!keys.has(v.key)) { list.push(v); keys.add(v.key); }
  }
  // Urutkan: posisi standar di depan, sisanya dari fret rendah ke tinggi.
  const head = list.filter((v) => v.source !== 'auto');
  const tail = list.filter((v) => v.source === 'auto');
  if (!head.length && tail.length) head.push(tail.shift());
  tail.sort((a, b) => a.baseFret - b.baseFret);
  const out = [...head, ...tail].slice(0, 7);
  cache.set(cacheKey, out);
  return out;
}
