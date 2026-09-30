// rdk.test.mjs — dot engines with synthetic rAF timestamps (pure Node). SPEC §10.1 T10-T14.
// Timestamp sequences: steady 60 Hz, steady 144 Hz, 60 Hz with +-2 ms jitter, 60 Hz with one 50-ms stall; 2 s each.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../../static/star-inperson/js/config.js';
import { Guterstam2020Dots, ShadlenDots } from '../../static/star-inperson/js/rdk.js';
import { mulberry32 } from '../../static/star-inperson/js/rng.js';

const AP = { widthDeg: 5, heightDeg: 5 };
const W = 5, H = 5;

function tsSeq(kind, durMs = 2000, seed = 1) {
  const r = mulberry32(seed), out = [1000];
  const dt = kind === '144' ? 1000 / 144 : 1000 / 60;
  let t = 1000, k = 0;
  while (t - 1000 < durMs) {
    k++;
    let step = dt;
    if (kind === 'jitter') step = dt + (r() * 4 - 2);
    if (kind === 'stall' && k === 40) step = 50;
    t += step; out.push(t);
  }
  return out;
}
const SEQS = ['60', '144', 'jitter', 'stall'];

function runEngine(Engine, cfg, dir, seq, seed = 11, ap = AP) {
  const frames = [];
  const eng = new Engine(cfg, ap, dir, mulberry32(seed), (e) => frames.push(e));
  for (const ts of seq) {
    const f = eng.frame(ts);
    frames[frames.length - 1].n = f.n;
    frames[frames.length - 1].xs = Float32Array.from(f.xs);
    frames[frames.length - 1].ys = Float32Array.from(f.ys);
  }
  return { eng, frames };
}

const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

test('T10 guterstam2020 speed: coherent dx/dt = dir*v, dy = 0; noise |d|/dt = v; noise directions uniform', () => {
  const angles = [];
  let run = 0;
  for (const v of [1.4, 2.0]) {
    for (const dir of [1, -1]) {
      for (const kind of SEQS) {
        const cfg = { ...CONFIG.rdk, dotSpeedDegPerSec: v };
        const { frames } = runEngine(Guterstam2020Dots, cfg, dir, tsSeq(kind), 1000 + run++);   // independent dots per run
        let nCoh = 0, nNoise = 0;
        for (let k = 1; k < frames.length; k++) {
          const a = frames[k - 1], b = frames[k], dt = (b.ts - a.ts) / 1000;
          for (let i = 0; i < b.dots.length; i++) {
            const p = a.dots[i], q = b.dots[i];
            if (q.reborn) continue;
            let dx = q.x - p.x, dy = q.y - p.y;
            const firstMove = k === 1 || frames[k - 1].dots[i].reborn;
            if (q.wrapped) {                       // unwrap for the direction sample only (no speed check on wraps)
              if (!q.coh && firstMove) {
                if (dx > W / 2) dx -= W; else if (dx < -W / 2) dx += W;
                if (dy > H / 2) dy -= H; else if (dy < -H / 2) dy += H;
                angles.push(Math.atan2(dy, dx));
              }
              continue;
            }
            if (q.coh) {
              nCoh++;
              assert.ok(rel(dx / dt, dir * v) < 1e-3, `coh speed ${dx / dt}`);
              assert.ok(Math.abs(dy) < 1e-12);
            } else {
              nNoise++;
              assert.ok(rel(Math.hypot(dx, dy) / dt, v) < 1e-3, `noise speed ${Math.hypot(dx, dy) / dt}`);
              if (firstMove) angles.push(Math.atan2(dy, dx));   // one direction sample per dot life
            }
          }
        }
        assert.ok(nCoh > 10000 && nNoise > 10000);
      }
    }
  }
  // 12-bin chi-square on noise directions; critical value chi2(11) at p = 0.001 is 31.264
  assert.ok(angles.length >= 6000, `only ${angles.length} direction samples`);
  const bins = new Array(12).fill(0);
  for (const a of angles) bins[Math.min(11, Math.floor(((a + Math.PI) / (2 * Math.PI)) * 12))]++;
  const e = angles.length / 12;
  const chi2 = bins.reduce((s, o) => s + (o - e) ** 2 / e, 0);
  assert.ok(chi2 < 31.264, `chi2=${chi2.toFixed(2)} bins=${bins}`);
});

test('T11 guterstam2020: every frame n = 1250, exactly 500 coherent', () => {
  for (const kind of SEQS) {
    const { frames, eng } = runEngine(Guterstam2020Dots, CONFIG.rdk, 1, tsSeq(kind));
    for (const f of frames) {
      assert.equal(f.n, 1250);
      assert.equal(f.dots.filter((d) => d.coh).length, 500);
    }
    const s = eng.stats();
    assert.equal(s.nPerFrameMin, 1250); assert.equal(s.nPerFrameMax, 1250); assert.equal(s.coherentPerFrameMean, 500);
    assert.ok(rel(s.measuredSpeedDegPerSec, 1.4) < 1e-6);
  }
});

test('T12 bounds: all drawn positions inside [-W/2, W/2) x [-H/2, H/2) (both engines)', () => {
  for (const kind of SEQS) {
    for (const dir of [1, -1]) {
      for (const [E, cfg, ap] of [[Guterstam2020Dots, { ...CONFIG.rdk, dotSpeedDegPerSec: 2 }, AP],
        [ShadlenDots, { ...CONFIG.rdk, coherence: 0.9, dotSpeedDegPerSec: 20 }, { ...AP, refreshHz: 60 }]]) {
        const { frames } = runEngine(E, cfg, dir, tsSeq(kind), 5, ap);
        for (const f of frames) {
          for (let i = 0; i < f.n; i++) {
            assert.ok(f.xs[i] >= -W / 2 && f.xs[i] < W / 2, `x=${f.xs[i]}`);
            assert.ok(f.ys[i] >= -H / 2 && f.ys[i] < H / 2, `y=${f.ys[i]}`);
          }
        }
      }
    }
  }
});

test('T13 guterstam2020 lifetime: 12-frame lives at 60 Hz, asynchronous initial ages (144-Hz KS + 60-Hz frame-grid distribution), respawn fraction dt/L', () => {
  const { frames } = runEngine(Guterstam2020Dots, CONFIG.rdk, 1, tsSeq('60'), 21);
  const N = 1250, L = 200, dt = 1000 / 60;
  const lastBirth = new Array(N).fill(null);
  const lives = [];
  let respawnFrac = 0;
  for (let k = 1; k < frames.length; k++) {
    let nr = 0;
    for (const d of frames[k].dots) {
      if (!d.reborn) continue;
      nr++;
      if (lastBirth[d.i] !== null) lives.push(k - lastBirth[d.i]);   // frames drawn at that life's positions
      lastBirth[d.i] = k;
    }
    respawnFrac += nr / N;
  }
  respawnFrac /= frames.length - 1;
  const ok = lives.filter((n) => Math.abs(n - 12) <= 1).length / lives.length;
  assert.ok(lives.length > 5000, `lives=${lives.length}`);
  assert.ok(ok >= 0.99, `fraction of 12+-1-frame lives = ${ok}`);
  assert.ok(rel(respawnFrac, dt / L) <= 0.10, `respawn fraction ${respawnFrac}`);

  // First-respawn times from random initial ages (SPEC §10.1 T13, amended 2026-09-30 for frame quantisation):
  // mean L/2 +- 5 % at 60 Hz and 144 Hz; at 144 Hz KS distance to U[0, L] < 0.05; at 60 Hz respawns can only
  // happen on frames, so the first-respawn frame index k must follow U[0, L] ages mapped onto the frame grid
  // (P(k) = share of ages a in [0, L) with max(1, ceil((L - dt/2 - a)/dt)) = k: dt/L for interior frames, partial
  // mass at both ends) -- discrete KS distance < 0.02. (Continuous KS at 60 Hz is >= ~0.08 by quantisation alone.)
  for (const kind of ['60', '144']) {
    const first = [];
    for (let rep = 0; rep < 8; rep++) {
      const { frames: F } = runEngine(Guterstam2020Dots, CONFIG.rdk, rep % 2 ? 1 : -1, tsSeq(kind, 400), 100 + rep);
      const seen = new Array(N).fill(false);
      for (let k = 1; k < F.length; k++) {
        for (const d of F[k].dots) if (d.reborn && !seen[d.i]) { seen[d.i] = true; first.push(F[k].ts - F[0].ts); }
      }
      assert.equal(seen.filter(Boolean).length, N, 'every dot respawns within 400 ms');
    }
    const mean = first.reduce((s, x) => s + x, 0) / first.length;
    assert.ok(rel(mean, L / 2) <= 0.05, `${kind}: mean first respawn ${mean}`);
    if (kind === '144') {
      first.sort((a, b) => a - b);
      let D = 0;
      for (let i = 0; i < first.length; i++) {
        const u = Math.min(1, first[i] / L);
        D = Math.max(D, Math.abs((i + 1) / first.length - u), Math.abs(i / first.length - u));
      }
      assert.ok(D < 0.05, `KS D=${D}`);
    } else {
      const dt60 = 1000 / 60, K = Math.ceil(L / dt60) + 1;
      const obs = new Array(K + 1).fill(0), exp = new Array(K + 1).fill(0), M = 1e6;
      for (const t of first) {
        const k = Math.round(t / dt60);
        assert.ok(Math.abs(t / dt60 - k) < 1e-6 && k >= 1 && k <= K, `first respawn ${t} ms not on the 60-Hz frame grid`);
        obs[k] += 1 / first.length;
      }
      for (let j = 0; j < M; j++) exp[Math.max(1, Math.ceil((L - dt60 / 2 - ((j + 0.5) / M) * L) / dt60))] += 1 / M;
      let D = 0, co = 0, ce = 0;
      for (let k = 1; k <= K; k++) { co += obs[k]; ce += exp[k]; D = Math.max(D, Math.abs(co - ce)); }
      assert.ok(D < 0.02, `60 Hz discrete KS D=${D}`);
      console.log(`T13 60 Hz: mean first respawn ${mean.toFixed(2)} ms (expected ${(L / 2).toFixed(0)} ± 5 %), discrete KS D=${D.toFixed(4)} (< 0.02), n=${first.length}`);
      assert.ok(Math.abs(exp[2] - dt60 / L) < 1e-3 && Math.abs(exp[11] - dt60 / L) < 1e-3, 'interior frames each dt/L');
    }
  }
});

test('T14 shadlen: set alternation, n/frame, dots/s, coherent speed, coherence fraction, noise re-plotted', () => {
  let cohUpdates = 0, allUpdates = 0;
  const prevX = [], newX = [];
  for (const [kind, hz] of [['60', 60], ['144', 144], ['jitter', 60], ['stall', 60]]) {
    for (const dir of [1, -1]) {
      for (const v of [1.4, 2.0]) {
        const cfg = { ...CONFIG.rdk, dotSpeedDegPerSec: v };
        const { frames, eng } = runEngine(ShadlenDots, cfg, dir, tsSeq(kind), 7, { ...AP, refreshHz: hz });
        const n = Math.round((50 * 25) / hz);
        assert.equal(eng.nPerFrame, n);
        assert.ok(rel(n * hz, 50 * 25) <= 0.05, `dots/s ${n * hz}`);
        const last = new Map();   // dot index -> {x, y, ts}
        frames.forEach((f, k) => {
          assert.equal(f.set, k % 3);
          assert.equal(f.n, n);
          for (const d of f.dots) {
            const p = last.get(d.i);
            if (p && k >= 3) {
              allUpdates++;
              if (d.coh) {
                cohUpdates++;
                if (!d.wrapped) {
                  assert.ok(rel((d.x - p.x) / ((f.ts - p.ts) / 1000), dir * v) < 1e-3);
                  assert.ok(Math.abs(d.y - p.y) < 1e-12);
                }
              } else { assert.ok(d.reborn); prevX.push(p.x); newX.push(d.x); }
            }
            last.set(d.i, { x: d.x, y: d.y, ts: f.ts });
          }
        });
      }
    }
  }
  assert.ok(allUpdates >= 10000, `updates=${allUpdates}`);
  assert.ok(Math.abs(cohUpdates / allUpdates - 0.4) <= 0.02, `coherent fraction ${cohUpdates / allUpdates}`);
  const m = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const mx = m(prevX), my = m(newX);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < prevX.length; i++) { sxy += (prevX[i] - mx) * (newX[i] - my); sxx += (prevX[i] - mx) ** 2; syy += (newX[i] - my) ** 2; }
  const corr = sxy / Math.sqrt(sxx * syy);
  assert.ok(Math.abs(corr) < 0.05, `noise position corr ${corr}`);
});
