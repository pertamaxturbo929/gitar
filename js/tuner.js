// Mesin tuner: mic -> deteksi nada -> callback dengan hasil yang sudah dihaluskan.
import { getCtx, unlockAudio } from './audio.js';
import { detectPitch } from './pitch.js';
import { freqToMidi } from './theory.js';

export function createTuner(onReading) {
  let stream = null, analyser = null, source = null, timer = null, buf = null;
  const recent = [];

  async function start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('nomic');
    }
    const ctx = await unlockAudio();
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    source = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 4096;
    source.connect(analyser);
    buf = new Float32Array(analyser.fftSize);
    timer = setInterval(tick, 50);
  }

  function tick() {
    analyser.getFloatTimeDomainData(buf);
    const r = detectPitch(buf, getCtx().sampleRate);
    const now = performance.now();
    if (r) {
      const midi = freqToMidi(r.freq);
      // Buang lompatan oktaf sesaat: bandingkan dengan median terbaru.
      recent.push({ midi, t: now });
    }
    while (recent.length && now - recent[0].t > 350) recent.shift();
    if (!recent.length) return onReading(null);
    const sorted = recent.map((o) => o.midi).sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    const close = recent.filter((o) => Math.abs(o.midi - med) < 0.5).map((o) => o.midi);
    const avg = close.reduce((a, b) => a + b, 0) / close.length;
    onReading({ midi: avg, freq: 440 * Math.pow(2, (avg - 69) / 12), fresh: !!r });
  }

  function stop() {
    clearInterval(timer);
    timer = null;
    if (source) source.disconnect();
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = analyser = source = null;
    recent.length = 0;
  }

  return { start, stop, get running() { return !!timer; } };
}
