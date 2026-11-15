// Metronom presisi: jadwal bunyi lewat jam audio, bukan setTimeout.
import { getCtx, unlockAudio, click } from './audio.js';

export function createMetronome(onBeat) {
  let bpm = 80, beats = 4, accent = true;
  let timer = null, nextTime = 0, beat = 0, raf = null;
  const queue = [];

  function schedule() {
    const ctx = getCtx();
    while (nextTime < ctx.currentTime + 0.12) {
      click(nextTime, accent && beat === 0);
      queue.push({ beat, time: nextTime });
      nextTime += 60 / bpm;
      beat = (beat + 1) % beats;
    }
  }

  function draw() {
    const ctx = getCtx();
    while (queue.length && queue[0].time <= ctx.currentTime) onBeat(queue.shift().beat);
    raf = requestAnimationFrame(draw);
  }

  async function start() {
    const ctx = await unlockAudio();
    beat = 0;
    queue.length = 0;
    nextTime = ctx.currentTime + 0.08;
    schedule();
    timer = setInterval(schedule, 25);
    raf = requestAnimationFrame(draw);
  }

  function stop() {
    clearInterval(timer);
    cancelAnimationFrame(raf);
    timer = raf = null;
    queue.length = 0;
    onBeat(-1);
  }

  return {
    start, stop,
    get running() { return !!timer; },
    get bpm() { return bpm; },
    set bpm(v) { bpm = Math.max(30, Math.min(250, Math.round(v))); },
    get beats() { return beats; },
    set beats(v) { beats = v; beat = beat % v; },
    set accent(v) { accent = v; },
  };
}
