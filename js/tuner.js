// Mesin tuner: mic -> deteksi nada -> callback dengan hasil yang sudah dihaluskan.
// Tuner punya AudioContext sendiri yang dibuat SETELAH mic aktif:
// di Safari (iPhone/iPad), context lama yang dibuat sebelum mic sering menerima suara kosong.
import { detectPitch } from './pitch.js';
import { freqToMidi } from './theory.js';

export function createTuner(onReading) {
  let stream = null, ctx = null, analyser = null, source = null, sink = null, timer = null, buf = null;
  const recent = [];
  let level = 0;
  const info = { step: 'idle', error: '', ctxState: '', sampleRate: 0, track: '' };

  async function start() {
    info.error = '';
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      info.step = 'no-api';
      throw new Error('nomic');
    }
    info.step = 'minta-izin';
    try {
      // Panggil mic paling awal supaya masih dihitung sebagai sentuhan pengguna.
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (e) {
      info.step = 'izin-gagal';
      info.error = (e && (e.name || e.message)) || String(e);
      throw e;
    }
    const track = stream.getAudioTracks()[0];
    info.track = track ? `${track.readyState}${track.muted ? ' (muted)' : ''}` : 'tidak ada';
    info.step = 'audio';
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    try { await ctx.resume(); } catch (e) { /* dicoba lagi di tick */ }
    source = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 4096;
    source.connect(analyser);
    // Safari hanya memproses node yang tersambung ke speaker. Sambungkan lewat volume 0.
    sink = ctx.createGain();
    sink.gain.value = 0;
    analyser.connect(sink);
    sink.connect(ctx.destination);
    buf = new Float32Array(analyser.fftSize);
    info.sampleRate = ctx.sampleRate;
    info.step = 'jalan';
    timer = setInterval(tick, 50);
  }

  function tick() {
    info.ctxState = ctx.state;
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    if (analyser.getFloatTimeDomainData) analyser.getFloatTimeDomainData(buf);
    else {
      const b = new Uint8Array(buf.length);
      analyser.getByteTimeDomainData(b);
      for (let i = 0; i < b.length; i++) buf[i] = (b[i] - 128) / 128;
    }
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    level = Math.sqrt(sum / buf.length);
    const r = detectPitch(buf, ctx.sampleRate, { threshold: 0.003 });
    const now = performance.now();
    if (r) recent.push({ midi: freqToMidi(r.freq), t: now });
    while (recent.length && now - recent[0].t > 350) recent.shift();
    if (!recent.length) return onReading(null, level, info);
    // Median + rata-rata nilai yang dekat: buang lompatan oktaf sesaat.
    const sorted = recent.map((o) => o.midi).sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    const close = recent.filter((o) => Math.abs(o.midi - med) < 0.5).map((o) => o.midi);
    const avg = close.reduce((a, b) => a + b, 0) / close.length;
    onReading({ midi: avg, freq: 440 * Math.pow(2, (avg - 69) / 12), fresh: !!r }, level, info);
  }

  function stop() {
    clearInterval(timer);
    timer = null;
    try { if (source) source.disconnect(); if (sink) sink.disconnect(); } catch (e) { /* abaikan */ }
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (ctx) ctx.close().catch(() => {});
    stream = ctx = analyser = source = sink = null;
    recent.length = 0;
    info.step = 'berhenti';
  }

  return { start, stop, info, get running() { return !!timer; } };
}
