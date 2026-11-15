import { NOTE_NAMES, CHORD_TYPES, INSTRUMENTS, chordType, chordTones, chordSymbol, noteName, octaveOf, pc } from './theory.js';
import { voicingsFor } from './chords.js';
import { chordDiagram } from './diagram.js';
import { createTuner } from './tuner.js';
import { createMetronome } from './metronome.js';
import { unlockAudio, strum, referenceTone, keepAwake } from './audio.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

// Penyimpanan kecil (aman kalau localStorage diblokir).
const store = {
  get(k, d) { try { const v = localStorage.getItem('gitar.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('gitar.' + k, JSON.stringify(v)); } catch { /* abaikan */ } },
};

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2600);
}

/* ---------------- Navigasi ---------------- */
const views = ['tuner', 'metronome', 'chords'];
function show(view) {
  if (!views.includes(view)) view = 'tuner';
  views.forEach((v) => ($('#view-' + v).hidden = v !== view));
  $$('.tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.view === view));
  $('#title').textContent = $('#view-' + view).dataset.title;
  if (view !== 'tuner' && tuner.running) stopTuner();
  store.set('view', view);
  window.scrollTo(0, 0);
}
$$('.tabbar button').forEach((b) => b.addEventListener('click', () => {
  history.replaceState(null, '', '#' + b.dataset.view);
  show(b.dataset.view);
}));

/* ---------------- Tuner ---------------- */
const guitar = INSTRUMENTS.guitar;
const STRING_LABELS = guitar.tuning.map((m, i) => ({ midi: m, num: guitar.tuning.length - i, name: noteName(m) }));
let targetMidi = null; // null = otomatis
let lastSignal = 0;

// Gambar zona & garis skala di gauge.
(function buildGauge() {
  const cx = 150, cy = 150, R = 120;
  const pt = (cents, r = R) => {
    const a = (cents / 50) * (Math.PI / 2);
    return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  };
  const arc = (c1, c2) => {
    const [x1, y1] = pt(c1), [x2, y2] = pt(c2);
    return `M${x1.toFixed(1)} ${y1.toFixed(1)} A${R} ${R} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  };
  $('#zones').innerHTML =
    `<path class="gauge-zone far" d="${arc(-50, 50)}"/>` +
    `<path class="gauge-zone near" d="${arc(-20, 20)}"/>` +
    `<path class="gauge-zone ok" d="${arc(-5, 5)}"/>`;
  let ticks = '';
  for (let c = -50; c <= 50; c += 10) {
    const [x1, y1] = pt(c, R - 16), [x2, y2] = pt(c, R - (c === 0 ? 34 : 26));
    ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"${c === 0 ? ' class="zero"' : ''}/>`;
  }
  $('#ticks').innerHTML = ticks;
})();

function renderStrings(activeMidi) {
  $('#strings').innerHTML = STRING_LABELS.map((s) => `
    <button class="string-btn${activeMidi === s.midi ? ' on' : ''}${targetMidi === s.midi ? ' locked' : ''}" data-midi="${s.midi}">
      <span class="snum">${s.num}</span><span class="sname">${s.name}</span>
    </button>`).join('');
}
renderStrings(null);

$('#strings').addEventListener('click', async (e) => {
  const b = e.target.closest('.string-btn');
  if (!b) return;
  const midi = Number(b.dataset.midi);
  await unlockAudio();
  referenceTone(midi);
  targetMidi = midi;
  $('#autoString').checked = false;
  renderStrings(midi);
});
$('#autoString').addEventListener('change', (e) => {
  if (e.target.checked) { targetMidi = null; renderStrings(null); }
  else if (targetMidi == null) { targetMidi = STRING_LABELS[0].midi; renderStrings(targetMidi); }
});

function nearestString(midi) {
  return STRING_LABELS.reduce((a, b) => (Math.abs(b.midi - midi) < Math.abs(a.midi - midi) ? b : a)).midi;
}

function setNeedle(cents) {
  const c = Math.max(-50, Math.min(50, cents));
  $('#needle').style.transform = `rotate(${(c / 50) * 90}deg)`;
}

function onReading(r) {
  const card = $('#tunerCard');
  const now = performance.now();
  if (!r) {
    if (now - lastSignal > 1200) {
      card.classList.remove('ok', 'near', 'far');
      card.classList.add('idle');
      $('#tHint').textContent = 'Petik satu senar…';
    }
    return;
  }
  lastSignal = now;
  card.classList.remove('idle');

  const auto = targetMidi == null;
  const target = auto ? nearestString(r.midi) : targetMidi;
  // Mode otomatis: kalau nadanya jauh dari senar mana pun, tampilkan nada terdekat saja.
  const ref = auto && Math.abs(r.midi - target) > 1.5 ? Math.round(r.midi) : target;
  const cents = Math.round((r.midi - ref) * 100);

  $('#tNote').textContent = noteName(ref);
  $('#tOct').textContent = octaveOf(ref);
  $('#tCents').textContent = `${cents > 0 ? '+' : ''}${cents} cent · ${r.freq.toFixed(1)} Hz`;
  setNeedle(cents);
  renderStringsIfChanged(auto ? (ref === target ? target : null) : targetMidi);

  const abs = Math.abs(cents);
  card.classList.toggle('ok', abs <= 5);
  card.classList.toggle('near', abs > 5 && abs <= 20);
  card.classList.toggle('far', abs > 20);
  let hint;
  if (abs <= 5) hint = '✓ Pas! Lanjut ke senar berikutnya.';
  else if (cents < 0) hint = abs > 100 ? '⬆ Jauh terlalu rendah. Kencangkan senar (putar pelan).' : '⬆ Terlalu rendah. Kencangkan sedikit.';
  else hint = abs > 100 ? '⬇ Jauh terlalu tinggi. Kendurkan senar (putar pelan).' : '⬇ Terlalu tinggi. Kendurkan sedikit.';
  $('#tHint').textContent = hint;
}

let shownString = undefined;
function renderStringsIfChanged(m) {
  if (m === shownString) return;
  shownString = m;
  renderStrings(m);
}

const tuner = createTuner(onReading);

async function startTuner() {
  try {
    await tuner.start();
    keepAwake(true);
    $('#tunerBtn').textContent = '■ Stop Tuner';
    $('#tunerBtn').classList.add('active');
    $('#tunerMsg').textContent = 'Mendengarkan… dekatkan HP ke lubang gitar.';
    $('#tHint').textContent = 'Petik satu senar…';
    $('#tunerCard').classList.add('idle');
  } catch (err) {
    const msg = err && err.message === 'nomic'
      ? 'Browser ini tidak bisa akses mikrofon. Buka lewat Safari (iPhone/iPad) atau Chrome (Android).'
      : 'Mikrofon tidak bisa dipakai. Cek izin mikrofon untuk situs ini di pengaturan browser.';
    $('#tunerMsg').textContent = msg;
    toast(msg);
  }
}
function stopTuner() {
  tuner.stop();
  keepAwake(false);
  $('#tunerBtn').textContent = '🎤 Mulai Tuner';
  $('#tunerBtn').classList.remove('active');
  $('#tunerMsg').textContent = 'Tuner berhenti.';
  $('#tunerCard').classList.remove('ok', 'near', 'far');
  $('#tunerCard').classList.add('idle');
  setNeedle(0);
}
$('#tunerBtn').addEventListener('click', () => (tuner.running ? stopTuner() : startTuner()));

/* ---------------- Metronom ---------------- */
const metro = createMetronome(onBeat);
metro.bpm = store.get('bpm', 80);
metro.beats = store.get('beats', 4);

function tempoName(b) {
  if (b < 60) return 'pelan sekali';
  if (b < 76) return 'pelan';
  if (b < 108) return 'sedang';
  if (b < 140) return 'cepat';
  return 'cepat sekali';
}
function renderBpm() {
  $('#bpm').textContent = metro.bpm;
  $('#bpmSlider').value = metro.bpm;
  $('#tempoName').textContent = '· ' + tempoName(metro.bpm);
  store.set('bpm', metro.bpm);
}
function renderBeats() {
  $('#beatDots').innerHTML = Array.from({ length: metro.beats }, (_, i) => `<span class="beat${i === 0 ? ' first' : ''}">${i + 1}</span>`).join('');
  $$('#meterChips .chip').forEach((c) => c.classList.toggle('on', Number(c.dataset.beats) === metro.beats));
  store.set('beats', metro.beats);
}
function onBeat(i) {
  $$('#beatDots .beat').forEach((d, j) => d.classList.toggle('on', j === i));
  if (i < 0) return;
  const p = $('#pulse');
  p.classList.remove('hit', 'hit1');
  void p.offsetWidth; // ulang animasi
  p.classList.add(i === 0 ? 'hit1' : 'hit');
}
renderBpm();
renderBeats();

$$('.bpm-controls [data-step]').forEach((b) => b.addEventListener('click', () => {
  metro.bpm = metro.bpm + Number(b.dataset.step);
  renderBpm();
}));
$('#bpmSlider').addEventListener('input', (e) => { metro.bpm = Number(e.target.value); renderBpm(); });
$('#meterChips').addEventListener('click', (e) => {
  const c = e.target.closest('.chip');
  if (!c) return;
  metro.beats = Number(c.dataset.beats);
  renderBeats();
});
$('#accent').addEventListener('change', (e) => (metro.accent = e.target.checked));

const taps = [];
$('#tapBtn').addEventListener('click', () => {
  const now = performance.now();
  if (taps.length && now - taps[taps.length - 1] > 2000) taps.length = 0;
  taps.push(now);
  if (taps.length > 6) taps.shift();
  if (taps.length >= 2) {
    const avg = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
    metro.bpm = 60000 / avg;
    renderBpm();
  }
});

$('#metroBtn').addEventListener('click', async () => {
  if (metro.running) {
    metro.stop();
    keepAwake(false);
    $('#metroBtn').textContent = '▶ Mulai';
    $('#metroBtn').classList.remove('active');
  } else {
    await metro.start();
    keepAwake(true);
    $('#metroBtn').textContent = '■ Stop';
    $('#metroBtn').classList.add('active');
  }
});

/* ---------------- Chord ---------------- */
const state = {
  root: store.get('root', 0),
  type: store.get('type', 'maj'),
  mode: store.get('mode', 'finger'),
  idx: 0,
};

const STARTERS = [
  [0, 'maj'], [7, 'maj'], [2, 'maj'], [4, 'min'], [9, 'min'], [4, 'maj'], [9, 'maj'], [2, 'min'], [5, 'maj'],
];

$('#starterChips').innerHTML = STARTERS.map(([r, t]) => `<button class="chip" data-r="${r}" data-t="${t}">${chordSymbol(r, t)}</button>`).join('');
$('#rootChips').innerHTML = NOTE_NAMES.map((n, i) => `<button class="chip" data-r="${i}">${n}</button>`).join('');
$('#typeChips').innerHTML = CHORD_TYPES.map((t) => `<button class="chip" data-t="${t.id}">${t.label}</button>`).join('');

$('#starterChips').addEventListener('click', (e) => {
  const c = e.target.closest('.chip');
  if (!c) return;
  state.root = Number(c.dataset.r); state.type = c.dataset.t; state.idx = 0;
  renderChord();
});
$('#rootChips').addEventListener('click', (e) => {
  const c = e.target.closest('.chip');
  if (!c) return;
  state.root = Number(c.dataset.r); state.idx = 0;
  renderChord();
});
$('#typeChips').addEventListener('click', (e) => {
  const c = e.target.closest('.chip');
  if (!c) return;
  state.type = c.dataset.t; state.idx = 0;
  renderChord();
});
$('#modeSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  state.mode = b.dataset.mode;
  renderChord();
});
$('#prevV').addEventListener('click', () => { state.idx--; renderChord(); });
$('#nextV').addEventListener('click', () => { state.idx++; renderChord(); });

function currentVoicing() {
  const list = voicingsFor(state.root, state.type);
  state.idx = (state.idx + list.length) % list.length;
  return { list, v: list[state.idx] };
}

function renderChord() {
  const type = chordType(state.type);
  const tones = chordTones(state.root, state.type);
  const intervalOf = (p) => (tones.find((t) => t.pc === p) || {}).label || '?';
  const { list, v } = currentVoicing();
  const symbol = chordSymbol(state.root, state.type);

  $('#chordName').textContent = symbol;
  $('#chordFull').textContent = `${NOTE_NAMES[state.root]} ${type.name}`;
  $('#diagram').innerHTML = chordDiagram(v, { rootPc: state.root, intervalOf, mode: state.mode });
  const where = v.source === 'curated' ? 'bentuk standar' : v.label || `mulai fret ${v.baseFret}`;
  $('#vLabel').innerHTML = `Posisi ${state.idx + 1}/${list.length}<small>${where}</small>`;
  $('#chordNotes').innerHTML = tones.map((t) => `<span class="tone${t.interval === 0 ? ' root' : ''}">${t.name}</span>`).join(' ');
  $('#chordFormula').innerHTML = tones.map((t) => `<span class="tone${t.interval === 0 ? ' root' : ''}">${t.label}</span>`).join(' ');
  $('#chordDesc').textContent = type.desc;

  $$('#rootChips .chip').forEach((c) => c.classList.toggle('on', Number(c.dataset.r) === state.root));
  $$('#typeChips .chip').forEach((c) => c.classList.toggle('on', c.dataset.t === state.type));
  $$('#starterChips .chip').forEach((c) => c.classList.toggle('on', Number(c.dataset.r) === state.root && c.dataset.t === state.type));
  $$('#modeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === state.mode));
  store.set('root', state.root); store.set('type', state.type); store.set('mode', state.mode);
}
renderChord();

$('#strumBtn').addEventListener('click', async () => { await unlockAudio(); strum(currentVoicing().v.notes); });
$('#arpBtn').addEventListener('click', async () => { await unlockAudio(); strum(currentVoicing().v.notes, { arpeggio: true }); });

// Geser kiri/kanan di diagram untuk ganti posisi.
let touchX = null;
$('#diagram').addEventListener('touchstart', (e) => (touchX = e.touches[0].clientX), { passive: true });
$('#diagram').addEventListener('touchend', (e) => {
  if (touchX == null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  touchX = null;
  if (Math.abs(dx) > 50) { state.idx += dx < 0 ? 1 : -1; renderChord(); }
});

/* ---------------- Mulai ---------------- */
show(location.hash.slice(1) || store.get('view', 'tuner'));

document.addEventListener('visibilitychange', () => {
  if (document.hidden && tuner.running) stopTuner();
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw && nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('Versi baru tersedia. Tutup lalu buka lagi aplikasinya.');
        });
      });
    }).catch(() => {});
  });
}
