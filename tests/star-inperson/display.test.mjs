// display.test.mjs — browser pixel tests (SPEC §10.1 T15-T22) + T17 (Node PNG decode).
// Frame listeners run synchronously after each frame is drawn and read small canvas patches.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { startServer, REPO } from './server.mjs';
import { launch, openPage, drive, fillSetup, waitFor, BASE, SHORT, shortWith, decodePNG } from './helpers.mjs';
import { CONFIG } from '../../static/star-inperson/js/config.js';

let srv, browser;
before(async () => { srv = await startServer(); browser = await launch(); });
after(async () => { await browser.close(); await srv.close(); });

const IMG = path.join(REPO, 'static/star-inperson/img');
const STAR = path.join(REPO, 'static/star/img');

// ---------- T15 ----------
test('T15 DPR 1 / 1.5 / 2: canvas size, ppdDevice = ppdCss * dpr, ruler ink length', async () => {
  for (const dpr of [1, 1.5, 2]) {
    const ctx = await openPage(browser, srv, `${BASE}&seed=1`, { dpr });
    await fillSetup(ctx.page);
    await waitFor(ctx.page, () => document.body.dataset.screen === 'calibration' && ['ok', 'fail'].includes(document.getElementById('screen').dataset.refresh), null, 20000);
    const r = await ctx.page.evaluate(() => {
      const G = window.__starInPerson, c = document.getElementById('stage'), lay = G.calibrationLayout();
      const row = c.getContext('2d').getImageData(0, lay.rulerRowY, c.width, 1).data;
      let first = -1, last = -1;
      for (let x = 0; x < c.width; x++) if (row[4 * x] < 64) { if (first < 0) first = x; last = x; }
      return { lay, info: G.stageInfo(), cw: c.width, iw: window.innerWidth, ink: last - first + 1 };
    });
    assert.equal(r.cw, Math.round(r.iw * dpr), `canvas width at dpr ${dpr}`);
    const [c0, c1, c2, c3] = r.lay.cardBox, [a0, a1, a2, a3] = r.lay.apertureBox;
    assert.ok(c0 > a2 || c2 < a0 || c1 > a3 || c3 < a1, 'card outline overlaps the aperture outline');
    assert.ok(Math.abs(r.info.ppdDevice - r.info.ppdCss * r.info.dprEffective) / r.info.ppdDevice < 1e-3);
    assert.ok(Math.abs(r.info.dprEffective - dpr) < 1e-9);
    const want = (10 * r.iw / 38) * dpr;
    assert.ok(Math.abs(r.ink - want) <= 2, `dpr ${dpr}: ruler ink ${r.ink} px, want ${want.toFixed(2)}`);
    await ctx.context.close();
  }
});

// ---------- T16 ----------
async function measureSpeed({ dpr, speed, engine }) {
  const q = engine === 'shadlen'
    ? `engine=shadlen&densityDotsPerDeg2PerSec=120&coherence=1`
    : `coherence=1&lifetimeMs=100000&densityDotsPerDeg2=2`;
  const [F1, F2] = engine === 'shadlen' ? [6, 30] : [5, 25];
  const ctx = await openPage(browser, srv, `${BASE}&${SHORT}&pilot=1&seed=${3 + dpr * 10}&responseWindowMs=700&dotSpeedDegPerSec=${speed}&${q}`, { dpr });
  await ctx.page.evaluate(([F1, F2]) => {
    const G = window.__starInPerson, cnt = {};
    window.__cap = [];
    G.frameListeners.push((info, ctx) => {
      if (info.phase !== 'dots') return;
      const k = (cnt[info.attempt_index] = (cnt[info.attempt_index] ?? -1) + 1);
      if (k !== F1 && k !== F2) return;
      const [x0, y0] = G.degToDevice(-2.8, 2.8).map(Math.floor), [x1, y1] = G.degToDevice(2.8, -2.8).map(Math.ceil);
      const w = x1 - x0, h = y1 - y0, d = ctx.getImageData(x0, y0, w, h).data, ink = [];
      for (let i = 0; i < w * h; i++) if (d[4 * i] < 64) ink.push(i);
      window.__cap.push({ a: info.attempt_index, k, ts: info.ts, w, h, ink, nDots: info.nDots });
    });
  }, [F1, F2]);
  await drive(ctx, { policy: () => 'none', until: (n) => n === 'practice_feedback' });
  const cap = await ctx.page.evaluate(() => window.__cap);
  const ppd = (await ctx.page.evaluate(() => window.__starInPerson.stageInfo())).ppdDevice;
  const dirs = Object.fromEntries(ctx.state.responses.map((e) => [e.attempt_index, e.test_direction]));
  await ctx.context.close();
  const out = [];
  for (const a of Object.keys(dirs)) {
    const A = cap.find((c) => c.a === +a && c.k === F1), B = cap.find((c) => c.a === +a && c.k === F2);
    if (!A || !B) continue;
    const bm = new Uint8Array(B.w * B.h); for (const i of B.ink) bm[i] = 1;
    let best = 0, bestS = 0;
    const maxS = Math.ceil(ppd * 2);
    for (let s = -maxS; s <= maxS; s++) {
      let o = 0;
      for (const i of A.ink) { const x = (i % A.w) + s; if (x >= 0 && x < A.w && bm[i + s]) o++; }
      if (o > best) { best = o; bestS = s; }
    }
    out.push({ attempt: +a, dir: dirs[a], shift: bestS, overlap: best / A.ink.length, measured: bestS / ppd / ((B.ts - A.ts) / 1000), nDots: A.nDots });
  }
  return out;
}

test('T16 end-to-end measured dot speed from pixels (guterstam2020 + shadlen, DPR 1/2, 1.4 and 2.0 deg/s)', async () => {
  for (const engine of ['guterstam2020', 'shadlen']) {
    for (const dpr of [1, 2]) {
      for (const speed of [1.4, 2.0]) {
        const res = await measureSpeed({ dpr, speed, engine });
        assert.ok(res.length >= 3, `${engine} dpr${dpr} v${speed}: only ${res.length} trials measured`);
        assert.ok(new Set(res.map((r) => r.dir)).size === 2, 'both directions measured');
        for (const r of res) {
          const want = (r.dir === 'right' ? 1 : -1) * speed;
          assert.ok(Math.abs(r.measured - want) / speed <= 0.05, `${engine} dpr${dpr} v${speed}: measured ${r.measured.toFixed(3)} want ${want} (${JSON.stringify(r)})`);
          assert.ok(r.overlap > 0.5, `weak overlap ${r.overlap}`);
          if (engine === 'guterstam2020') assert.equal(r.nDots, 50);
          else assert.ok(Math.abs(r.nDots - 50) <= 1);
        }
      }
    }
  }
});

// ---------- T17 ----------
test('T17 images: byte copies, sha256, contentBox/eyePx re-derived, blindfold covers eye only, L = mirrored R', () => {
  const src = { face_open_R: 'BlankFaceLookingRight (1).png', face_open_L: 'BlankFaceLookingLeft (1).png',
    face_blindfold_R: 'BlankFaceLookingRightBlindfold (1).png', face_blindfold_L: 'BlankFaceLookingLeftBlindfold (1).png', tree: 'Tree.png' };
  const dec = {};
  for (const [id, star] of Object.entries(src)) {
    const spec = CONFIG.images[id];
    const mine = fs.readFileSync(path.join(REPO, 'static/star-inperson', spec.file));
    assert.ok(mine.equals(fs.readFileSync(path.join(STAR, star))), `${id} not byte-identical to ${star}`);
    assert.equal(crypto.createHash('sha256').update(mine).digest('hex'), spec.sha256, `${id} sha256`);
    const png = (dec[id] = decodePNG(mine));
    assert.equal(png.width, 1080); assert.equal(png.height, 1350);
    // content box: opaque = alpha > 32 (the threshold that reproduces SPEC's measured boxes; see BUILD_NOTES)
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
      if (png.alpha[y * png.width + x] > 32) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    const box = [x0, y0, x1 + 1, y1 + 1];
    box.forEach((v, i) => assert.ok(Math.abs(v - spec.contentBox[i]) <= 2, `${id} contentBox ${box} vs ${spec.contentBox}`));
    if (spec.eyePx && id.startsWith('face_blindfold')) {
      // the blindfold covers the eye; its eyePx must equal the open face's (same canvas, same head)
      assert.deepEqual(spec.eyePx, CONFIG.images[id.replace('blindfold', 'open')].eyePx);
    } else if (spec.eyePx) {
      // pupil centre = centroid of the alpha>128 mask eroded by a 17x17 square (removes all 5-px lines)
      const W = png.width, Hh = png.height, m = new Uint8Array(W * Hh), e1 = new Uint8Array(W * Hh);
      for (let i = 0; i < W * Hh; i++) m[i] = png.alpha[i] > 128 ? 1 : 0;
      const r = 8;
      for (let y = 0; y < Hh; y++) for (let x = r; x < W - r; x++) { let ok = 1; for (let d = -r; d <= r && ok; d++) ok = m[y * W + x + d]; e1[y * W + x] = ok; }
      let sx = 0, sy = 0, n = 0;
      for (let y = r; y < Hh - r; y++) for (let x = 0; x < W; x++) {
        let ok = 1; for (let d = -r; d <= r && ok; d++) ok = e1[(y + d) * W + x];
        if (ok) { sx += x; sy += y; n++; }
      }
      assert.ok(n > 1000 && n < 10000, `${id}: eroded pupil area ${n}`);
      assert.ok(Math.abs(sx / n - spec.eyePx[0]) <= 2 && Math.abs(sy / n - spec.eyePx[1]) <= 2, `${id} eye ${sx / n},${sy / n} vs ${spec.eyePx}`);
    }
  }
  for (const s of ['R', 'L']) {
    const o = dec[`face_open_${s}`].alpha, b = dec[`face_blindfold_${s}`].alpha;
    let onlyOpen = 0, extra = 0;
    for (let i = 0; i < o.length; i++) { if (o[i] > 0 && b[i] === 0) onlyOpen++; if (b[i] > 0 && o[i] === 0) extra++; }
    assert.equal(onlyOpen, 0, `${s}: pixels opaque only in the open image`);
    assert.ok(extra > 50000, 'blindfold adds a filled area');
    // probe point: inside the blindfold (opaque) and transparent in the open face (+-4 px)
    const [px, py] = CONFIG.images.blindfoldProbePx[s];
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const i = (py + dy) * 1080 + px + dx;
      assert.equal(b[i], 255, `probe ${s} not inside blindfold`); assert.equal(o[i], 0, `probe ${s} not transparent in open face`);
    }
  }
  for (const f of ['face_open', 'face_blindfold']) {
    const R = dec[`${f}_R`].alpha, L = dec[`${f}_L`].alpha;
    let diff = 0;
    for (let y = 0; y < 1350; y++) for (let x = 0; x < 1080; x++) if (R[y * 1080 + x] !== L[y * 1080 + 1079 - x]) diff++;
    assert.equal(diff, 0, `${f}: L alpha != mirrored R alpha`);
  }
});

// ---------- shared session capture for T18-T21 ----------
// One pilot-size session (4 per cell = 16 main trials); listeners record what each test needs.
async function captureSession() {
  const ctx = await openPage(browser, srv, `${BASE}&${SHORT}&trialsPerCell=4&practiceTrials=2&seed=77`);
  await ctx.page.evaluate(() => {
    const G = window.__starInPerson, C = window.__cap = { adaptorFirst: {}, geom: {}, fix: [], phaseChecks: [], outside: [] };
    const seen = {}, bgOK = (d, i) => Math.abs(d[i] - 128) <= 6 && Math.abs(d[i + 1] - 128) <= 6 && Math.abs(d[i + 2] - 128) <= 6;
    const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    let dotsCount = 0;
    G.frameListeners.push((info, ctx) => {
      const c = ctx.canvas, W = c.width, H = c.height, key = `${info.trial_phase}:${info.attempt_index}`;
      // T19: first adaptor frame of every main trial -> 3x3 probe patch
      if (info.phase === 'adaptor' && info.trial_phase === 'main' && !seen[key]) {
        seen[key] = true;
        const faceId = info.imagesDrawn.find((i) => i.startsWith('face_'));
        const side = faceId.endsWith('_R') ? 'left' : 'right';
        const [X, Y] = G.degToDevice(...G.probeDeg(side)).map(Math.floor);
        const d = ctx.getImageData(X - 1, Y - 1, 3, 3).data, l = [];
        for (let i = 0; i < 9; i++) l.push(Math.round(lum(d, 4 * i)));
        C.adaptorFirst[info.attempt_index] = { faceId, side, probe: l, images: info.imagesDrawn };
        // T18: ink extents of the whole frame, per half (open faces only, one per side)
        if (faceId.startsWith('face_open') && !C.geom[side]) {
          const d2 = ctx.getImageData(0, 0, W, H).data, bb = { L: [W, H, -1, -1], R: [W, H, -1, -1] };
          for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = 4 * (y * W + x);
            if (Math.abs(lum(d2, i) - 128) <= 16) continue;
            const b = x < W / 2 ? bb.L : bb.R;
            if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
          }
          const eye = G.layout(side, 'open').eye, [ex, ey] = G.degToDevice(eye[0], eye[1]).map(Math.floor);
          C.geom[side] = { bb, W, H, eyeLum: lum(d2, 4 * (ey * W + ex)) };
        }
      }
      // T20: fixation disc size (first fixation frame of main trial 0)
      if (info.phase === 'fixation' && C.fix.length < 1) {
        const y = H / 2, d = ctx.getImageData(0, y, W, 1).data, dc = ctx.getImageData(W / 2, 0, 1, H).data;
        let nx = 0, ny = 0;
        for (let x = 0; x < W; x++) if (lum(d, 4 * x) < 64) nx++;
        for (let yy = 0; yy < H; yy++) if (lum(dc, 4 * yy) < 64) ny++;
        C.fix.push({ nx, ny });
      }
      // T20: fixation-region ink per phase (square of +-0.15 deg, inside the 0.25-deg-radius disc)
      {
        const r = Math.ceil(0.15 * G.stageInfo().ppdDevice), d = ctx.getImageData(W / 2 - r, H / 2 - r, 2 * r, 2 * r).data;
        let ink = 0; for (let i = 0; i < d.length; i += 4) if (lum(d, i) < 64) ink++;
        const L = G.layout('left', 'open'), R = G.layout('right', 'open');
        let bad = 0, apInk = 0;
        if (info.phase === 'dots') {         // no head/tree ink: sample the head and tree boxes of both sides
          for (const box of [L.headBox, L.treeBox, R.headBox, R.treeBox]) {
            const [x0, y0] = G.degToDevice(box[0], box[3]).map(Math.round), [x1, y1] = G.degToDevice(box[1], box[2]).map(Math.round);
            const xs0 = Math.max(x0, Math.ceil(G.degToDevice(2.5, 0)[0]) + 4), xe0 = Math.min(x1, Math.floor(G.degToDevice(-2.5, 0)[0]) - 4);
            const [a, b] = box[0] > 0 ? [xs0, x1] : [x0, xe0];
            if (b > a) { const dd = ctx.getImageData(a, y0, b - a, y1 - y0).data; for (let i = 0; i < dd.length; i += 4) if (!bgOK(dd, i)) bad++; }
          }
        }
        if (info.phase === 'adaptor') {      // no dot ink inside the aperture (shrunk by 0.2 deg)
          const [x0, y0] = G.degToDevice(-2.3, 2.3).map(Math.round), [x1, y1] = G.degToDevice(2.3, -2.3).map(Math.round);
          const dd = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data; for (let i = 0; i < dd.length; i += 4) if (!bgOK(dd, i)) apInk++;
        }
        C.phaseChecks.push({ phase: info.phase, fixationDrawn: info.fixationDrawn, frac: ink / (4 * r * r), bad, apInk });
      }
      // T21: every 7th dots frame, full-canvas scan outside the expanded aperture
      if (info.phase === 'dots' && dotsCount++ % 7 === 0) {
        const s = G.stageInfo().dotSizePx, m = Math.ceil(s / 2) + 1;
        const [ax0, ay0] = G.degToDevice(-2.5, 2.5), [ax1, ay1] = G.degToDevice(2.5, -2.5);
        const d = ctx.getImageData(0, 0, W, H).data;
        let n = 0;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          if (x >= ax0 - m && x < ax1 + m && y >= ay0 - m && y < ay1 + m) continue;
          if (!bgOK(d, 4 * (y * W + x))) n++;
        }
        C.outside.push(n);
      }
    });
  });
  ctx.state.delayMs = 400;     // respond ~400 ms after dots onset so every trial has ~24 dots frames
  await drive(ctx, { policy: () => 'correct' });
  const cap = await ctx.page.evaluate(() => window.__cap);
  const info = await ctx.page.evaluate(() => ({ si: window.__starInPerson.stageInfo(), trials: window.__starInPerson.trials(), payload: window.__starInPerson.payloads.at(-1) }));
  await ctx.context.close();
  return { cap, ...info };
}

let S = null;
const session = async () => (S ||= await captureSession());

test('T18 geometry: head/tree ink extents, eye on the pupil, face-right = mirror, gaze line through aperture centre', async () => {
  const { cap, si, payload } = await session();
  const ppd = si.ppdDevice, W = si.canvasW, H = si.canvasH;
  const degX = (px) => (px - W / 2) / ppd, degY = (py) => (H / 2 - py) / ppd;
  const g = cap.geom.left;
  assert.ok(g && cap.geom.right, 'captured both sides');
  // edges of ink pixels in degrees (left/top edge of first pixel, right/bottom edge of last pixel)
  const head = [degX(g.bb.L[0]), degX(g.bb.L[2] + 1), degY(g.bb.L[3] + 1), degY(g.bb.L[1])];
  const tree = [degX(g.bb.R[0]), degX(g.bb.R[2] + 1), degY(g.bb.R[3] + 1), degY(g.bb.R[1])];
  const want = { head: [-7.751, -2.5, -3.917, 1.783], tree: [2.5, 6.798, -3.917, 1.783] };
  head.forEach((v, i) => assert.ok(Math.abs(v - want.head[i]) <= 0.05, `head edge ${i}: ${v.toFixed(3)} vs ${want.head[i]}`));
  tree.forEach((v, i) => assert.ok(Math.abs(v - want.tree[i]) <= 0.05, `tree edge ${i}: ${v.toFixed(3)} vs ${want.tree[i]}`));
  assert.ok(g.eyeLum < 40, `eye point not on the pupil (lum ${g.eyeLum})`);
  assert.ok(cap.geom.right.eyeLum < 40, 'face-right eye point not on the pupil');
  // face-right frame = horizontal mirror of face-left (+-1 device px)
  const r = cap.geom.right;
  const mir = (x) => W - 1 - x;
  assert.ok(Math.abs(r.bb.L[0] - mir(g.bb.R[2])) <= 1 && Math.abs(r.bb.L[2] - mir(g.bb.R[0])) <= 1, 'tree mirror');
  assert.ok(Math.abs(r.bb.R[0] - mir(g.bb.L[2])) <= 1 && Math.abs(r.bb.R[2] - mir(g.bb.L[0])) <= 1, 'head mirror');
  assert.ok(Math.abs(r.bb.L[1] - g.bb.R[1]) <= 1 && Math.abs(r.bb.L[3] - g.bb.R[3]) <= 1, 'vertical extents');
  const geo = payload.data.session.geometry;
  for (const side of ['left', 'right']) {
    assert.equal(geo[side].gaze_line_through_aperture_centre, true);
    assert.equal(geo[side].eye_point_deg[1], (geo[side].aperture_deg[2] + geo[side].aperture_deg[3]) / 2);
  }
  assert.ok(Math.abs(geo.left.head_box_deg[0] - -7.751) < 0.005 && Math.abs(geo.left.tree_box_deg[1] - 6.798) < 0.005);
});

test('T19 blindfold actually drawn: probe dark on blindfold trials, background on open trials; logged images match', async () => {
  const { cap, trials } = await session();
  const main = trials.filter((t) => t.phase === 'main');
  assert.equal(main.length, 16);
  for (const t of main) {
    const a = cap.adaptorFirst[t.attempt_index];
    assert.ok(a, `no adaptor capture for attempt ${t.attempt_index}`);
    const faceId = `face_${t.eyes_condition}_${t.face_side === 'left' ? 'R' : 'L'}`;
    assert.equal(a.faceId, faceId);
    assert.equal(t.face_img, `${faceId}.png`);
    assert.deepEqual(t.adaptor_images_drawn, [faceId, 'tree']);
    if (t.eyes_condition === 'blindfold') assert.ok(a.probe.every((l) => l < 40), `blindfold probe ${a.probe}`);
    else assert.ok(a.probe.every((l) => Math.abs(l - 128) <= 6), `open probe ${a.probe}`);
  }
  for (const eyes of ['open', 'blindfold']) for (const side of ['left', 'right']) {
    assert.equal(main.filter((t) => t.eyes_condition === eyes && t.face_side === side).length, 4);
  }
});

test('T20 fixation disc diameter and phase exclusivity', async () => {
  const { cap, si } = await session();
  const want = 0.5 * si.ppdDevice;
  assert.ok(Math.abs(cap.fix[0].nx - want) <= 1 && Math.abs(cap.fix[0].ny - want) <= 1, `fixation ${JSON.stringify(cap.fix[0])} want ${want}`);
  const byPhase = (p) => cap.phaseChecks.filter((c) => c.phase === p);
  for (const c of byPhase('fixation')) { assert.equal(c.fixationDrawn, true); assert.ok(c.frac > 0.6, `fixation ink ${c.frac}`); }
  for (const p of ['iti', 'adaptor']) for (const c of byPhase(p)) { assert.equal(c.fixationDrawn, false); assert.equal(c.frac, 0, `${p} has centre ink`); }
  for (const c of byPhase('dots')) { assert.equal(c.fixationDrawn, false); assert.ok(c.frac < 0.5, `dots frame looks like fixation (${c.frac})`); assert.equal(c.bad, 0, 'head/tree ink in a dots frame'); }
  for (const c of byPhase('adaptor')) assert.equal(c.apInk, 0, 'dot ink in an adaptor frame');
  assert.ok(byPhase('dots').length > 20 && byPhase('adaptor').length > 50);
});

test('T21 dots never drawn outside the aperture (+ceil(s/2)+1 px)', async () => {
  const { cap } = await session();
  assert.ok(cap.outside.length >= 5);
  assert.ok(cap.outside.every((n) => n === 0), `pixels outside aperture: ${cap.outside}`);
});

// ---------- T22 ----------
test('T22 grating: period 0.8 deg, drift 0.8 deg/s in grating_direction, 14.7 x 5.7 deg; pilot session completes', async () => {
  const ctx = await openPage(browser, srv, `${BASE}&${shortWith({ adaptorMs: 1000 })}&adaptor=grating&pilot=1&seed=5`);
  await ctx.page.evaluate(() => {
    const G = window.__starInPerson, C = window.__cap = { rows: {}, bbox: {} };
    G.frameListeners.push((info, ctx) => {
      if (info.phase !== 'adaptor' || info.trial_phase !== 'main') return;
      const W = ctx.canvas.width, H = ctx.canvas.height, y = Math.floor(G.degToDevice(0, 0)[1]);
      const d = ctx.getImageData(0, y, W, 1).data, row = [];
      for (let x = 0; x < W; x++) row.push(d[4 * x]);
      (C.rows[info.attempt_index] ||= []).push({ ts: info.ts, row });
      if ((C.rows[info.attempt_index].length % 20) === 1) {       // extents from a few full frames
        const f = ctx.getImageData(0, 0, W, H).data, b = (C.bbox[info.attempt_index] ||= [W, H, -1, -1]);
        for (let yy = 0; yy < H; yy++) for (let x = 0; x < W; x++) {
          if (Math.abs(f[4 * (yy * W + x)] - 128) <= 3) continue;
          if (x < b[0]) b[0] = x; if (yy < b[1]) b[1] = yy; if (x > b[2]) b[2] = x; if (yy > b[3]) b[3] = yy;
        }
      }
    });
  });
  await drive(ctx, { policy: () => 'correct' });
  await waitFor(ctx.page, () => window.__starInPerson.payloads.some((p) => p.data.session.save_reason === 'final'));
  const cap = await ctx.page.evaluate(() => window.__cap);
  const si = await ctx.page.evaluate(() => window.__starInPerson.stageInfo());
  const trials = (await ctx.page.evaluate(() => window.__starInPerson.trials())).filter((t) => t.phase === 'main');
  const fin = srv.payloads.filter((p) => p.UUID === trials[0].session_uuid).at(-1);
  await ctx.context.close();
  assert.equal(fin.experiment, 'star-inperson-grating-pilot-test');
  assert.equal(fin.data.session.status, 'complete');
  assert.equal(trials.length, 4);
  assert.deepEqual(trials.map((t) => t.grating_direction).sort(), ['left', 'left', 'right', 'right']);
  const ppd = si.ppdDevice, W = si.canvasW, cx = W / 2;
  const gx0 = Math.round(cx - 7.35 * ppd), gx1 = Math.round(cx + 7.35 * ppd);
  const fit = (row, P) => {       // complex correlation with exp(-i 2pi x / P) over the grating columns
    let re = 0, im = 0, m = 0;
    for (let c = gx0; c < gx1; c++) m += row[c];
    m /= gx1 - gx0;
    for (let c = gx0; c < gx1; c++) { const x = (c + 0.5 - cx) / ppd, a = (2 * Math.PI * x) / P; re += (row[c] - m) * Math.cos(a); im -= (row[c] - m) * Math.sin(a); }
    return { amp: Math.hypot(re, im), phase: Math.atan2(im, re) };
  };
  for (const t of trials) {
    const rows = cap.rows[t.attempt_index];
    assert.ok(rows.length >= 45, `adaptor frames ${rows.length}`);
    let bestP = 0, bestA = -1;
    for (let P = 0.6; P <= 1.0; P += 0.0005) { const a = fit(rows[0].row, P).amp; if (a > bestA) { bestA = a; bestP = P; } }
    assert.ok(Math.abs(bestP - 0.8) / 0.8 <= 0.02, `period ${bestP}`);
    // unwrap the phase through every frame between frame 5 and frame >= 35 later
    const i0 = 5, i1 = rows.length - 3;
    assert.ok(i1 - i0 >= 30);
    let ph = fit(rows[i0].row, 0.8).phase, total = 0;
    for (let i = i0 + 1; i <= i1; i++) {
      const p = fit(rows[i].row, 0.8).phase;
      let d = p - ph; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      total += d; ph = p;
    }
    const v = -total / ((2 * Math.PI) / 0.8) / ((rows[i1].ts - rows[i0].ts) / 1000);     // deg/s, + = rightward
    const want = t.grating_direction === 'right' ? 0.8 : -0.8;
    assert.ok(Math.abs(v - want) / 0.8 <= 0.05, `drift ${v.toFixed(4)} want ${want}`);
    const b = cap.bbox[t.attempt_index], w = (b[2] - b[0] + 1) / ppd, h = (b[3] - b[1] + 1) / ppd;
    assert.ok(Math.abs(w * ppd - 14.7 * ppd) <= 2 && Math.abs(h * ppd - 5.7 * ppd) <= 2, `grating extent ${w.toFixed(3)} x ${h.toFixed(3)} deg`);
    assert.equal(t.adaptor_type, 'grating');
    assert.deepEqual(t.adaptor_images_drawn, ['grating']);
  }
});
