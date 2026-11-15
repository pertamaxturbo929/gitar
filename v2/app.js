import { NOTE_NAMES, CHORD_TYPES, INSTRUMENTS, chordType, chordTones, chordSymbol, noteName, octaveOf } from '../js/theory.js';
import { voicingsFor } from '../js/chords.js';
import { chordDiagram } from '../js/diagram.js';
import { createTuner } from '../js/tuner.js';
import { createMetronome } from '../js/metronome.js';
import { unlockAudio, strum, referenceTone, keepAwake } from '../js/audio.js';
import { Wheel, Ring, el } from './wheel.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {
  get(k, d) { try { const v = localStorage.getItem('gitar2.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('gitar2.' + k, JSON.stringify(v)); } catch { /* abaikan */ } },
};
let toastT;
function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2600); }

/* ---------- Ikon (garis, 24x24) ---------- */
const ICONS = {
  tuner: '<path d="M9 3v7a3 3 0 0 0 6 0V3M12 13v8M9 21h6"/>',
  metro: '<path d="M9 3h6l4 18H5L9 3zM12 16l5-10M7.6 16h8.8"/>',
  chord: '<path d="M7 3v18M11 3v18M15 3v18M19 3v18M5 8h16M5 13h16M5 18h16"/><circle class="fill" cx="11" cy="10.5" r="1.8"/><circle class="fill" cx="15" cy="15.5" r="1.8"/>',
  strum: '<path d="M4 12c2-6 4-6 6 0s4 6 6 0 4-6 6 0"/>',
  drill: '<rect x="4" y="5" width="12" height="15" rx="1"/><path d="M8 3h11a1 1 0 0 1 1 1v14"/>',
  ear: '<path d="M7 9a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-6 0M10 9a2 2 0 0 1 4 0"/>',
  play: '<path class="fill" d="M8 5l12 7-12 7z"/>',
  arp: '<path d="M5 18V8l4-2v10M13 18V6l4-2v10"/><circle class="fill" cx="5" cy="18" r="2"/><circle class="fill" cx="13" cy="18" r="2"/>',
  stop: '<rect class="fill" x="6" y="6" width="12" height="12"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4"/>',
  tap: '<path d="M9 11V5a1.5 1.5 0 0 1 3 0v6M12 10a1.5 1.5 0 0 1 3 0v1M15 11a1.5 1.5 0 0 1 3 0v4a6 6 0 0 1-6 6h-1a5 5 0 0 1-4-2l-3-4a1.5 1.5 0 0 1 2.3-2L9 15"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24">${ICONS[name]}</svg>`;

/* ---------- Roda & layout ---------- */
const wheel = new Wheel($('#wheel'));
let geo = null;

function computeLayout() {
  const W = innerWidth, H = innerHeight;
  const wide = W >= 820 && W > H;
  const V = wide ? Math.min(W * 0.36, H * 0.56) : Math.max(170, Math.min(W * 0.5, 400));
  const k = wide ? H * 0.58 : Math.max(240, Math.min(H * 0.36, 520));
  const bands = wide ? [k, k + V * 0.28, k + V * 0.63, k + V] : [k, k + V * 0.32, k + V * 0.66, k + V];
  return { W, H, wide, narrow: W < 430, V, cx: -k, cy: H / 2, bands };
}

function applyLayout() {
  geo = computeLayout();
  document.body.classList.toggle('wide', geo.wide);
  document.body.classList.toggle('narrow', geo.narrow);
  $('#side').style.left = `${geo.V + (geo.wide ? 28 : 12)}px`;
  wheel.layout({ cx: geo.cx, cy: geo.cy, bands: geo.bands, height: geo.H });
}

/* ---------- Menu utama (cincin dalam) ---------- */
const MENU = [
  { id: 'tuner', label: 'Tuner', icon: 'tuner' },
  { id: 'metronome', label: 'Metronom', icon: 'metro' },
  { id: 'chords', label: 'Chord', icon: 'chord' },
  { id: 'strum', label: 'Genjrengan', icon: 'strum', disabled: true },
  { id: 'drill', label: 'Latihan', icon: 'drill', disabled: true },
  { id: 'ear', label: 'Telinga', icon: 'ear', disabled: true },
];

const menuRing = () => new Ring({
  id: 'menu', items: MENU, loop: true, spacing: 62,
  index: Math.max(0, MENU.findIndex((m) => m.id === state.mode)),
  render(g, item) {
    const s = el('g', { class: 'icon', transform: 'translate(-13 -13) scale(1.08)' }, g);
    s.innerHTML = ICONS[item.icon];
  },
  onSettle(i, item) { if (item.id !== state.mode) setMode(item.id); },
});

const textRender = (size) => (g, item) => {
  const t = el('text', { class: 'ring-label', 'font-size': size }, g);
  t.textContent = item.label;
};

/* ---------- State ---------- */
const state = {
  mode: store.get('mode', 'chords'),
  root: store.get('root', 0),
  type: store.get('type', 'maj'),
  vIdx: 0,
  dmode: store.get('dmode', 'finger'),
};
function save() { ['mode', 'root', 'type', 'dmode'].forEach((k) => store.set(k, state[k])); }

let cleanup = () => {};
function setMode(mode) {
  cleanup(); cleanup = () => {};
  state.mode = mode; save();
  const modes = { chords: chordMode, tuner: tunerMode, metronome: metroMode };
  (modes[mode] || soonMode)(mode);
}

/* ================= CHORD ================= */
function chordMode() {
  const roots = NOTE_NAMES.map((n) => ({ label: n }));
  const types = CHORD_TYPES.map((t) => ({ label: t.id === 'maj' ? 'MAYOR' : t.id === 'min' ? 'MINOR' : t.label, id: t.id }));
  wheel.setRings([
    menuRing(),
    new Ring({ id: 'root', items: roots, loop: true, spacing: geo.narrow ? 50 : 58, index: state.root,
      render: textRender(geo.narrow ? 22 : 26),
      onChange(i) { state.root = i; state.vIdx = 0; renderChord(); },
      onTap() { playCurrent(); } }),
    new Ring({ id: 'type', items: types, loop: true, spacing: geo.narrow ? 50 : 60,
      index: CHORD_TYPES.findIndex((t) => t.id === state.type),
      render: textRender(geo.narrow ? 17 : 20),
      onChange(i, item) { state.type = item.id; state.vIdx = 0; renderChord(); },
      onTap() { playCurrent(); } }),
  ]);

  $('#info').innerHTML = `
    <div class="kicker">Chord</div>
    <div class="title" id="cName"></div>
    <div class="sub" id="cFull"></div>
    <div class="meta" id="cNotes"></div>
    <div class="meta" id="cFormula"></div>
    <div class="row">
      <button class="icon-btn primary big" id="cPlay" aria-label="Genjreng">${icon('play')}</button>
      <button class="icon-btn big" id="cArp" aria-label="Petik satu-satu">${icon('arp')}</button>
    </div>
    <div class="row"><div class="seg" id="cSeg">
      <button data-m="finger">Jari</button><button data-m="note">Nada</button><button data-m="interval">Rumus</button>
    </div></div>`;
  $('#cPlay').onclick = () => playCurrent();
  $('#cArp').onclick = () => playCurrent(true);
  $('#cSeg').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; state.dmode = b.dataset.m; save(); renderChord(); };
  $('#cards').onclick = (e) => {
    const c = e.target.closest('.card'); if (!c) return;
    state.vIdx = Number(c.dataset.i); markCard(); playCurrent();
  };
  renderChord();
}

function currentVoicings() { return voicingsFor(state.root, state.type); }

let renderQueued = false;
function renderChord() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    if (state.mode !== 'chords') return;
    const type = chordType(state.type);
    const tones = chordTones(state.root, state.type);
    const intervalOf = (p) => (tones.find((t) => t.pc === p) || {}).label || '?';
    $('#cName').textContent = chordSymbol(state.root, state.type);
    $('#cFull').textContent = `${NOTE_NAMES[state.root]} ${type.name}`;
    $('#cNotes').innerHTML = tones.map((t) => `<span class="tag${t.interval ? ' ghost' : ''}">${t.name}</span>`).join('');
    $('#cFormula').innerHTML = tones.map((t) => `<span class="tag${t.interval ? ' ghost' : ''}">${t.label}</span>`).join('');
    $$('#cSeg button').forEach((b) => b.classList.toggle('on', b.dataset.m === state.dmode));
    const list = currentVoicings();
    $('#cards').innerHTML = list.map((v, i) => `
      <div class="card" data-i="${i}">
        ${chordDiagram(v, { rootPc: state.root, intervalOf, mode: state.dmode })}
        <div class="card-label">${v.source === 'curated' ? 'Standar' : v.label ? v.label.replace(' (barre)', '') : 'Fret ' + v.baseFret}</div>
      </div>`).join('');
    markCard();
    save();
  });
}
function markCard() { $$('#cards .card').forEach((c) => c.classList.toggle('on', Number(c.dataset.i) === state.vIdx)); }
async function playCurrent(arp = false) {
  await unlockAudio();
  const v = currentVoicings()[state.vIdx] || currentVoicings()[0];
  strum(v.notes, { arpeggio: arp });
}

/* ================= TUNER ================= */
function tunerMode() {
  const guitar = INSTRUMENTS.guitar;
  const strings = guitar.tuning.map((m, i) => ({ midi: m, num: guitar.tuning.length - i, label: noteName(m) })).reverse(); // senar 1 di atas
  let locked = null; // midi senar terkunci, null = otomatis
  let lastSignal = 0;
  const cents = [];
  for (let c = -50; c <= 50; c++) cents.push({ c });

  const stringRing = new Ring({ id: 'strings', items: strings, loop: false, spacing: geo.narrow ? 48 : 56, index: 5,
    render(g, item) {
      el('text', { class: 'ring-label', 'font-size': geo.narrow ? 24 : 28, y: -4 }, g).textContent = item.label;
      el('text', { class: 'ring-label', 'font-size': 11, y: 15 }, g).textContent = 'SENAR ' + item.num;
    },
    onSettle(i, item) { if (dragging) { locked = item.midi; dragging = false; referenceTone(item.midi); markStrings(); } },
  });
  let dragging = false;
  const centRing = new Ring({ id: 'cents', className: 'ring-cents', items: cents, loop: false, spacing: 4.2, index: 50,
    interactive: false, sector: false, upright: false,
    render(g, item) {
      const major = item.c % 10 === 0;
      const len = major ? 16 : item.c % 5 === 0 ? 10 : 6;
      if (item.c === 0) el('line', { class: 'zero-tick', x1: -18, x2: 18, y1: 0, y2: 0 }, g);
      else el('line', { class: 'tick' + (major ? ' major' : ''), x1: -len, x2: len, y1: 0, y2: 0 }, g);
      if (major && item.c !== 0) {
        const t = el('text', { class: 'tick-label', x: 30, y: 0 }, g);
        t.textContent = (item.c > 0 ? '+' : '') + item.c;
      }
    },
  });
  wheel.setRings([menuRing(), stringRing, centRing]);
  // Tandai saat pengguna memutar sendiri cincin senar.
  const onDown = (e) => {
    const r = $('#wheel').getBoundingClientRect();
    if (wheel.ringAt(e.clientX - r.left, e.clientY - r.top) === stringRing) dragging = true;
  };
  $('#wheel').addEventListener('pointerdown', onDown);

  $('#info').innerHTML = `
    <div class="kicker">Tuner · gitar standar</div>
    <div class="tuner idle" id="tBox"><div class="note-big" id="tNote">–</div></div>
    <div class="sub" id="tCents">&nbsp;</div>
    <div class="hint" id="tHint">Tekan mic, lalu petik satu senar.</div>
    <div class="row">
      <button class="icon-btn primary big" id="tBtn" aria-label="Mulai tuner">${icon('mic')}</button>
      <label class="check"><input type="checkbox" id="tAuto" checked> Otomatis</label>
    </div>`;
  $('#cards').innerHTML = strings.map((s) => `
    <button class="card str-card" data-m="${s.midi}"><span class="s">Senar ${s.num}<br>${s.num === 6 ? 'paling tebal' : s.num === 1 ? 'paling tipis' : '&nbsp;'}</span><span class="n">${s.label}</span></button>`).join('');

  function markStrings(hit) {
    $$('#cards .str-card').forEach((c) => {
      const m = Number(c.dataset.m);
      c.classList.toggle('locked', m === locked);
      c.classList.toggle('hit', m === hit);
    });
    $('#tAuto').checked = locked == null;
  }
  $('#cards').onclick = async (e) => {
    const c = e.target.closest('.str-card'); if (!c) return;
    await unlockAudio();
    locked = Number(c.dataset.m);
    referenceTone(locked);
    stringRing.setIndex(strings.findIndex((s) => s.midi === locked));
    markStrings();
  };
  $('#tAuto').onchange = (e) => { locked = e.target.checked ? null : strings[stringRing.selected].midi; markStrings(); };

  const nearest = (midi) => strings.reduce((a, b) => (Math.abs(b.midi - midi) < Math.abs(a.midi - midi) ? b : a));
  const tuner = createTuner((r) => {
    const box = $('#tBox'); if (!box) return;
    const now = performance.now();
    if (!r) {
      if (now - lastSignal > 1200) { box.className = 'tuner idle'; $('#tHint').textContent = 'Petik satu senar…'; }
      return;
    }
    lastSignal = now;
    const target = locked != null ? strings.find((s) => s.midi === locked) : nearest(r.midi);
    const ref = locked == null && Math.abs(r.midi - target.midi) > 1.5 ? Math.round(r.midi) : target.midi;
    const c = Math.round((r.midi - ref) * 100);
    if (locked == null && ref === target.midi && stringRing.selected !== strings.indexOf(target)) stringRing.setIndex(strings.indexOf(target));
    centRing.pos = 50 + Math.max(-50, Math.min(50, c));
    centRing.draw();
    const abs = Math.abs(c);
    centRing.g.classList.toggle('ok', abs <= 5);
    box.className = 'tuner ' + (abs <= 5 ? 'ok' : abs <= 20 ? 'near' : 'far');
    $('#tNote').innerHTML = `${noteName(ref)}<sub>${octaveOf(ref)}</sub>`;
    $('#tCents').textContent = `${c > 0 ? '+' : ''}${c} cent · ${r.freq.toFixed(1)} Hz`;
    $('#tHint').textContent = abs <= 5 ? '✓ Pas! Lanjut senar berikutnya.'
      : c < 0 ? (abs > 100 ? '▲ Jauh terlalu rendah. Kencangkan.' : '▲ Terlalu rendah. Kencangkan sedikit.')
      : (abs > 100 ? '▼ Jauh terlalu tinggi. Kendurkan.' : '▼ Terlalu tinggi. Kendurkan sedikit.');
    markStrings(ref === target.midi ? target.midi : null);
  });

  const stop = () => {
    tuner.stop(); keepAwake(false);
    const b = $('#tBtn'); if (b) b.innerHTML = icon('mic');
  };
  $('#tBtn').onclick = async () => {
    if (tuner.running) { stop(); $('#tHint').textContent = 'Tuner berhenti.'; return; }
    try {
      await tuner.start(); keepAwake(true);
      $('#tBtn').innerHTML = icon('stop');
      $('#tHint').textContent = 'Mendengarkan… petik satu senar.';
    } catch (err) {
      const m = err && err.message === 'nomic' ? 'Browser ini tidak bisa akses mikrofon.' : 'Izin mikrofon ditolak. Cek pengaturan browser.';
      $('#tHint').textContent = m; toast(m);
    }
  };
  const vis = () => { if (document.hidden && tuner.running) stop(); };
  document.addEventListener('visibilitychange', vis);
  markStrings();
  cleanup = () => { stop(); $('#wheel').removeEventListener('pointerdown', onDown); document.removeEventListener('visibilitychange', vis); };
}

/* ================= METRONOM ================= */
function metroMode() {
  const metro = createMetronome(onBeat);
  metro.bpm = store.get('bpm', 80);
  metro.beats = store.get('beats', 4);
  const meters = [{ label: '2/4', b: 2 }, { label: '3/4', b: 3 }, { label: '4/4', b: 4 }, { label: '6/8', b: 6 }];
  const bpms = [];
  for (let b = 30; b <= 250; b++) bpms.push({ b });

  const bpmRing = new Ring({ id: 'bpm', items: bpms, loop: false, spacing: 9, index: metro.bpm - 30, sector: false, upright: false,
    render(g, item) {
      const major = item.b % 10 === 0;
      const len = major ? 16 : item.b % 5 === 0 ? 10 : 5;
      el('line', { class: 'tick' + (major ? ' major' : ''), x1: -len - 8, x2: len - 8, y1: 0, y2: 0 }, g);
      if (major) el('text', { class: 'tick-label', x: -34, y: 0, style: 'font-size:14px' }, g).textContent = item.b;
    },
    onChange(i, item) { metro.bpm = item.b; renderBpm(); },
  });
  wheel.setRings([
    menuRing(),
    new Ring({ id: 'meter', items: meters, loop: false, spacing: geo.narrow ? 50 : 58, index: meters.findIndex((m) => m.b === metro.beats),
      render: textRender(geo.narrow ? 22 : 26),
      onChange(i, item) { metro.beats = item.b; store.set('beats', item.b); renderBeats(); } }),
    bpmRing,
  ]);

  $('#info').innerHTML = `
    <div class="kicker">Metronom</div>
    <div class="bpm-big" id="mBpm"></div>
    <div class="sub"><span id="mName"></span></div>
    <div class="row">
      <button class="icon-btn primary big" id="mBtn" aria-label="Mulai">${icon('play')}</button>
      <button class="icon-btn big" id="mTap" aria-label="Tap tempo">${icon('tap')}</button>
      <button class="icon-btn pm" id="mMinus" aria-label="Kurangi">−</button>
      <button class="icon-btn pm" id="mPlus" aria-label="Tambah">+</button>
    </div>
    <div class="row"><label class="check"><input type="checkbox" id="mAcc" checked> Aksen ketukan 1</label></div>
    <div class="small">Putar cincin luar untuk ganti tempo.</div>`;

  function tempoName(b) { return b < 60 ? 'Pelan sekali' : b < 76 ? 'Pelan' : b < 108 ? 'Sedang' : b < 140 ? 'Cepat' : 'Cepat sekali'; }
  function renderBpm() {
    $('#mBpm').textContent = metro.bpm;
    $('#mName').textContent = tempoName(metro.bpm) + ' · BPM';
    store.set('bpm', metro.bpm);
  }
  function renderBeats() {
    $('#cards').innerHTML = Array.from({ length: metro.beats }, (_, i) =>
      `<div class="card beat-card${i === 0 ? ' first' : ''}"><span class="s">Ketukan</span><span class="n">${i + 1}</span></div>`).join('');
  }
  function onBeat(i) {
    $$('#cards .beat-card').forEach((c, j) => {
      c.classList.remove('flash');
      if (j === i) { void c.offsetWidth; c.classList.add('flash'); setTimeout(() => c.classList.remove('flash'), 120); }
    });
  }
  const setBpm = (b) => { metro.bpm = b; bpmRing.setIndex(metro.bpm - 30); renderBpm(); };
  $('#mMinus').onclick = () => setBpm(metro.bpm - 1);
  $('#mPlus').onclick = () => setBpm(metro.bpm + 1);
  $('#mAcc').onchange = (e) => (metro.accent = e.target.checked);
  const taps = [];
  $('#mTap').onclick = () => {
    const now = performance.now();
    if (taps.length && now - taps[taps.length - 1] > 2000) taps.length = 0;
    taps.push(now); if (taps.length > 6) taps.shift();
    if (taps.length >= 2) setBpm(Math.round(60000 / ((taps[taps.length - 1] - taps[0]) / (taps.length - 1))));
  };
  $('#mBtn').onclick = async () => {
    if (metro.running) { metro.stop(); keepAwake(false); $('#mBtn').innerHTML = icon('play'); }
    else { await metro.start(); keepAwake(true); $('#mBtn').innerHTML = icon('stop'); }
  };
  renderBpm(); renderBeats();
  cleanup = () => { if (metro.running) { metro.stop(); keepAwake(false); } };
}

/* ================= SEGERA ================= */
function soonMode(mode) {
  const item = MENU.find((m) => m.id === mode);
  wheel.setRings([menuRing(),
    new Ring({ id: 'x1', items: [{ label: '' }], loop: false, interactive: false, sector: false }),
    new Ring({ id: 'x2', items: [{ label: '' }], loop: false, interactive: false, sector: false })]);
  $('#info').innerHTML = `<div class="kicker">Segera hadir</div><div class="title">${item.label}</div>
    <div class="soon">Menu ini masuk tahap berikutnya. Putar cincin dalam untuk kembali ke Tuner, Metronom, atau Chord.</div>`;
  $('#cards').innerHTML = '';
}

/* ---------- Mulai ---------- */
applyLayout();
setMode(MENU.some((m) => m.id === state.mode) ? state.mode : 'chords');
let rt;
addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { applyLayout(); setMode(state.mode); }, 150); });
