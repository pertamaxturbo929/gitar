import { detectPitch } from '../js/pitch.js';
const sr=48000, N=4096;
for (const f of [82.41,110,146.83,196,246.94,329.63, 83.0, 440, 659.25]) {
  const b=new Float32Array(N);
  for(let i=0;i<N;i++){const t=i/sr; b[i]=0.3*Math.sin(2*Math.PI*f*t)+0.5*Math.sin(2*Math.PI*2*f*t+1)+0.25*Math.sin(2*Math.PI*3*f*t)+0.15*Math.sin(2*Math.PI*4*f*t)+0.02*(Math.random()-0.5);}
  const r=detectPitch(b,sr); const c=r?1200*Math.log2(r.freq/f):NaN;
  console.log(f, r&&r.freq.toFixed(2), 'cents err', c.toFixed(2), r&&r.clarity.toFixed(2));
}
const t0=performance.now(); const b=new Float32Array(N).map(()=>Math.random()*0.1); for(let i=0;i<50;i++) detectPitch(b,sr); console.log('ms/run',(performance.now()-t0)/50);
