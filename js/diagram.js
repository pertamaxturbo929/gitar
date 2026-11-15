// Menggambar diagram chord sebagai SVG (senar vertikal, fret horizontal).
import { pc, NOTE_NAMES } from './theory.js';

const NS = 'http://www.w3.org/2000/svg';

// mode: 'finger' | 'note' | 'interval'
export function chordDiagram(voicing, { rootPc, intervalOf, mode = 'finger' }) {
  const strings = voicing.frets.length;
  const sx = 34, left = 46, top = 58, fh = 50;
  const width = left * 2 + sx * (strings - 1);
  const fretted = voicing.frets.filter((f) => f > 0);
  const maxF = fretted.length ? Math.max(...fretted) : 0;
  const base = voicing.baseFret;
  const rows = Math.max(4, maxF - base + 1);
  const height = top + fh * rows + 56;
  const X = (s) => left + s * sx;
  const Y = (f) => top + (f - base + 0.5) * fh;

  const label = (s) => {
    const m = voicing.notes[s];
    if (m == null) return '';
    if (mode === 'note') return NOTE_NAMES[pc(m)];
    if (mode === 'interval') return intervalOf(pc(m));
    const fi = voicing.fingers[s];
    return fi ? String(fi) : '';
  };

  let svg = `<svg xmlns="${NS}" viewBox="0 0 ${width} ${height}" class="diagram" role="img">`;
  // fret
  for (let r = 0; r <= rows; r++) {
    const y = top + r * fh;
    const nut = r === 0 && base === 1;
    svg += `<line x1="${X(0)}" x2="${X(strings - 1)}" y1="${y}" y2="${y}" class="${nut ? 'nut' : 'fret'}"/>`;
  }
  if (base > 1) svg += `<text x="${X(0) - 22}" y="${Y(base) + 6}" class="fretno">${base}</text>`;
  // senar (makin ke kiri makin tebal)
  for (let s = 0; s < strings; s++) {
    const w = 1 + (strings - 1 - s) * 0.35;
    svg += `<line x1="${X(s)}" x2="${X(s)}" y1="${top}" y2="${top + rows * fh}" class="string" stroke-width="${w.toFixed(2)}"/>`;
  }
  // tanda x / o di atas
  voicing.frets.forEach((f, s) => {
    const x = X(s), y = top - 22;
    if (f < 0) {
      svg += `<g class="mute"><line x1="${x - 8}" y1="${y - 8}" x2="${x + 8}" y2="${y + 8}"/><line x1="${x + 8}" y1="${y - 8}" x2="${x - 8}" y2="${y + 8}"/></g>`;
    } else if (f === 0) {
      const isRoot = pc(voicing.notes[s]) === rootPc;
      svg += `<circle cx="${x}" cy="${y}" r="9" class="open${isRoot ? ' root' : ''}"/>`;
    }
  });
  // barre
  if (voicing.barre && mode === 'finger') {
    const b = voicing.barre;
    const y = Y(b.fret);
    svg += `<rect x="${X(b.from) - 15}" y="${y - 15}" width="${X(b.to) - X(b.from) + 30}" height="30" rx="15" class="barre"/>`;
  }
  // titik jari
  voicing.frets.forEach((f, s) => {
    if (f <= 0) return;
    const isRoot = pc(voicing.notes[s]) === rootPc;
    const inBarre = voicing.barre && mode === 'finger' && f === voicing.barre.fret && voicing.fingers[s] === 1;
    const x = X(s), y = Y(f);
    if (!inBarre) svg += `<circle cx="${x}" cy="${y}" r="15" class="dot${isRoot ? ' root' : ''}"/>`;
    else if (isRoot) svg += `<circle cx="${x}" cy="${y}" r="11" class="dot root"/>`;
    const t = label(s);
    const small = t.length > 1 ? ' small' : '';
    if (t && (!inBarre || isRoot || s === voicing.barre.from)) {
      svg += `<text x="${x}" y="${y + 6}" class="dotlabel${small}">${t}</text>`;
    }
  });
  // nama nada di bawah tiap senar
  const by = top + rows * fh + 30;
  voicing.notes.forEach((m, s) => {
    if (m == null) return;
    const isRoot = pc(m) === rootPc;
    const t = mode === 'interval' ? intervalOf(pc(m)) : NOTE_NAMES[pc(m)];
    svg += `<text x="${X(s)}" y="${by}" class="bottom${isRoot ? ' root' : ''}">${t}</text>`;
  });
  svg += '</svg>';
  return svg;
}
