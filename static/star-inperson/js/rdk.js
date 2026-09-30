// rdk.js — random-dot kinematogram engines (pure: no DOM). SPEC §4.
//   const eng = new Guterstam2020Dots(rdkCfg, { widthDeg, heightDeg }, dirSign, rng, log?)
//   const f = eng.frame(ts)   // first call = dots onset: initialise, no motion
//   f = { n, xs: Float32Array, ys: Float32Array }  positions in deg relative to the aperture centre
//   eng.stats()
// `log` (tests only) receives per frame {ts, dots:[{i, x, y, coh, reborn, wrapped}]}.

const TWO_PI = 2 * Math.PI;

// Largest float32 strictly below `lim` (lim > 0), so Float32 output never rounds up onto the open bound.
function f32Below(lim) {
  const b = new DataView(new ArrayBuffer(4));
  b.setFloat32(0, lim);
  b.setUint32(0, b.getUint32(0) - 1);
  return b.getFloat32(0);
}
function toF32(v, hi) { const f = Math.fround(v); return f >= hi ? f32Below(hi) : f; }

class StatsAccumulator {
  constructor() {
    this.frames = 0; this.nMin = Infinity; this.nMax = -Infinity; this.nSum = 0; this.cohSum = 0;
    this.dispSum = 0; this.timeSum = 0; this.respawns = 0; this.wraps = 0;
  }
  addFrame(n, nCoh) {
    this.frames++; this.nSum += n; this.cohSum += nCoh;
    if (n < this.nMin) this.nMin = n; if (n > this.nMax) this.nMax = n;
  }
  addMove(signedDispDeg, dtMs) { this.dispSum += signedDispDeg; this.timeSum += dtMs / 1000; }
  result() {
    const f = this.frames || 1;
    return {
      frames: this.frames,
      nPerFrameMin: this.frames ? this.nMin : 0,
      nPerFrameMax: this.frames ? this.nMax : 0,
      nPerFrameMean: this.nSum / f,
      coherentPerFrameMean: this.cohSum / f,
      measuredSpeedDegPerSec: this.timeSum > 0 ? this.dispSum / this.timeSum : null,
      respawns: this.respawns,
      wraps: this.wraps,
    };
  }
}

// ---- guterstam2020: plain dots, every dot drawn every frame (paper text literally), SPEC §4.1 ----
export class Guterstam2020Dots {
  constructor(cfg, aperture, dirSign, rng, log = null) {
    this.W = aperture.widthDeg; this.H = aperture.heightDeg;
    this.v = cfg.dotSpeedDegPerSec; this.L = cfg.lifetimeMs; this.dir = dirSign;
    this.rng = rng; this.log = log;
    this.N = Math.round(cfg.densityDotsPerDeg2 * this.W * this.H);
    this.Nc = Math.round(cfg.coherence * this.N);        // slots 0..Nc-1 coherent for the whole trial
    this.xs = new Float32Array(this.N); this.ys = new Float32Array(this.N);
    this.px = new Float64Array(this.N); this.py = new Float64Array(this.N);   // full-precision state
    this.vx = new Float64Array(this.N); this.vy = new Float64Array(this.N);
    this.age = new Float64Array(this.N);
    this.prevTs = null;
    this.acc = new StatsAccumulator();
  }

  _place(i) {
    this.px[i] = (this.rng() - 0.5) * this.W;
    this.py[i] = (this.rng() - 0.5) * this.H;
    if (i < this.Nc) { this.vx[i] = this.dir * this.v; this.vy[i] = 0; }
    else { const th = this.rng() * TWO_PI; this.vx[i] = this.v * Math.cos(th); this.vy[i] = this.v * Math.sin(th); }
  }

  frame(ts) {
    const { N, W, H } = this;
    const reborn = this.log ? new Uint8Array(N) : null;
    const wrapped = this.log ? new Uint8Array(N) : null;
    if (this.prevTs === null) {
      for (let i = 0; i < N; i++) { this._place(i); this.age[i] = this.rng() * this.L; }
    } else {
      const dt = ts - this.prevTs;
      const k = dt / 1000;
      for (let i = 0; i < N; i++) {
        this.age[i] += dt;
        if (this.age[i] >= this.L - dt / 2) {
          this._place(i); this.age[i] = 0; this.acc.respawns++;
          if (reborn) reborn[i] = 1;
          continue;
        }
        const dx = this.vx[i] * k;
        let x = this.px[i] + dx, y = this.py[i] + this.vy[i] * k, w = 0;
        if (x >= W / 2) { x -= W; w = 1; } else if (x < -W / 2) { x += W; w = 1; }
        if (y >= H / 2) { y -= H; w = 1; } else if (y < -H / 2) { y += H; w = 1; }
        if (w) { this.acc.wraps++; if (wrapped) wrapped[i] = 1; }
        this.px[i] = x; this.py[i] = y;
        if (i < this.Nc) this.acc.addMove(this.dir * dx, dt);
      }
    }
    this.prevTs = ts;
    for (let i = 0; i < N; i++) { this.xs[i] = toF32(this.px[i], W / 2); this.ys[i] = toF32(this.py[i], H / 2); }
    this.acc.addFrame(N, this.Nc);
    if (this.log) {
      const dots = new Array(N);
      for (let i = 0; i < N; i++) {
        dots[i] = { i, x: this.px[i], y: this.py[i], coh: i < this.Nc, reborn: !!reborn[i], wrapped: !!wrapped[i] };
      }
      this.log({ ts, dots });
    }
    return { n: N, xs: this.xs, ys: this.ys };
  }

  stats() { return this.acc.result(); }
}

// ---- shadlen: Kiani/Shadlen 3-set algorithm, SPEC §4.2 ----
// aperture.refreshHz (setup refresh estimate) sets dots per frame so that dots per second are rig-independent.
export class ShadlenDots {
  constructor(cfg, aperture, dirSign, rng, log = null) {
    this.W = aperture.widthDeg; this.H = aperture.heightDeg;
    this.v = cfg.dotSpeedDegPerSec; this.c = cfg.coherence; this.dir = dirSign;
    this.K = cfg.shadlenSets; this.rng = rng; this.log = log;
    this.refreshHz = aperture.refreshHz || 60;
    this.nPerFrame = Math.round(cfg.densityDotsPerDeg2PerSec * this.W * this.H / this.refreshHz);
    const total = this.K * this.nPerFrame;
    this.px = new Float64Array(total); this.py = new Float64Array(total);
    this.xs = new Float32Array(this.nPerFrame); this.ys = new Float32Array(this.nPerFrame);
    this.lastShown = new Array(this.K).fill(null);
    this.f = 0;
    this.acc = new StatsAccumulator();
    for (let i = 0; i < total; i++) {
      this.px[i] = (this.rng() - 0.5) * this.W;
      this.py[i] = (this.rng() - 0.5) * this.H;
    }
  }

  frame(ts) {
    const { W, H, nPerFrame: n } = this;
    const s = this.f % this.K;
    const base = s * n;
    const last = this.lastShown[s];
    const logDots = this.log ? new Array(n) : null;
    let nCoh = 0;
    for (let j = 0; j < n; j++) {
      const i = base + j;
      let coh = false, reborn = false, wrapped = false;
      if (last !== null) {
        const dt = ts - last;
        if (this.rng() < this.c) {
          coh = true; nCoh++;
          const dx = this.dir * this.v * dt / 1000;
          let x = this.px[i] + dx;
          if (x >= W / 2 || x < -W / 2) {                 // left the aperture: re-enter at the upstream edge
            x -= this.dir * W;
            if (x >= W / 2) x -= W; else if (x < -W / 2) x += W;   // guard against > 1 aperture per update
            this.py[i] = (this.rng() - 0.5) * H;
            wrapped = true; this.acc.wraps++;
          } else {
            this.acc.addMove(this.dir * dx, dt);
          }
          this.px[i] = x;
        } else {
          this.px[i] = (this.rng() - 0.5) * W;             // noise: re-plotted at a random position
          this.py[i] = (this.rng() - 0.5) * H;
          reborn = true; this.acc.respawns++;
        }
      }
      this.xs[j] = toF32(this.px[i], W / 2); this.ys[j] = toF32(this.py[i], H / 2);
      if (logDots) logDots[j] = { i, x: this.px[i], y: this.py[i], coh, reborn, wrapped };
    }
    this.lastShown[s] = ts;
    this.f++;
    this.acc.addFrame(n, nCoh);
    if (this.log) this.log({ ts, set: s, dots: logDots });
    return { n, xs: this.xs, ys: this.ys };
  }

  stats() { return this.acc.result(); }
}

export function makeEngine(name, cfg, aperture, dirSign, rng, log = null) {
  if (name === 'guterstam2020') return new Guterstam2020Dots(cfg, aperture, dirSign, rng, log);
  if (name === 'shadlen') return new ShadlenDots(cfg, aperture, dirSign, rng, log);
  throw new Error(`unknown RDK engine ${name}`);
}
