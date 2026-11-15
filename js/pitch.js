// Deteksi nada (metode McLeod / NSDF). Murni hitungan, bisa dites tanpa browser.
// Mengembalikan { freq, clarity } atau null kalau tidak ada nada jelas.

export function detectPitch(input, sampleRate, { minFreq = 60, maxFreq = 1100, threshold = 0.012 } = {}) {
  // Turunkan sample rate 2x (rata-rata 2 sampel) supaya ringan di HP.
  const n = input.length >> 1;
  const x = new Float32Array(n);
  let rms = 0;
  for (let i = 0; i < n; i++) {
    const v = (input[2 * i] + input[2 * i + 1]) * 0.5;
    x[i] = v;
    rms += v * v;
  }
  rms = Math.sqrt(rms / n);
  if (rms < threshold) return null;
  const sr = sampleRate / 2;

  // Buang DC offset.
  let mean = 0;
  for (let i = 0; i < n; i++) mean += x[i];
  mean /= n;
  for (let i = 0; i < n; i++) x[i] -= mean;

  const minLag = Math.max(2, Math.floor(sr / maxFreq));
  const maxLag = Math.min(Math.floor(sr / minFreq), n >> 1);
  const W = n - maxLag;
  const nsdf = new Float32Array(maxLag + 2);
  for (let tau = 0; tau <= maxLag + 1; tau++) {
    let acf = 0, m = 0;
    for (let j = 0; j < W; j++) {
      const a = x[j], b = x[j + tau];
      acf += a * b;
      m += a * a + b * b;
    }
    nsdf[tau] = m > 0 ? (2 * acf) / m : 0;
  }

  // Cari puncak-puncak setelah grafik pertama kali turun di bawah nol.
  const peaks = [];
  let tau = 1;
  while (tau < maxLag && nsdf[tau] > 0) tau++;
  let best = -1, bestVal = -Infinity;
  for (; tau <= maxLag; tau++) {
    if (nsdf[tau] > 0 && nsdf[tau] >= nsdf[tau - 1] && nsdf[tau] >= nsdf[tau + 1]) {
      // simpan puncak lokal; lewati sampai lereng turun
      peaks.push(tau);
      if (nsdf[tau] > bestVal) { bestVal = nsdf[tau]; best = tau; }
    }
  }
  if (best < 0 || bestVal < 0.6) return null;
  const k = 0.88;
  let chosen = best;
  for (const p of peaks) {
    if (p >= minLag && nsdf[p] >= k * bestVal) { chosen = p; break; }
  }
  // Interpolasi parabola supaya lebih presisi.
  const a = nsdf[chosen - 1], b = nsdf[chosen], c = nsdf[chosen + 1];
  const denom = a - 2 * b + c;
  const shift = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
  const period = chosen + shift;
  const freq = sr / period;
  if (freq < minFreq || freq > maxFreq) return null;
  return { freq, clarity: b, rms };
}
