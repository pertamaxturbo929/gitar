// Satu AudioContext dipakai bersama (tuner, metronom, suara chord).
import { midiToFreq } from './theory.js';

let ctx = null;
let master = null;

export function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
  }
  return ctx;
}

export function getMaster() {
  getCtx();
  return master;
}

// iOS/Safari: audio baru boleh jalan setelah sentuhan pengguna.
export async function unlockAudio() {
  const c = getCtx();
  if (c.state !== 'running') {
    try { await c.resume(); } catch (e) { /* abaikan */ }
  }
  // Putar buffer hening sekali supaya iOS benar-benar "membuka" audio.
  const b = c.createBuffer(1, 1, c.sampleRate);
  const s = c.createBufferSource();
  s.buffer = b;
  s.connect(c.destination);
  s.start(0);
  return c;
}

// Suara petikan senar (algoritma Karplus-Strong).
const pluckCache = new Map();
function pluckBuffer(midi) {
  if (pluckCache.has(midi)) return pluckCache.get(midi);
  const c = getCtx();
  const sr = c.sampleRate;
  const freq = midiToFreq(midi);
  const len = Math.floor(sr * 2.5);
  const buf = c.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  const period = sr / freq - 0.5; // filter rata-rata menambah delay 0.5 sampel
  const n = Math.floor(period);
  const frac = period - n;
  const ring = new Float32Array(n + 2);
  for (let i = 0; i < ring.length; i++) ring[i] = Math.random() * 2 - 1;
  // Haluskan noise awal supaya tidak terlalu "cempreng".
  for (let k = 0; k < 2; k++) for (let i = 1; i < ring.length; i++) ring[i] = (ring[i] + ring[i - 1]) / 2;
  const L = ring.length;
  const hist = new Float32Array(Math.ceil(period) + 4);
  const H = hist.length;
  let w = 0;
  for (let i = 0; i < len; i++) {
    let v;
    if (i < L) v = ring[i];
    else {
      // Delay pecahan supaya nadanya tepat.
      const p1 = (w - n + H) % H;
      const p2 = (w - n - 1 + H) % H;
      const p3 = (w - n - 2 + H) % H;
      const a = hist[p1] * (1 - frac) + hist[p2] * frac;
      const b = hist[p2] * (1 - frac) + hist[p3] * frac;
      v = (a + b) * 0.5 * 0.998;
    }
    hist[w] = v;
    w = (w + 1) % H;
    d[i] = v;
  }
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
  if (peak > 0) for (let i = 0; i < len; i++) d[i] /= peak;
  pluckCache.set(midi, buf);
  return buf;
}

export function pluck(midi, when = 0, gain = 0.5) {
  const c = getCtx();
  const src = c.createBufferSource();
  src.buffer = pluckBuffer(midi);
  const g = c.createGain();
  const t = Math.max(when, c.currentTime);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 2.4);
  src.connect(g).connect(getMaster());
  src.start(t);
  src.stop(t + 2.5);
}

// notes: array MIDI (null = senar tidak dibunyikan), dari senar bawah.
// up = genjreng ke atas (senar tipis dulu). when = waktu audio (untuk pola terjadwal).
export function strum(notes, { gap = 0.035, arpeggio = false, up = false, when = null, gain = null } = {}) {
  const c = getCtx();
  const step = arpeggio ? 0.32 : up ? gap * 0.7 : gap;
  let t = when == null ? c.currentTime + 0.03 : when;
  let list = notes.filter((m) => m != null);
  if (up) list = list.reverse().slice(0, 4); // genjreng atas biasanya hanya kena senar tipis
  const g = gain != null ? gain : arpeggio ? 0.6 : up ? 0.28 : 0.4;
  for (const m of list) {
    pluck(m, t, g);
    t += step;
  }
}

// Nada tunggal (untuk latihan telinga).
export function playNote(midi, when = null, gain = 0.6) {
  const c = getCtx();
  pluck(midi, when == null ? c.currentTime + 0.03 : when, gain);
}

// Nada referensi stabil (untuk tuner).
export function referenceTone(midi, dur = 1.6) {
  const c = getCtx();
  const t = c.currentTime + 0.02;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.35, t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(getMaster());
  const f = midiToFreq(midi);
  [[1, 1], [2, 0.4], [3, 0.2]].forEach(([h, a]) => {
    const o = c.createOscillator();
    const og = c.createGain();
    o.frequency.value = f * h;
    og.gain.value = a;
    o.connect(og).connect(g);
    o.start(t);
    o.stop(t + dur + 0.05);
  });
}

// Bunyi klik metronom.
export function click(when, accent) {
  const c = getCtx();
  const o = c.createOscillator();
  const g = c.createGain();
  o.frequency.value = accent ? 1760 : 1100;
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(accent ? 0.9 : 0.55, when + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
  o.connect(g).connect(getMaster());
  o.start(when);
  o.stop(when + 0.06);
}

// Layar tetap menyala saat tuner/metronom aktif.
let wakeLock = null;
let wakeUsers = 0;
export async function keepAwake(on) {
  wakeUsers = Math.max(0, wakeUsers + (on ? 1 : -1));
  try {
    if (wakeUsers > 0 && !wakeLock && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => (wakeLock = null));
    } else if (wakeUsers === 0 && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (e) { /* tidak didukung, tidak apa-apa */ }
}
