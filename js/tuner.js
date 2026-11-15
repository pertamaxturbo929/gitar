// Mesin tuner: mic -> deteksi nada -> callback dengan hasil yang sudah dihaluskan.
import { getCtx, unlockAudio } from './audio.js';
import { detectPitch } from './pitch.js';
import { freqToMidi } from './theory.js';

export function createTuner(onReading) {
  let stream = null, analyser = null, source = null, sink = null, timer = null, buf = null;
  const recent = [];
  let level = 0;

  async function start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('nomic');
    }
    const ctx = await unlockAudio();
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    // iPhone/iPad: izin mic bisa membuat audio berhenti sejenak, nyalakan lagi.
    if (ctx.state !== 'running') { try { await ctx.resume(); } catch (e) { /* abaikan */ } }
    source = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 4096;
    source.connect(analyser);
    // Safari hanya memproses node yang tersambung ke speaker. Sambungkan lewat volume 0 (tidak terdengar).
    sink = ctx.createGain();
    sink.gain.value = 0;
    analyser.connect(sink).connect(ctx.destination);
    buf = new Float32Array(analyser.fftSize);
    timer = setInterval(tick, 50);
  }

  function tick() {
    const ctx = getCtx();
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    level = Math.sqrt(sum / buf.length);
    const r = detectPitch(buf, ctx.sampleRate, { threshold: 0.003 });
    const now = performance.now();
    if (r) {
      const midi = freqToMidi(r.freq);
      // Buang lompatan oktaf sesaat: bandingkan dengan median terbaru.
      recent.push({ midi, t: now });
    }
    while (recent.length && now - recent[0].t > 350) recent.shift();
    if (!recent.length) return onReading(null, level);
    const sorted = recent.map((o) => o.midi).sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    const close = recent.filter((o) => Math.abs(o.midi - med) < 0.5).map((o) => o.midi);
    const avg = close.reduce((a, b) => a + b, 0) / close.length;
    onReading({ midi: avg, freq: 440 * Math.pow(2, (avg - 69) / 12), fresh: !!r }, level);
  }

  function stop() {
    clearInterval(timer);
    timer = null;
    if (source) source.disconnect();
    if (sink) sink.disconnect();
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = analyser = source = sink = null;
    recent.length = 0;
  }

  return { start, stop, get running() { return !!timer; } };
}
