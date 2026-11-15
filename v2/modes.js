// Menu tambahan: Progresi, Genjrengan, Latihan, Telinga.
// Tiap fungsi menerima `ui` (alat bersama dari app.js) dan mengembalikan fungsi pembersih.
import { NOTE_NAMES, chordSymbol, chordType, diatonicChords, PROGRESSIONS, progressionChords } from '../js/theory.js';
import { voicingsFor } from '../js/chords.js';
import { chordDiagram } from '../js/diagram.js';
import { unlockAudio, strum, playNote, click, keepAwake, getCtx } from '../js/audio.js';
import { createSequencer } from '../js/sequencer.js';
import { Ring } from './wheel.js';

const intervalLabeler = (rootPc, typeId) => {
  const map = {};
  chordType(typeId).intervals.forEach((iv) => { map[(rootPc + iv) % 12] = { 0: '1', 2: '9', 3: 'b3', 4: '3', 5: '4', 7: '5', 10: 'b7', 11: '7' }[iv % 12] || '?'; });
  return (p) => map[p] || '?';
};
const diagramFor = (rootPc, typeId, mode = 'finger') => {
  const v = voicingsFor(rootPc, typeId)[0];
  return chordDiagram(v, { rootPc, intervalOf: intervalLabeler(rootPc, typeId), mode });
};
const firstVoicing = (rootPc, typeId) => voicingsFor(rootPc, typeId)[0];

// Chord yang aman untuk pemula (dipakai beberapa menu).
const EASY = [[0, 'maj'], [7, 'maj'], [2, 'maj'], [9, 'min'], [4, 'min'], [4, 'maj'], [9, 'maj'], [2, 'min'], [5, 'maj']];

/* ======================= PROGRESI / FAMILY CHORD ======================= */
export function progressionMode(ui) {
  const { $, $$, wheel, el, icon, store } = ui;
  let key = store.get('pKey', 0);
  let kmode = store.get('pMode', 'major');
  let progIdx = 0;
  let playing = -1;
  const seq = createSequencer({
    onStep(i, time) {
      // 1 langkah = 1 ketukan; tiap chord 4 ketukan.
      const chords = current();
      const ci = Math.floor(i / 4) % chords.length;
      const c = chords[ci];
      click(time, i % 4 === 0);
      strum(firstVoicing(c.pc, c.type === 'dim' ? 'min' : c.type).notes, { when: time + 0.005, up: i % 2 === 1, gain: i % 4 === 0 ? 0.42 : 0.28 });
    },
    onVisual(i) {
      playing = i < 0 ? -1 : Math.floor(i / 4) % current().length;
      $$('#cards .card').forEach((c, j) => c.classList.toggle('on', j === playing));
      const on = $('#cards .card.on');
      if (on) on.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
  });
  seq.stepsPerBeat = 1;
  seq.bpm = store.get('pBpm', 80);

  const progs = () => PROGRESSIONS[kmode];
  const current = () => progressionChords(key, kmode, progs()[Math.min(progIdx, progs().length - 1)]);

  function rings() {
    wheel.setRings([
      ui.menuRing(),
      new Ring({ id: 'key', items: NOTE_NAMES.map((n) => ({ label: kmode === 'minor' ? n + 'm' : n })), loop: true,
        spacing: ui.geo.narrow ? 50 : 58, index: key, render: ui.textRender(ui.geo.narrow ? 22 : 26),
        onChange(i) { key = i; store.set('pKey', key); render(); } }),
      new Ring({ id: 'prog', items: progs().map((p) => ({ label: p.name })), loop: false, weight: 1.25,
        spacing: ui.geo.narrow ? 44 : 52, index: Math.min(progIdx, progs().length - 1), render: ui.textRender(ui.geo.narrow ? 15 : 18),
        onChange(i) { progIdx = i; render(); } }),
    ]);
  }

  $('#info').innerHTML = `
    <div class="kicker">Progresi · family chord</div>
    <div class="title" id="pKey"></div>
    <div class="small" id="pNote" style="margin-top:4px"></div>
    <div class="fam" id="pFam"></div>
    <div class="row">
      <button class="icon-btn primary big" id="pPlay" aria-label="Mainkan">${icon('play')}</button>
      <div class="seg" id="pSeg"><button data-m="major">Mayor</button><button data-m="minor">Minor</button></div>
    </div>
    <div class="row stepper"><button class="icon-btn" id="pSlow">−</button><span id="pBpm"></span><button class="icon-btn" id="pFast">+</button></div>
    <div class="small">Putar cincin kunci = transpose. Semua chord ikut pindah.</div>`;

  function render() {
    const fam = diatonicChords(key, kmode);
    $('#pKey').textContent = kmode === 'minor' ? NOTE_NAMES[key] + 'm' : NOTE_NAMES[key];
    $('#pNote').textContent = (kmode === 'minor' ? 'Kunci minor · ' : 'Kunci mayor · ') + progs()[Math.min(progIdx, progs().length - 1)].note;
    const used = new Set(current().map((c) => c.degree));
    $('#pFam').innerHTML = fam.map((c) => `
      <div class="fam-item${used.has(c.degree) ? ' used' : ''}">
        <span class="r">${c.roman}</span>
        <span class="c">${NOTE_NAMES[c.pc]}${c.type === 'min' ? 'm' : c.type === 'dim' ? '°' : ''}</span>
      </div>`).join('');
    $$('#pSeg button').forEach((b) => b.classList.toggle('on', b.dataset.m === kmode));
    $('#pBpm').textContent = `${seq.bpm} BPM`;
    $('#cards').innerHTML = current().map((c, i) => {
      const t = c.type === 'dim' ? 'min' : c.type;
      return `<div class="card" data-i="${i}">
        <div class="card-head"><span class="roman">${c.roman}</span><span class="name">${chordSymbol(c.pc, t)}</span></div>
        ${diagramFor(c.pc, t)}
        <div class="card-label">Birama ${i + 1}</div>
      </div>`;
    }).join('');
  }

  $('#pPlay').onclick = async () => {
    if (seq.running) { seq.stop(); keepAwake(false); $('#pPlay').innerHTML = icon('play'); }
    else { seq.steps = current().length * 4; await seq.start(); keepAwake(true); $('#pPlay').innerHTML = icon('stop'); }
  };
  $('#pSeg').onclick = (e) => {
    const b = e.target.closest('button'); if (!b || b.dataset.m === kmode) return;
    kmode = b.dataset.m; store.set('pMode', kmode); progIdx = 0;
    if (seq.running) $('#pPlay').click();
    rings(); render();
  };
  const bump = (d) => { seq.bpm = Math.max(40, Math.min(200, seq.bpm + d)); store.set('pBpm', seq.bpm); $('#pBpm').textContent = `${seq.bpm} BPM`; };
  $('#pSlow').onclick = () => bump(-5);
  $('#pFast').onclick = () => bump(5);
  $('#cards').onclick = async (e) => {
    const c = e.target.closest('.card'); if (!c) return;
    await unlockAudio();
    const ch = current()[Number(c.dataset.i)];
    strum(firstVoicing(ch.pc, ch.type === 'dim' ? 'min' : ch.type).notes);
  };
  rings(); render();
  return () => { if (seq.running) { seq.stop(); keepAwake(false); } };
}

/* ======================= GENJRENGAN (STRUMMING) ======================= */
// D = genjreng bawah, U = genjreng atas, - = tangan tetap bergerak tapi tidak kena senar.
const PATTERNS = [
  { name: 'Dasar', pat: 'D-D-D-D-', note: 'Satu genjreng bawah tiap ketukan. Mulai dari sini.' },
  { name: 'Delapan', pat: 'DUDUDUDU', note: 'Bawah-atas terus. Latih tangan supaya stabil.' },
  { name: 'Pop', pat: 'D-DU-UDU', note: 'Pola paling sering di lagu pop & akustik.' },
  { name: 'Balada', pat: 'D-D-DUDU', note: 'Tenang di awal, ramai di akhir.' },
  { name: 'Reggae', pat: '-D-D-D-D', note: 'Genjreng pendek di sela ketukan.' },
  { name: 'Waltz 3/4', pat: 'D-DUDU', beats: 3, note: 'Hitungan 3. Cocok lagu bertempo dansa.' },
];

export function strumMode(ui) {
  const { $, $$, wheel, el, icon, store } = ui;
  let pIdx = store.get('sPat', 2);
  let chordIdx = store.get('sChord', 0);
  const bpms = [];
  for (let b = 40; b <= 160; b += 5) bpms.push({ b });
  const seq = createSequencer({
    onStep(i, time) {
      const p = PATTERNS[pIdx];
      if (i % 2 === 0) click(time, i === 0);
      const s = p.pat[i];
      if (s === 'D' || s === 'U') {
        const [r, t] = EASY[chordIdx];
        strum(firstVoicing(r, t).notes, { when: time + 0.004, up: s === 'U', gain: s === 'D' ? (i % 2 === 0 ? 0.42 : 0.34) : 0.26 });
      }
    },
    onVisual(i) {
      $$('#cards .strum-card').forEach((c, j) => c.classList.toggle('flash', j === i));
      const hand = $('#sHand'); if (hand && i >= 0) hand.classList.toggle('down', i % 2 === 0);
    },
  });
  seq.stepsPerBeat = 2;
  seq.bpm = store.get('sBpm', 70);

  wheel.setRings([
    ui.menuRing(),
    new Ring({ id: 'pat', items: PATTERNS.map((p) => ({ label: p.name.toUpperCase() })), loop: false, weight: 1.15,
      spacing: ui.geo.narrow ? 46 : 56, index: pIdx, render: ui.textRender(ui.geo.narrow ? 16 : 19),
      onChange(i) { pIdx = i; store.set('sPat', i); seq.steps = PATTERNS[i].pat.length; render(); } }),
    new Ring({ id: 'sbpm', items: bpms, loop: false, spacing: 30, sector: false, upright: false,
      index: Math.round((seq.bpm - 40) / 5),
      render(g, item) {
        const major = item.b % 20 === 0;
        ui.el('line', { class: 'tick' + (major ? ' major' : ''), x1: 4, x2: major ? 24 : 14, y1: 0, y2: 0 }, g);
        ui.el('text', { class: 'tick-label', x: -16, y: 0, style: `font-size:${major ? 15 : 12}px` }, g).textContent = item.b;
      },
      onChange(i, item) { seq.bpm = item.b; store.set('sBpm', item.b); const e = $('#sBpm'); if (e) e.textContent = item.b; } }),
  ]);

  $('#info').innerHTML = `
    <div class="kicker">Genjrengan</div>
    <div class="title" id="sName"></div>
    <div class="sub"><span id="sBpm"></span> BPM · <span id="sBeats"></span></div>
    <div class="small" id="sNote" style="margin-top:6px"></div>
    <div class="chip-row" id="sChords"></div>
    <div class="row">
      <button class="icon-btn primary big" id="sPlay" aria-label="Mainkan">${icon('play')}</button>
      <div class="hand" id="sHand" aria-hidden="true"><i></i></div>
    </div>
    <div class="small">↓ genjreng ke bawah · ↑ ke atas · titik = tangan tetap bergerak tanpa kena senar.</div>`;
  $('#sChords').innerHTML = EASY.map(([r, t], i) => `<button class="chip" data-i="${i}">${chordSymbol(r, t)}</button>`).join('');

  function render() {
    const p = PATTERNS[pIdx];
    const beats = p.beats || 4;
    $('#sName').textContent = p.name;
    $('#sBpm').textContent = seq.bpm;
    $('#sBeats').textContent = `${beats} ketukan`;
    $('#sNote').textContent = p.note;
    $$('#sChords .chip').forEach((c) => c.classList.toggle('on', Number(c.dataset.i) === chordIdx));
    const count = (i) => (i % 2 === 0 ? String(i / 2 + 1) : '&');
    $('#cards').innerHTML = [...p.pat].map((s, i) => `
      <div class="card strum-card${i % 2 === 0 ? ' on-beat' : ''}">
        <span class="cnt">${count(i)}</span>
        <span class="arrow ${s === 'D' ? 'd' : s === 'U' ? 'u' : 'x'}">${s === 'D' ? '↓' : s === 'U' ? '↑' : '·'}</span>
      </div>`).join('');
  }
  $('#sChords').onclick = (e) => {
    const c = e.target.closest('.chip'); if (!c) return;
    chordIdx = Number(c.dataset.i); store.set('sChord', chordIdx); render();
  };
  $('#sPlay').onclick = async () => {
    if (seq.running) { seq.stop(); keepAwake(false); $('#sPlay').innerHTML = icon('play'); }
    else { seq.steps = PATTERNS[pIdx].pat.length; await seq.start(); keepAwake(true); $('#sPlay').innerHTML = icon('stop'); }
  };
  render();
  return () => { if (seq.running) { seq.stop(); keepAwake(false); } };
}

/* ======================= LATIHAN ======================= */
const PAIRS = [[[9, 'min'], [0, 'maj']], [[0, 'maj'], [7, 'maj']], [[7, 'maj'], [2, 'maj']], [[4, 'min'], [9, 'min']],
  [[2, 'maj'], [9, 'maj']], [[4, 'maj'], [9, 'min']], [[0, 'maj'], [5, 'maj']], [[7, 'maj'], [4, 'min']], [[2, 'min'], [9, 'min']]];
const DECKS = [
  { name: 'Pemula', cards: EASY },
  { name: 'Mayor', cards: NOTE_NAMES.map((_, i) => [i, 'maj']) },
  { name: 'Minor', cards: NOTE_NAMES.map((_, i) => [i, 'min']) },
  { name: 'Chord 7', cards: [[9, '7'], [11, '7'], [0, '7'], [2, '7'], [4, '7'], [7, '7']] },
];
const DAY = 86400000;
const BOX_DAYS = [0, 1, 3, 7, 16];

export function drillMode(ui) {
  const { $, $$, wheel, icon, store } = ui;
  let sub = store.get('dSub', 0); // 0 = pindah chord, 1 = flashcard
  let pairIdx = store.get('dPair', 0);
  let deckIdx = store.get('dDeck', 0);
  let stop = () => {};

  function rings() {
    const third = sub === 0
      ? new Ring({ id: 'pair', items: PAIRS.map(([a, b]) => ({ label: `${chordSymbol(...a)}–${chordSymbol(...b)}` })), loop: false, weight: 1.15,
          spacing: ui.geo.narrow ? 44 : 52, index: pairIdx, render: ui.textRender(ui.geo.narrow ? 17 : 20),
          onChange(i) { pairIdx = i; store.set('dPair', i); stop(); changes(); } })
      : new Ring({ id: 'deck', items: DECKS.map((d) => ({ label: d.name.toUpperCase() })), loop: false, weight: 1.15,
          spacing: ui.geo.narrow ? 46 : 56, index: deckIdx, render: ui.textRender(ui.geo.narrow ? 16 : 19),
          onChange(i) { deckIdx = i; store.set('dDeck', i); stop(); flash(); } });
    wheel.setRings([
      ui.menuRing(),
      new Ring({ id: 'sub', items: [{ label: 'PINDAH' }, { label: 'HAFALAN' }], loop: false, spacing: ui.geo.narrow ? 52 : 60,
        index: sub, render: ui.textRender(ui.geo.narrow ? 16 : 19),
        onSettle(i) { if (i !== sub) { sub = i; store.set('dSub', i); stop(); rings(); sub === 0 ? changes() : flash(); } } }),
      third,
    ]);
  }

  /* ---- Pindah chord 60 detik ---- */
  function changes() {
    const [a, b] = PAIRS[pairIdx];
    const key = `best.${chordSymbol(...a)}-${chordSymbol(...b)}`;
    const best = store.get(key, 0);
    let count = 0, left = 60, timer = null, target = 1;
    $('#info').innerHTML = `
      <div class="kicker">Latihan · pindah chord 1 menit</div>
      <div class="title"><span id="dCount">0</span><small> kali</small></div>
      <div class="sub">Sisa <span id="dLeft">60</span> detik · rekor ${best}</div>
      <div class="small" style="margin-top:6px">Pindah bolak-balik secepat mungkin. Setiap jari sudah pindah, ketuk kartu yang menyala (atau tombol besar).</div>
      <div class="row">
        <button class="icon-btn primary big" id="dStart" aria-label="Mulai">${icon('play')}</button>
        <button class="tap-big" id="dTap" disabled>PINDAH ✓</button>
      </div>
      <div class="timebar"><i id="dBar"></i></div>`;
    const cards = [a, b].map(([r, t], i) => `
      <div class="card drill-card" data-i="${i}">
        <div class="card-head"><span class="name">${chordSymbol(r, t)}</span></div>
        ${diagramFor(r, t)}
      </div>`).join('');
    $('#cards').innerHTML = cards;
    const mark = () => $$('#cards .drill-card').forEach((c, i) => c.classList.toggle('on', timer && i === target));
    const hit = () => {
      if (!timer) return;
      count++; target = 1 - target;
      $('#dCount').textContent = count; mark();
    };
    const finish = () => {
      clearInterval(timer); timer = null; keepAwake(false);
      $('#dStart').innerHTML = icon('play'); $('#dTap').disabled = true; mark();
      const rec = count > best;
      if (rec) store.set(key, count);
      ui.toast(rec ? `Rekor baru: ${count} kali pindah! 🎉` : `Selesai: ${count} kali. Rekor ${best}.`);
      click(getCtx().currentTime + 0.01, true);
    };
    $('#dStart').onclick = async () => {
      if (timer) { clearInterval(timer); timer = null; keepAwake(false); $('#dStart').innerHTML = icon('play'); $('#dTap').disabled = true; mark(); return; }
      await unlockAudio();
      count = 0; left = 60; target = 1; $('#dCount').textContent = 0; $('#dLeft').textContent = 60;
      $('#dTap').disabled = false; $('#dStart').innerHTML = icon('stop'); keepAwake(true);
      const t0 = performance.now();
      timer = setInterval(() => {
        const el = (performance.now() - t0) / 1000;
        left = Math.max(0, 60 - el);
        $('#dLeft').textContent = Math.ceil(left);
        $('#dBar').style.width = `${(left / 60) * 100}%`;
        if (left <= 0) finish();
      }, 100);
      mark();
    };
    $('#dTap').onclick = hit;
    $('#cards').onclick = (e) => { const c = e.target.closest('.drill-card'); if (c && Number(c.dataset.i) === target) hit(); };
    stop = () => { if (timer) { clearInterval(timer); timer = null; keepAwake(false); } };
  }

  /* ---- Flashcard hafalan (sistem kotak Leitner) ---- */
  function flash() {
    const deck = DECKS[deckIdx];
    const sr = store.get('sr', {});
    const id = ([r, t]) => `${r}:${t}`;
    const now = Date.now();
    let queue = deck.cards.filter((c) => !sr[id(c)] || sr[id(c)].due <= now);
    if (!queue.length) queue = [];
    queue.sort(() => Math.random() - 0.5);
    let cur = null, shown = false;
    const known = () => deck.cards.filter((c) => sr[id(c)] && sr[id(c)].box >= 3).length;

    $('#info').innerHTML = `
      <div class="kicker">Latihan · hafalan chord</div>
      <div class="title" id="fName"></div>
      <div class="sub" id="fSub"></div>
      <div class="small" id="fHelp" style="margin-top:6px"></div>
      <div class="row" id="fBtns"></div>
      <div class="small" id="fStat" style="margin-top:10px"></div>`;

    function next() {
      cur = queue.shift() || null; shown = false; draw();
    }
    function draw() {
      $('#fStat').textContent = `Hafal ${known()}/${deck.cards.length} · sisa hari ini ${queue.length + (cur ? 1 : 0)}`;
      if (!cur) {
        $('#fName').textContent = 'Beres!';
        $('#fSub').textContent = 'Semua kartu deck ini sudah dilatih hari ini.';
        $('#fHelp').textContent = 'Kartu akan muncul lagi sesuai jadwal: makin hafal, makin jarang muncul.';
        $('#fBtns').innerHTML = `<button class="chip" id="fAgain">Latih lagi semua</button>`;
        $('#fAgain').onclick = () => { queue = deck.cards.slice().sort(() => Math.random() - 0.5); next(); };
        $('#cards').innerHTML = '';
        return;
      }
      const [r, t] = cur;
      $('#fName').textContent = chordSymbol(r, t);
      $('#fSub').textContent = shown ? 'Cocok dengan bayanganmu?' : 'Bentuk jarinya bagaimana?';
      $('#fHelp').textContent = shown ? 'Nilai sendiri dengan jujur.' : 'Bayangkan (atau langsung pasang di gitar), lalu buka kartunya.';
      $('#fBtns').innerHTML = shown
        ? `<button class="grade bad" data-g="0">Lupa</button><button class="grade mid" data-g="1">Ragu</button><button class="grade good" data-g="2">Hafal</button>`
        : `<button class="tap-big" id="fShow">BUKA KARTU</button>`;
      $('#cards').innerHTML = `<div class="card flash-card${shown ? ' open' : ''}" id="fCard">
        ${shown ? diagramFor(r, t) : `<div class="flash-q">?</div>`}
        <div class="card-label">${shown ? 'ketuk untuk dengar' : 'ketuk untuk buka'}</div></div>`;
      if (!shown) $('#fShow').onclick = reveal;
    }
    async function reveal() {
      if (!shown) { shown = true; draw(); }
      await unlockAudio();
      strum(firstVoicing(...cur).notes);
    }
    $('#cards').onclick = (e) => { if (e.target.closest('#fCard') && cur) reveal(); };
    $('#fBtns').onclick = (e) => {
      const b = e.target.closest('.grade'); if (!b || !cur) return;
      const g = Number(b.dataset.g);
      const s = sr[id(cur)] || { box: 0 };
      s.box = g === 0 ? 0 : g === 1 ? Math.max(1, s.box) : Math.min(4, s.box + 1);
      s.due = Date.now() + BOX_DAYS[s.box] * DAY;
      sr[id(cur)] = s; store.set('sr', sr);
      if (g === 0) queue.splice(Math.min(2, queue.length), 0, cur); // muncul lagi sebentar lagi
      next();
    };
    next();
    stop = () => {};
  }

  rings();
  sub === 0 ? changes() : flash();
  return () => stop();
}

/* ======================= TELINGA ======================= */
const EAR = [
  { id: 'hl', name: 'TINGGI / RENDAH', title: 'Tinggi atau rendah?', help: 'Dengar 2 nada. Nada kedua lebih tinggi atau lebih rendah?',
    options: [{ v: 'up', label: 'Lebih tinggi', sym: '▲' }, { v: 'down', label: 'Lebih rendah', sym: '▼' }] },
  { id: 'same', name: 'SAMA / BEDA', title: 'Sama atau beda?', help: 'Dengar 2 nada. Nadanya persis sama atau berbeda?',
    options: [{ v: 'same', label: 'Sama', sym: '=' }, { v: 'diff', label: 'Beda', sym: '≠' }] },
  { id: 'mm', name: 'MAYOR / MINOR', title: 'Mayor atau minor?', help: 'Dengar 1 chord. Terdengar cerah (mayor) atau sendu (minor)?',
    options: [{ v: 'maj', label: 'Mayor · cerah', sym: '☀' }, { v: 'min', label: 'Minor · sendu', sym: '☾' }] },
];

export function earMode(ui) {
  const { $, $$, wheel, icon, store } = ui;
  let ex = store.get('eEx', 0);
  const stats = store.get('eStats', {});
  let q = null, answered = false, streak = 0, alive = true;

  wheel.setRings([
    ui.menuRing(),
    new Ring({ id: 'ex', items: EAR.map((e) => ({ label: e.name })), loop: false, weight: 1.4,
      spacing: ui.geo.narrow ? 46 : 56, index: ex, render: ui.textRender(ui.geo.narrow ? 14 : 18),
      onChange(i) { ex = i; store.set('eEx', i); streak = 0; build(); } }),
  ]);

  // Tingkat kesulitan naik pelan-pelan: jarak nada makin kecil kalau sering benar.
  const level = () => Math.min(5, Math.floor(streak / 3));

  function newQ() {
    const e = EAR[ex];
    const base = 52 + Math.floor(Math.random() * 14);
    if (e.id === 'hl') {
      const gaps = [12, 7, 5, 3, 2, 1];
      const gap = gaps[level()];
      const up = Math.random() < 0.5;
      q = { a: base, b: base + (up ? gap : -gap), ans: up ? 'up' : 'down', gap };
    } else if (e.id === 'same') {
      const gaps = [5, 3, 2, 1, 1, 1];
      const same = Math.random() < 0.5;
      q = { a: base, b: same ? base : base + (Math.random() < 0.5 ? 1 : -1) * gaps[level()], ans: same ? 'same' : 'diff' };
    } else {
      const roots = [0, 2, 4, 5, 7, 9];
      const r = roots[Math.floor(Math.random() * roots.length)];
      const t = Math.random() < 0.5 ? 'maj' : 'min';
      q = { r, t, ans: t };
    }
    answered = false;
  }
  async function play() {
    await unlockAudio();
    const now = getCtx().currentTime + 0.05;
    if (q.r != null) strum(firstVoicing(q.r, q.t).notes, { when: now });
    else { playNote(q.a, now); playNote(q.b, now + 0.9); }
  }

  function build() {
    const e = EAR[ex];
    $('#info').innerHTML = `
      <div class="kicker">Telinga · ${e.name.toLowerCase()}</div>
      <div class="title title-q" id="eTitle">${e.title}</div>
      <div class="small" style="margin-top:6px">${e.help}</div>
      <div class="row">
        <button class="icon-btn primary big" id="ePlay" aria-label="Dengar">${icon('play')}</button>
        <button class="chip" id="eNext">Soal baru</button>
      </div>
      <div class="sub" id="eScore" style="margin-top:10px"></div>
      <div class="pitch-viz" id="eViz"></div>`;
    $('#cards').innerHTML = e.options.map((o) => `
      <button class="card ear-card" data-v="${o.v}"><span class="sym">${o.sym}</span><span class="lab">${o.label}</span></button>`).join('');
    $('#ePlay').onclick = play;
    $('#eNext').onclick = () => { newQ(); reset(); play(); };
    newQ(); reset();
  }
  function reset() {
    $$('#cards .ear-card').forEach((c) => c.classList.remove('right', 'wrong'));
    $('#eViz').innerHTML = '';
    score();
  }
  function score() {
    const s = stats[EAR[ex].id] || { ok: 0, n: 0 };
    $('#eScore').textContent = `Benar ${s.ok}/${s.n} · beruntun ${streak} · level ${level() + 1}`;
  }
  $('#cards').onclick = (e) => {
    const c = e.target.closest('.ear-card'); if (!c || !q || answered) return;
    answered = true;
    const ok = c.dataset.v === q.ans;
    const s = stats[EAR[ex].id] || { ok: 0, n: 0 };
    s.n++; if (ok) s.ok++;
    stats[EAR[ex].id] = s; store.set('eStats', stats);
    streak = ok ? streak + 1 : 0;
    c.classList.add(ok ? 'right' : 'wrong');
    if (!ok) $(`#cards .ear-card[data-v="${q.ans}"]`).classList.add('right');
    // Tunjukkan secara visual apa yang barusan terdengar.
    if (q.r == null) {
      const lo = Math.min(q.a, q.b) - 2, hi = Math.max(q.a, q.b) + 2;
      const y = (m) => 100 - ((m - lo) / (hi - lo)) * 100;
      $('#eViz').innerHTML = `<span style="bottom:${100 - y(q.a)}%">1</span><span style="bottom:${100 - y(q.b)}%" class="b">2</span>`;
    } else {
      $('#eViz').innerHTML = `<em>${chordSymbol(q.r, q.t)} · ${q.t === 'maj' ? 'mayor' : 'minor'}</em>`;
    }
    score();
    setTimeout(() => { if (alive && answered && $('#eViz')) { newQ(); reset(); play(); } }, ok ? 1300 : 2600);
  };
  build();
  return () => { alive = false; };
}
