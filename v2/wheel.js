// Roda konsentris: beberapa cincin yang bisa diputar dengan jari.
// Tiap cincin adalah "carousel melingkar": item berjajar di sepanjang busur,
// item yang tepat di garis tengah (sumbu kanan) = item terpilih.

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
};
const mod = (a, n) => ((a % n) + n) % n;
const DEG = Math.PI / 180;

// Path untuk potongan cincin (annulus sector) yang berpusat di sudut 0.
function sectorPath(r0, r1, half) {
  const c = Math.cos(half), s = Math.sin(half);
  return `M${r0 * c} ${-r0 * s} L${r1 * c} ${-r1 * s} A${r1} ${r1} 0 0 1 ${r1 * c} ${r1 * s} L${r0 * c} ${r0 * s} A${r0} ${r0} 0 0 0 ${r0 * c} ${-r0 * s}Z`;
}

export class Ring {
  constructor(opts) {
    Object.assign(this, {
      id: 'ring',
      items: [],
      loop: true,
      spacing: 60,        // jarak antar item di busur (px, di tengah cincin)
      index: 0,
      interactive: true,
      className: '',
      render: (g, item) => { el('text', { class: 'ring-label' }, g).textContent = item.label; },
      onChange: () => {},  // dipanggil saat item di sumbu berganti (sambil diputar)
      onSettle: () => {},  // dipanggil saat cincin berhenti
      onTap: null,         // tap item yang sudah terpilih
      sector: true,
      upright: true,       // label selalu tegak (false = ikut berputar, untuk skala)
    }, opts);
    this.pos = this.index;
    this.lastEmitted = this.index;
    this.slots = new Map();
  }

  mount(wheel, r0, r1) {
    this.wheel = wheel;
    this.r0 = r0; this.r1 = r1; this.rm = (r0 + r1) / 2;
    this.step = this.spacing / this.rm; // radian per item
    this.g = el('g', { class: `ring ring-${this.id} ${this.className}` }, wheel.ringLayer);
    el('path', { class: 'ring-band', d: `M${r1} 0 A${r1} ${r1} 0 1 1 ${-r1} 0 A${r1} ${r1} 0 1 1 ${r1} 0 M${r0} 0 A${r0} ${r0} 0 1 0 ${-r0} 0 A${r0} ${r0} 0 1 0 ${r0} 0Z`, 'fill-rule': 'evenodd' }, this.g);
    el('circle', { class: 'ring-edge', r: r1 }, this.g);
    this.itemLayer = el('g', {}, this.g);
    this.slots.clear();
    this.draw();
  }

  get count() { return this.items.length; }
  get selected() { return this.loop ? mod(Math.round(this.pos), this.count) : Math.max(0, Math.min(this.count - 1, Math.round(this.pos))); }

  clamp(p) {
    if (this.loop) return p;
    return Math.max(-0.35, Math.min(this.count - 0.65, p));
  }

  // Gambar ulang item yang terlihat (dipanggil tiap frame saat bergerak).
  draw() {
    if (!this.itemLayer) return;
    const maxAngle = this.wheel.maxAngle(this.rm);
    const span = Math.ceil(maxAngle / this.step) + 1;
    const center = Math.round(this.pos);
    const seen = new Set();
    const sel = Math.round(this.pos);
    for (let k = center - span; k <= center + span; k++) {
      if (!this.loop && (k < 0 || k >= this.count)) continue;
      const a = (k - this.pos) * this.step;
      if (Math.abs(a) > maxAngle + this.step) continue;
      seen.add(k);
      let slot = this.slots.get(k);
      if (!slot) {
        const item = this.items[mod(k, this.count)];
        const g = el('g', { class: 'ring-item' + (item.disabled ? ' disabled' : '') }, this.itemLayer);
        if (this.sector) el('path', { class: 'ring-sector', d: sectorPath(this.r0 + 2, this.r1 - 2, this.step / 2 - 1.5 / this.rm) }, g);
        const lab = el('g', { class: 'ring-content' }, g);
        this.render(lab, item, k);
        slot = { g, lab, k };
        this.slots.set(k, slot);
      }
      const deg = a / DEG;
      slot.g.setAttribute('transform', `rotate(${deg.toFixed(3)})`);
      slot.lab.setAttribute('transform', this.upright ? `translate(${this.rm} 0) rotate(${(-deg).toFixed(3)})` : `translate(${this.rm} 0)`);
      slot.g.classList.toggle('on', k === sel);
      const fade = Math.max(0, 1 - Math.abs(a) / (maxAngle + this.step * 0.5));
      slot.g.style.opacity = (0.25 + 0.75 * fade).toFixed(3);
    }
    for (const [k, slot] of this.slots) if (!seen.has(k)) { slot.g.remove(); this.slots.delete(k); }
    const s = this.selected;
    if (s !== this.lastEmitted) { this.lastEmitted = s; this.onChange(s, this.items[s]); }
  }

  setIndex(i, animate = true) {
    // Pilih jalan terdekat untuk cincin yang berputar terus (loop).
    let target = i;
    if (this.loop) {
      const cur = Math.round(this.pos);
      const diff = mod(i - mod(cur, this.count) + this.count / 2, this.count) - this.count / 2;
      target = cur + diff;
    }
    this.animateTo(target, animate ? 320 : 0);
  }

  animateTo(target, ms = 320) {
    cancelAnimationFrame(this.raf);
    if (!this.loop) target = Math.max(0, Math.min(this.count - 1, target));
    const from = this.pos, t0 = performance.now();
    const tick = (now) => {
      const t = ms ? Math.min(1, (now - t0) / ms) : 1;
      const e = 1 - Math.pow(1 - t, 3);
      this.pos = from + (target - from) * e;
      this.draw();
      if (t < 1) this.raf = requestAnimationFrame(tick);
      else { this.pos = target; this.draw(); this.onSettle(this.selected, this.items[this.selected]); }
    };
    if (!ms) tick(performance.now());
    else this.raf = requestAnimationFrame(tick);
  }
}

export class Wheel {
  constructor(svg) {
    this.svg = svg;
    this.rings = [];
    this.root = el('g', {}, svg);
    this.decor = el('g', { class: 'wheel-decor' }, this.root);
    this.ringLayer = el('g', {}, this.root);
    this.axis = el('g', { class: 'wheel-axis' }, this.root);
    this.bindPointer();
  }

  // cx, cy = pusat roda (boleh di luar layar). bands = [r0, r1, r2, ...] batas cincin.
  layout({ cx, cy, bands, height }) {
    this.cx = cx; this.cy = cy; this.bands = bands; this.height = height;
    this.root.setAttribute('transform', `translate(${cx} ${cy})`);
    this.build();
  }

  maxAngle(r) {
    // Sudut terjauh yang masih terlihat di layar (dibatasi tepi kiri & atas/bawah).
    const byLeft = this.cx < 0 ? Math.acos(Math.min(1, -this.cx / r)) : Math.PI;
    const byHeight = Math.asin(Math.min(1, (this.height / 2 + 30) / r));
    return Math.min(byLeft, byHeight, Math.PI * 0.6);
  }

  setRings(rings) {
    this.rings.forEach((r) => r.g && r.g.remove());
    this.rings = rings;
    if (this.bands) this.build();
  }

  build() {
    this.ringLayer.innerHTML = '';
    this.decor.innerHTML = '';
    this.axis.innerHTML = '';
    const b = this.bands;
    // Lubang tengah (hub).
    el('circle', { class: 'hub', r: b[0] }, this.decor);
    el('circle', { class: 'hub-ring', r: b[0] - 10 }, this.decor);
    this.rings.forEach((ring, i) => ring.mount(this, b[i], b[i + 1]));
    // Garis jari-jari halus yang memanjang ke kanan (seperti referensi).
    const outer = b[b.length - 1];
    this.spokes = el('g', { class: 'spokes' }, this.decor);
    for (let a = -80; a <= 80; a += 10) {
      if (a === 0) continue;
      const c = Math.cos(a * DEG), s = Math.sin(a * DEG);
      el('line', { x1: outer * c, y1: outer * s, x2: outer * c * 6, y2: outer * s * 6 }, this.spokes);
    }
    // Sumbu pilihan: garis + penanda biru di tepi luar.
    el('line', { class: 'axis-line', x1: b[0], y1: 0, x2: outer + 4000, y2: 0 }, this.axis);
    b.slice(1).forEach((r, i) => {
      const r0 = b[i];
      el('path', { class: 'axis-mark', d: `M${r - 3} -14 L${r - 3} 14` }, this.axis);
      void r0;
    });
  }

  ringAt(x, y) {
    const r = Math.hypot(x - this.cx, y - this.cy);
    return this.rings.find((ring) => ring.interactive && r >= ring.r0 && r < ring.r1);
  }

  bindPointer() {
    let drag = null;
    const point = (e) => {
      const rect = this.svg.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    this.svg.addEventListener('pointerdown', (e) => {
      const p = point(e);
      const ring = this.ringAt(p.x, p.y);
      if (!ring) return;
      cancelAnimationFrame(ring.raf);
      this.svg.setPointerCapture(e.pointerId);
      const ang = Math.atan2(p.y - this.cy, p.x - this.cx);
      drag = { ring, id: e.pointerId, ang, startPos: ring.pos, moved: 0, last: ang, lastT: performance.now(), v: 0, start: p };
    });
    this.svg.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const p = point(e);
      const ang = Math.atan2(p.y - this.cy, p.x - this.cx);
      let d = ang - drag.last;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      const now = performance.now();
      const dt = Math.max(1, now - drag.lastT);
      const dp = -d / drag.ring.step;
      drag.v = 0.7 * drag.v + 0.3 * (dp / dt);
      drag.last = ang; drag.lastT = now;
      drag.moved = Math.max(drag.moved, Math.hypot(p.x - drag.start.x, p.y - drag.start.y));
      drag.ring.pos = drag.ring.clamp(drag.ring.pos + dp);
      drag.ring.draw();
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const { ring } = drag;
      if (drag.moved < 8) {
        // Tap: putar item yang disentuh ke sumbu.
        const p = point(e);
        const ang = Math.atan2(p.y - this.cy, p.x - this.cx);
        const k = Math.round(ring.pos + ang / ring.step);
        const idx = ring.loop ? mod(k, ring.count) : k;
        if (k === Math.round(ring.pos) && ring.onTap) ring.onTap(ring.selected, ring.items[ring.selected]);
        if (ring.loop) ring.animateTo(k); else ring.animateTo(Math.max(0, Math.min(ring.count - 1, idx)));
      } else {
        const fresh = performance.now() - drag.lastT < 80;
        const target = Math.round(ring.pos + (fresh ? drag.v * 180 : 0));
        ring.animateTo(target, 380);
      }
      drag = null;
    };
    this.svg.addEventListener('pointerup', end);
    this.svg.addEventListener('pointercancel', end);
  }
}

export { el, NS };
