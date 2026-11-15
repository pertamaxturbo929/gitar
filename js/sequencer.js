// Penjadwal langkah berirama (dipakai pola genjrengan & progresi).
// Bunyi dijadwalkan lewat jam audio supaya tepat waktu; tampilan mengikuti lewat onVisual.
import { getCtx, unlockAudio } from './audio.js';

export function createSequencer({ onStep, onVisual }) {
  let bpm = 80, stepsPerBeat = 2, steps = 8;
  let timer = null, raf = null, next = 0, idx = 0;
  const queue = [];

  function schedule() {
    const ctx = getCtx();
    while (next < ctx.currentTime + 0.12) {
      onStep(idx, next);
      queue.push({ idx, time: next });
      next += 60 / bpm / stepsPerBeat;
      idx = (idx + 1) % steps;
    }
  }
  function draw() {
    const ctx = getCtx();
    while (queue.length && queue[0].time <= ctx.currentTime) onVisual(queue.shift().idx);
    raf = requestAnimationFrame(draw);
  }
  return {
    async start() {
      const ctx = await unlockAudio();
      idx = 0; queue.length = 0; next = ctx.currentTime + 0.1;
      schedule();
      timer = setInterval(schedule, 25);
      raf = requestAnimationFrame(draw);
    },
    stop() { clearInterval(timer); cancelAnimationFrame(raf); timer = raf = null; queue.length = 0; onVisual(-1); },
    get running() { return !!timer; },
    set bpm(v) { bpm = v; }, get bpm() { return bpm; },
    set stepsPerBeat(v) { stepsPerBeat = v; },
    set steps(v) { steps = v; idx = idx % v; },
  };
}
