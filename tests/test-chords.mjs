import { CHORD_TYPES, NOTE_NAMES, pc, INSTRUMENTS } from '../js/theory.js';
import { voicingsFor } from '../js/chords.js';
const t0=Date.now();
for (const t of CHORD_TYPES) for (let r=0;r<12;r++){
  const vs = voicingsFor(r,t.id);
  const allowed = new Set(t.intervals.map(i=>pc(r+i)));
  const str = vs.map(v=>{
    const bad = v.notes.some(n=>n!==null && !allowed.has(pc(n)));
    return v.frets.map(f=>f<0?'x':f.toString(16)).join('')+(v.source==='curated'?'*':v.source==='shape'?'#':'')+(bad?'!BAD':'')+'/'+v.fingers.join('');
  });
  console.log((NOTE_NAMES[r]+t.symbol).padEnd(7), vs.length, str.join('  '));
}
console.log('ms', Date.now()-t0);
