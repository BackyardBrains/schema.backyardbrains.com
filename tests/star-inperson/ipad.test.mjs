// ipad.test.mjs — iPad-rig amendments (Greg 2026-09-29) tested in Chromium with iPad emulation
// (viewport 1366x1024 CSS px, deviceScaleFactor 2, touch, iPad Safari UA). Real WebKit/ProMotion behaviour can
// only be checked on the device (BUILD_NOTES "On-device checklist").
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, REPO } from './server.mjs';
import { launch, drive, fillSetup, passCalibration, waitFor, waitSaved, sleep, BASE, SHORT } from './helpers.mjs';
import { cmPerDeg } from '../../static/star-inperson/js/calibration.js';

const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
let srv, browser;
before(async () => { srv = await startServer(); browser = await launch(); });
after(async () => { await browser.close(); await srv.close(); });

async function openIpad(query, { portrait = false } = {}) {
  const context = await browser.newContext({ viewport: { width: portrait ? 1024 : 1366, height: portrait ? 1366 : 1024 }, deviceScaleFactor: 2,
    hasTouch: true, isMobile: false, userAgent: IPAD_UA, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [], state = { policy: () => 'correct', responses: [] }, downloads = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('download', (d) => downloads.push(d.suggestedFilename()));
  await page.exposeFunction('__onPhase', (ev) => {
    if (ev.phase !== 'dots') return;
    const a = state.policy(ev);
    state.responses.push({ ...ev, action: a });
    if (a === 'correct') setTimeout(() => page.keyboard.press(ev.test_direction === 'left' ? 'ArrowLeft' : 'ArrowRight').catch(() => {}), state.delayMs ?? 0);
  });
  await page.goto(`${srv.url}/star-inperson/?${query}`);
  return { page, context, errors, state, downloads };
}

test('iPad-1 viewport path: 1366x1024 @2x, preset 26.3 cm -> canvas 2732x2048, ppd, ruler, refresh warning blocks until override', async () => {
  const ctx = await openIpad(`${BASE}&seed=101`);
  await fillSetup(ctx.page, { preset: 0, expectedHz: 120, device: 'bt_keyboard' });
  await waitFor(ctx.page, () => document.body.dataset.screen === 'calibration' && document.getElementById('screen').dataset.refresh === 'fail', null, 20000);
  // refresh check failed (headless 60 Hz vs expected 120): "Calibration OK" stays disabled until the override is ticked
  await sleep(200);
  const blocked = await ctx.page.evaluate(() => ({ dis: document.querySelector('#cal-ok').disabled, row: document.getElementById('cal-override-row').hidden }));
  assert.deepEqual(blocked, { dis: true, row: false });
  await ctx.page.check('#cal-override-box');
  assert.equal(await ctx.page.evaluate(() => document.querySelector('#cal-ok').disabled), false);
  await ctx.page.uncheck('#cal-override-box');
  assert.equal(await ctx.page.evaluate(() => document.querySelector('#cal-ok').disabled), true);
  const r = await ctx.page.evaluate(() => {
    const G = window.__starInPerson, c = document.getElementById('stage'), lay = G.calibrationLayout();
    const row = c.getContext('2d').getImageData(0, lay.rulerRowY, c.width, 1).data;
    let first = -1, last = -1;
    for (let x = 0; x < c.width; x++) if (row[4 * x] < 64) { if (first < 0) first = x; last = x; }
    return { lay, info: G.stageInfo(), ink: last - first + 1, panel: document.getElementById('screen').innerText, ua: navigator.userAgent, touch: navigator.maxTouchPoints };
  });
  const want = (1366 / 26.3) * cmPerDeg(54);
  assert.equal(r.info.canvasW, 2732); assert.equal(r.info.canvasH, 2048);
  assert.ok(Math.abs(r.info.ppdCss - want) < 1e-6, `ppdCss ${r.info.ppdCss} vs ${want}`);
  assert.ok(Math.abs(r.info.ppdDevice - 2 * want) < 1e-6);
  assert.ok(Math.abs(r.ink - (10 * 1366 / 26.3) * 2) <= 2, `ruler ${r.ink}`);
  assert.match(r.panel, /expected 120 Hz/, 'headless 60 Hz must warn against the expected 120 Hz');
  assert.match(r.ua, /iPad/); assert.ok(r.touch > 0);
  const [c0, c1, c2, c3] = r.lay.cardBox, [a0, a1, a2, a3] = r.lay.apertureBox;
  assert.ok(c0 >= 0 && c2 <= 2732 && c1 >= 0 && c3 <= 2048, 'card inside the screen');
  assert.ok(c0 > a2 || c2 < a0 || c1 > a3 || c3 < a1, 'card outline must not overlap the aperture outline');
  await ctx.context.close();
});

test('iPad-2 geometry from pixels at DPR 2, blindfold probe, every-frame drawing, logged iPad fields', async () => {
  const ctx = await openIpad(`${BASE}&${SHORT}&pilot=1&seed=102`);
  await ctx.page.evaluate(() => {
    const G = window.__starInPerson, C = window.__cap = { geom: {}, probe: {}, heavy: [] };
    const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    G.frameListeners.push((info, ctx) => {
      if (info.phase !== 'adaptor' || info.trial_phase !== 'main') return;
      const faceId = info.imagesDrawn[0], side = faceId.endsWith('_R') ? 'left' : 'right';
      if (!C.probe[info.attempt_index]) {
        const [X, Y] = G.degToDevice(...G.probeDeg(side)).map(Math.floor), d = ctx.getImageData(X - 1, Y - 1, 3, 3).data, l = [];
        for (let i = 0; i < 9; i++) l.push(Math.round(lum(d, 4 * i)));
        C.probe[info.attempt_index] = { faceId, l };
      }
      if (!faceId.startsWith('face_open') || C.geom[side]) return;
      C.heavy.push(info.ts);   // this frame is stalled by the test's own full-canvas scan (excluded from the gap check)
      const W = ctx.canvas.width, H = ctx.canvas.height, d = ctx.getImageData(0, 0, W, H).data, bb = { L: [W, H, -1, -1], R: [W, H, -1, -1] };
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (Math.abs(lum(d, 4 * (y * W + x)) - 128) <= 16) continue;
        const b = x < W / 2 ? bb.L : bb.R;
        if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
      }
      const eye = G.layout(side, 'open').eye, [ex, ey] = G.degToDevice(eye[0], eye[1]).map(Math.floor);
      C.geom[side] = { bb, W, H, eyeLum: lum(d, 4 * (ey * W + ex)) };
    });
  });
  ctx.state.delayMs = 150;
  await drive(ctx, { policy: () => 'correct', setup: { preset: 0, expectedHz: 120, device: 'bt_keyboard' } });
  await waitSaved(ctx.page);
  const r = await ctx.page.evaluate(() => ({ cap: window.__cap, si: window.__starInPerson.stageInfo(), frames: window.__starInPerson.frames,
    trials: window.__starInPerson.trials(), fin: window.__starInPerson.payloads.at(-1).data.session }));
  await ctx.context.close();
  const { si } = r, W = si.canvasW, H = si.canvasH, ppd = si.ppdDevice;
  const dx = (px) => (px - W / 2) / ppd, dy = (py) => (H / 2 - py) / ppd, g = r.cap.geom.left;
  const head = [dx(g.bb.L[0]), dx(g.bb.L[2] + 1), dy(g.bb.L[3] + 1), dy(g.bb.L[1])];
  const tree = [dx(g.bb.R[0]), dx(g.bb.R[2] + 1), dy(g.bb.R[3] + 1), dy(g.bb.R[1])];
  [-7.751, -2.5, -3.917, 1.783].forEach((v, i) => assert.ok(Math.abs(head[i] - v) <= 0.05, `head ${i}: ${head[i]}`));
  [2.5, 6.798, -3.917, 1.783].forEach((v, i) => assert.ok(Math.abs(tree[i] - v) <= 0.05, `tree ${i}: ${tree[i]}`));
  assert.ok(g.eyeLum < 40 && r.cap.geom.right.eyeLum < 40, 'eye point on the pupil');
  for (const t of r.trials.filter((t) => t.phase === 'main')) {
    const p = r.cap.probe[t.attempt_index];
    if (t.eyes_condition === 'blindfold') assert.ok(p.l.every((l) => l < 40)); else assert.ok(p.l.every((l) => Math.abs(l - 128) <= 6));
  }
  // the loop draws EVERY frame of every trial (ITI, fixation, adaptor, dots): no gaps > 1.5 frames
  const fm = r.fin.display.refresh_median_interval_ms;
  for (const t of r.trials) {
    const fr = r.frames.filter((f) => f.trial_phase === t.phase && f.attempt_index === t.attempt_index);
    // practice has no adaptor since v1.3.0 (practiceBlankMs 0): fixation is followed directly by the dots
    const want = t.phase === 'practice' ? ['iti', 'fixation', 'dots'] : ['iti', 'fixation', 'adaptor', 'dots'];
    assert.deepEqual([...new Set(fr.map((f) => f.phase))].slice(0, want.length), want);
    for (let i = 1; i < fr.length; i++) {
      if (r.cap.heavy.includes(fr[i - 1].ts)) continue;
      assert.ok(fr[i].ts - fr[i - 1].ts <= 1.5 * fm + 1, `gap ${fr[i].ts - fr[i - 1].ts} ms in ${fr[i].phase}`);
    }
  }
  assert.equal(r.fin.setup.input_device, 'bt_keyboard');
  assert.equal(r.fin.setup.monitor_preset, 'iPad Pro 12.9" (26.3 cm)');
  assert.equal(r.fin.setup.monitor_width_cm, 26.3);
  assert.equal(r.fin.setup.expected_refresh_hz, 120);
  assert.equal(r.fin.calibration.css_w, 1366); assert.equal(r.fin.calibration.canvas_w, 2732);
  assert.equal(r.fin.calibration.display_mode, 'browser');
  assert.equal(r.fin.display.expected_refresh_hz, 120);
  assert.equal(r.fin.display.refresh_matches_expected, false);
  assert.equal(r.fin.calibration.refresh_override, true, 'override ticked on the calibration screen is logged');
  assert.ok(r.fin.events.some((e) => e.type === 'refresh_override' && /expected 120/.test(e.detail.warnings.join(';'))));
  assert.ok(r.fin.display.refresh_warnings.some((w) => /expected 120/.test(w)));
  assert.ok(r.fin.display.setup_screen_estimate && r.fin.display.setup_screen_estimate.refresh_samples_n >= 170);
});

test('iPad-3 portrait -> "rotate to landscape" blocker; calibration proceeds after rotation', async () => {
  const ctx = await openIpad(`${BASE}&seed=103`, { portrait: true });
  await fillSetup(ctx.page, { preset: 0, expectedHz: 120, device: 'bt_keyboard' });
  await waitFor(ctx.page, () => document.body.dataset.screen === 'rotate');
  assert.equal(await ctx.page.evaluate(() => getComputedStyle(document.getElementById('rotate')).display), 'flex');
  await sleep(300);
  assert.equal(await ctx.page.evaluate(() => document.body.dataset.screen), 'rotate');
  await ctx.page.setViewportSize({ width: 1366, height: 1024 });
  await waitFor(ctx.page, () => document.body.dataset.screen === 'calibration');
  const si = await ctx.page.evaluate(() => window.__starInPerson.stageInfo());
  assert.equal(si.canvasW, 2732);
  assert.equal(await ctx.page.evaluate(() => document.getElementById('rotate').hidden), true);
  await ctx.context.close();
});

test('iPad-4 key .code fallback (key "Unidentified"), Space via code, KeyboardEvent.timeStamp timebase check', async () => {
  const ctx = await openIpad(`${BASE}&${SHORT}&pilot=1&seed=104`);
  await ctx.page.evaluate(() => {
    const G = window.__starInPerson;
    G.frameListeners.push((info) => {
      if (info.phase !== 'dots') return;
      const ph = G.events.filter((e) => e.type === 'phase' && e.phase === 'dots').at(-1);
      if (ph.attempt_index !== info.attempt_index || ph._sent) return;
      ph._sent = true;
      const ev = new KeyboardEvent('keydown', { key: 'Unidentified', code: ph.test_direction === 'left' ? 'ArrowLeft' : 'ArrowRight', bubbles: true, cancelable: true });
      if (info.attempt_index % 2 === 1) Object.defineProperty(ev, 'timeStamp', { value: performance.now() - 500 });  // off-timebase stamp
      window.dispatchEvent(ev);
    });
  });
  const spaceByCode = async (name, page) => {
    if (!['handover', 'instructions1', 'instructions2', 'practice_feedback', 'break'].includes(name)) return false;
    await waitFor(page, (n) => document.body.dataset.screen === n, name);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Unidentified', code: 'Space', bubbles: true, cancelable: true })));
    return true;
  };
  await drive(ctx, { policy: () => 'none', onScreen: spaceByCode, setup: { preset: 0, expectedHz: 120, device: 'smart_connector_keyboard' } });
  await waitSaved(ctx.page);
  const trials = await ctx.page.evaluate(() => window.__starInPerson.trials());
  await ctx.context.close();
  const main = trials.filter((t) => t.phase === 'main');
  assert.equal(main.length, 8);
  for (const t of trials) {
    assert.equal(t.correct, true, `attempt ${t.attempt_index}`);
    const arrow = t.test_direction === 'left' ? 'ArrowLeft' : 'ArrowRight';
    assert.equal(t.response_key, arrow, 'response_key is the canonical recognised key');
    assert.equal(t.response_key_raw, 'Unidentified');
    assert.equal(t.response_code_raw, arrow);
    assert.ok(!('response_code' in t));
    const odd = t.attempt_index % 2 === 1;
    assert.equal(t.rt_timebase, odd ? 'handler' : 'event');
    assert.equal(typeof t.key_handler_ts, 'number');
    assert.equal(typeof t.key_event_ts_raw, 'number');
    if (odd) {   // forged off-timebase stamp: rejected -> key_event_ts null, raw kept, RT from handler time
      assert.equal(t.key_event_ts, null);
      assert.ok(t.key_handler_ts - t.key_event_ts_raw >= 499, `raw ${t.key_event_ts_raw} vs handler ${t.key_handler_ts}`);
      assert.ok(Math.abs(t.rt_ms - (t.key_handler_ts - t.dots_onset_ts)) < 1e-6, 'handler invariant');
      assert.ok(Math.abs(t.rt_ms - t.rt_handler_ms) < 1e-6);
    } else {
      assert.equal(t.key_event_ts, t.key_event_ts_raw);
      assert.ok(Math.abs(t.rt_ms - (t.key_event_ts - t.dots_onset_ts)) < 1e-6, 'event invariant');
    }
    assert.ok(t.rt_ms >= 0);
  }
});

test('iPad-5 ?diag=1: 10-s style dots run reports fps, dropped frames, max frame time; nothing is POSTed', async () => {
  const n0 = srv.payloads.length;
  const ctx = await openIpad(`test=1&diag=1&requireFullscreen=false&requireRulerCheck=false&diagDurationMs=3000&seed=105`);
  await fillSetup(ctx.page, { preset: 0, expectedHz: 60, device: 'bt_keyboard' });
  await passCalibration(ctx.page);
  await waitFor(ctx.page, () => document.body.dataset.screen === 'diag_report', null, 20000);
  const r = await ctx.page.evaluate(() => ({ d: window.__starInPerson.diag, text: document.getElementById('screen').innerText, banner: document.getElementById('banner').innerText }));
  assert.ok(r.d.duration_ms >= 3000 && r.d.duration_ms < 3300);
  assert.ok(Math.abs(r.d.achieved_fps - 60) < 6, `fps ${r.d.achieved_fps}`);
  for (const k of ['dropped_frames', 'max_interval_ms', 'p99_interval_ms', 'max_work_ms', 'median_hz', 'pass']) assert.ok(k in r.d, k);
  assert.equal(r.d.dots_per_frame, 1250); assert.equal(r.d.canvas_w, 2732);
  assert.ok(Math.abs(r.d.measured_speed_deg_s - 1.4) < 1e-6);
  assert.match(r.text, /achieved fps/); assert.match(r.text, /dropped frames/);
  await ctx.page.keyboard.press('d');
  await waitFor(ctx.page, () => document.body.dataset.screen === 'end');
  await sleep(300);
  assert.ok(ctx.downloads.some((n) => /^star-inperson-diag_.*\.json$/.test(n)), 'diag report download');
  assert.equal(srv.payloads.length, n0, 'diagnostics never POST');
  await ctx.context.close();
});

test('iPad-7 ?keytest=1: 20 prompted arrows counted; lost / wrong / extra keys fail; a clean 20/20 run passes; nothing is POSTed', async () => {
  const n0 = srv.payloads.length;
  const ctx = await openIpad(`test=1&keytest=1&requireFullscreen=false&requireRulerCheck=false&seed=107`);
  const { page } = ctx;
  await waitFor(page, () => window.__starInPerson && window.__starInPerson.ready);
  assert.match(await page.textContent('#banner'), /KEY TEST MODE/);
  await fillSetup(page, { preset: 0, expectedHz: 60, device: 'bt_keyboard' });
  await passCalibration(page);
  await waitFor(page, () => document.body.dataset.screen === 'keytest_intro', null, 20000);
  await page.keyboard.press('Space');
  const promptOf = async (i) => {
    await waitFor(page, (j) => { const p = window.__starInPerson.keytestPrompt; return p && p.index === j && p.prompt; }, i, 10000);
    return page.evaluate(() => window.__starInPerson.keytestPrompt.prompt);
  };
  const press = (dir) => page.keyboard.press(dir === 'left' ? 'ArrowLeft' : 'ArrowRight');
  const opp = (d) => (d === 'left' ? 'right' : 'left');
  // run 1: #0 via .code only (key "Unidentified"), #1 wrong, #2 double press, #3 answered only AFTER its 3 s
  // deadline (in the blank gap: must stay a miss, the key is `late` + extra), rest correct
  for (let i = 0; i < 20; i++) {
    const dir = await promptOf(i);
    if (i === 3) {
      await waitFor(page, () => { const p = window.__starInPerson.keytestPrompt; return p && p.index === 3 && !p.prompt; }, null, 10000);
      await press(dir);
      continue;
    }
    if (i === 0) await page.evaluate((c) => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Unidentified', code: c, bubbles: true, cancelable: true })), dir === 'left' ? 'ArrowLeft' : 'ArrowRight');
    else if (i === 1) await press(opp(dir));
    else if (i === 2) { await press(dir); await press(dir); } else await press(dir);
  }
  await waitFor(page, () => document.body.dataset.screen === 'keytest_report', null, 20000);
  const r1 = await page.evaluate(() => ({ k: window.__starInPerson.keytest, text: document.getElementById('screen').innerText }));
  assert.deepEqual([r1.k.n, r1.k.correct, r1.k.missed, r1.k.wrong, r1.k.extra, r1.k.late, r1.k.unrecognized, r1.k.pass], [20, 18, 1, 1, 2, 1, 0, false]);
  assert.equal(r1.k.timebase.event + r1.k.timebase.handler, 21);
  assert.equal(r1.k.prompts[0].presses[0].key_raw, 'Unidentified');
  assert.equal(r1.k.prompts[0].presses[0].key, r1.k.prompts[0].prompt === 'left' ? 'ArrowLeft' : 'ArrowRight');
  assert.equal(r1.k.prompts[3].presses.length, 1);
  assert.equal(r1.k.prompts[3].presses[0].late, true, 'a key after the deadline is late, not the answer');
  assert.ok(r1.k.prompts[3].presses[0].t_rel_prompt_ms > 3000);
  assert.equal(r1.k.prompts.filter((p) => p.prompt === 'left').length, 10);
  assert.match(r1.text, /FAIL/); assert.match(r1.text, /timebase/);
  // run 2 ([R]): a clean 20/20 run passes; [D] downloads the report and ends
  await page.keyboard.press('r');
  for (let i = 0; i < 20; i++) await press(await promptOf(i));
  await waitFor(page, () => document.body.dataset.screen === 'keytest_report', null, 20000);
  const r2 = await page.evaluate(() => ({ k: window.__starInPerson.keytest, text: document.getElementById('screen').innerText }));
  assert.deepEqual([r2.k.correct, r2.k.missed, r2.k.wrong, r2.k.extra, r2.k.late, r2.k.pass], [20, 0, 0, 0, 0, true]);
  assert.equal(r2.k.timebase.event, 20, 'Chromium KeyboardEvent.timeStamp is on the performance.now() timebase');
  assert.match(r2.text, /PASS \(20\/20\)/);
  await page.keyboard.press('d');
  await waitFor(page, () => document.body.dataset.screen === 'end');
  await sleep(300);
  assert.ok(ctx.downloads.some((n) => /^star-inperson-keytest_.*\.json$/.test(n)), 'key test report download');
  assert.equal(srv.payloads.length, n0, 'key test never POSTs');
  assert.deepEqual(ctx.errors, []);
  await ctx.context.close();
});

test('iPad-6 static: viewport/zoom lock, Home Screen web-app meta + manifest, touch-action, arrows never scroll', async () => {
  const html = fs.readFileSync(path.join(REPO, 'static/star-inperson/index.html'), 'utf8');
  assert.match(html, /name="viewport" content="[^"]*user-scalable=no/);
  assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(html, /name="apple-mobile-web-app-status-bar-style"/);
  assert.match(html, /rel="manifest" href="manifest.webmanifest"/);
  const man = JSON.parse(fs.readFileSync(path.join(REPO, 'static/star-inperson/manifest.webmanifest'), 'utf8'));
  assert.equal(man.display, 'fullscreen'); assert.equal(man.orientation, 'landscape');
  const ctx = await openIpad(`${BASE}&seed=106`);
  await waitFor(ctx.page, () => window.__starInPerson && window.__starInPerson.ready);
  const r = await ctx.page.evaluate(() => {
    const st = getComputedStyle(document.getElementById('stage')), bd = getComputedStyle(document.body);
    const seen = [];
    window.addEventListener('keydown', (e) => seen.push(e.defaultPrevented));
    for (const code of ['ArrowDown', 'ArrowLeft', 'Space']) document.body.dispatchEvent(new KeyboardEvent('keydown', { key: code === 'Space' ? ' ' : code, code, bubbles: true, cancelable: true }));
    return { touch: st.touchAction, over: bd.overscrollBehaviorY, seen, mode: null };
  });
  assert.equal(r.touch, 'none'); assert.equal(r.over, 'none');
  assert.deepEqual(r.seen, [true, true, true], 'arrow/space keydown default prevented outside form fields');
  const man2 = await ctx.page.evaluate(async () => (await fetch('manifest.webmanifest')).ok);
  assert.ok(man2);
  await ctx.context.close();
});
