// session.test.mjs — browser: overrides/fatal screens, full flows, timing, timeout/requeue, practice paths,
// saves, downloads, pause, payload schema, hygiene, fatal image failure (SPEC §10.1 T2 browser part, T23-T31).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync, execFileSync } from 'node:child_process';
import { startServer, REPO } from './server.mjs';
import { launch, openPage, drive, waitFor, waitSaved, sleep, BASE, SHORT, shortWith } from './helpers.mjs';

let srv, browser;
before(async () => { srv = await startServer(); browser = await launch(); });
after(async () => { await browser.close(); await srv.close(); });

const postsFor = (uuid) => srv.payloads.filter((p) => p.UUID === uuid);
const uuidOf = (page) => page.evaluate(() => window.__starInPerson.uuid);
const cellCounts = (trials) => {
  const done = trials.filter((t) => t.phase === 'main' && !t.timed_out && !t.aborted), c = {};
  for (const t of done) { const k = `${t.eyes_condition}_${t.congruent}`; c[k] = (c[k] || 0) + 1; }
  return c;
};

test('T2 (browser) override banner lists the override; bad params show a fatal screen and nothing runs', async () => {
  const ok = await openPage(browser, srv, `test=1&dotSpeedDegPerSec=2&seed=42`);
  await waitFor(ok.page, () => window.__starInPerson && window.__starInPerson.ready);
  const banner = await ok.page.textContent('#banner');
  assert.match(banner, /dotSpeedDegPerSec=2/);
  assert.match(banner, /default 1\.4/);
  assert.equal(await ok.page.evaluate(() => window.__starInPerson.config.rdk.dotSpeedDegPerSec), 2);
  await ok.context.close();
  for (const bad of ['foo=1', 'coherence=abc', 'trialsPerCell=3']) {
    const c = await openPage(browser, srv, `test=1&${bad}`);
    await waitFor(c.page, () => window.__starInPerson && window.__starInPerson.ready);
    await sleep(300);
    const r = await c.page.evaluate(() => ({ screen: document.body.dataset.screen, err: window.__starInPerson.error, frames: window.__starInPerson.frames.length, setupHidden: document.getElementById('setup').hidden, text: document.getElementById('screen').innerText }));
    assert.equal(r.screen, 'error', bad);
    assert.ok(r.err && r.text.includes(bad.split('=')[0]), `${bad}: ${r.text}`);
    assert.equal(r.frames, 0); assert.equal(r.setupHidden, true);
    await c.context.close();
  }
});

// ---------- T24 + T29 + T30: one full pilot session, all correct ----------
let FULL = null;
async function fullSession() {
  if (FULL) return FULL;
  const ctx = await openPage(browser, srv, `${BASE}&${SHORT}&pilot=1&seed=24`);
  const requests = [];
  ctx.page.on('request', (r) => requests.push(r.url()));
  ctx.state.delayMs = 250;
  await drive(ctx, { policy: () => 'correct' });
  await waitSaved(ctx.page);
  await waitFor(ctx.page, () => window.__starInPerson.events.some((e) => e.type === 'download'));
  await sleep(300);
  const uuid = await uuidOf(ctx.page);
  const G = await ctx.page.evaluate(() => ({ config: window.__starInPerson.config, frames: window.__starInPerson.frames, events: window.__starInPerson.events, trials: window.__starInPerson.trials() }));
  await ctx.context.close();
  FULL = { uuid, posts: postsFor(uuid), downloads: ctx.downloads, requests, origin: srv.url, ...G };
  return FULL;
}

test('T23 RT zero = first dots frame; rt = key time - onset; default-duration phase timing', async () => {
  const F = await fullSession();
  const main = F.trials.filter((t) => t.phase === 'main');
  for (const t of main) {
    const first = F.frames.find((f) => f.trial_phase === 'main' && f.attempt_index === t.attempt_index && f.phase === 'dots');
    assert.ok(first, `no dots frame for attempt ${t.attempt_index}`);
    assert.ok(Math.abs(t.dots_onset_ts - first.ts) <= 0.05 + 1e-9, `onset ${t.dots_onset_ts} vs frame ${first.ts}`);
    const keyT = t.rt_timebase === 'event' ? t.key_event_ts : t.key_handler_ts;
    assert.ok(Math.abs(t.rt_ms - (keyT - t.dots_onset_ts)) < 1e-6, `rt ${t.rt_ms}`);
    assert.equal(t.rt_timebase, 'event', 'Chromium KeyboardEvent.timeStamp is on the performance.now() timebase');
    assert.ok(t.rt_ms > 0);
  }
  // default durations (fixation 1500, adaptor 1500): pilot session with 2 practice trials
  const ctx = await openPage(browser, srv, `${BASE}&pilot=1&practiceTrials=2&seed=23`);
  ctx.state.delayMs = 300;
  await drive(ctx, { policy: () => 'correct', until: (n) => n === 'questionnaire' });
  const trials = (await ctx.page.evaluate(() => window.__starInPerson.trials()));
  const frameMs = await ctx.page.evaluate(() => window.__starInPerson.payloads.at(-1).data.session.display.refresh_median_interval_ms);
  await ctx.context.close();
  const all = trials.filter((t) => !t.aborted);
  assert.equal(all.filter((t) => t.phase === 'main').length, 8);
  for (const t of all) {
    assert.ok(Math.abs(t.adaptor_actual_ms - 1500) <= frameMs + 1, `adaptor ${t.adaptor_actual_ms}`);
    assert.ok(Math.abs(t.fixation_actual_ms - 1500) <= frameMs + 1, `fixation ${t.fixation_actual_ms}`);
    if (!t.has_dropped_frame) assert.ok(Math.abs(t.onset_latency_ms) <= frameMs, `onset latency ${t.onset_latency_ms}`);
    assert.ok(t.iti_actual_ms >= 1000 - frameMs && t.iti_actual_ms <= 2000 + frameMs);
  }
});

test('T24 full flow: save order, flags, cumulative payloads, final content, download, payload size', async () => {
  const F = await fullSession();
  const reasons = F.posts.map((p) => p.data.session.save_reason);
  assert.deepEqual(reasons, ['setup', 'practice_passed', 'block_1', 'main_done', 'final']);
  const seqs = F.posts.map((p) => p.data.session.save_seq);
  for (let i = 1; i < seqs.length; i++) assert.ok(seqs[i] > seqs[i - 1]);
  for (const p of F.posts) {
    const s = p.data.session, r = s.save_reason;
    assert.equal(p.experiment, 'star-inperson-pilot-test');
    if (r === 'final') { assert.equal(s.partial, false); assert.equal(s.complete, true); assert.equal(s.status, 'complete'); }
    else { assert.equal(s.partial, true); assert.equal(s.complete, false); assert.equal(s.status, 'in_progress'); }
    assert.equal(s.main_done, r === 'main_done' || r === 'final');
  }
  for (let i = 1; i < F.posts.length; i++) {
    const a = F.posts[i - 1].data.trials, b = F.posts[i].data.trials;
    assert.ok(b.length >= a.length);
    assert.deepEqual(b.slice(0, a.length), a, 'trials are a cumulative prefix');
  }
  const fin = F.posts.at(-1);
  const main = fin.data.trials.filter((t) => t.phase === 'main' && !t.timed_out && !t.aborted);
  assert.equal(main.length, 8);
  assert.deepEqual(cellCounts(fin.data.trials), { open_true: 2, open_false: 2, blindfold_true: 2, blindfold_false: 2 });
  assert.equal(fin.data.session.questionnaire.q_influence, 'no');
  assert.equal(fin.data.session.questionnaire.experimenter_fixation_rating, 'good');
  const dl = F.downloads.find((d) => d.json.data.session.save_reason === 'final');
  assert.ok(dl, 'final download');
  assert.equal(dl.name, `star-inperson-pilot-test_TEST01_${F.uuid}_final.json`);
  const { _bytes, _name, ...env } = fin;
  assert.deepEqual(dl.json, env, 'download = POST envelope');
  assert.ok(_bytes <= 900000, `final payload ${_bytes} bytes`);
  assert.equal(fin.data.session.saves.length, 4, 'outcomes of the 4 earlier POSTs are in the final payload');
  assert.ok(fin.data.session.saves.every((s) => s.ok === true && s.http_status === 200));
});

test('T24c analysis script reads the real browser payloads (server files + local download, deduped)', async () => {
  const F = await fullSession();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'star-inperson-analysis-'));
  F.posts.forEach((p, i) => { const { _bytes, _name, ...env } = p; fs.writeFileSync(path.join(dir, `f${i}_${_name}`), JSON.stringify(env, null, 2)); });
  const dl = F.downloads.find((d) => d.json.data.session.save_reason === 'final');
  fs.writeFileSync(path.join(dir, dl.name), dl.text);
  const out = execFileSync('python3', [path.join(REPO, 'analysis/star_inperson.py'), dir, '--experiment', 'star-inperson-pilot-test',
    '--iterations', '500', '--interim', '--include-overridden', '--min-valid-rt-per-cell', '1'], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.match(out, /files=6 unique_uuids=1/);
  assert.match(out, /INCLUDED N=1 /);
  assert.match(out, /CELL MEANS \(ms; mean of participant means\)/);
});

test('T24b default-size session (120 trials, short timings, ~600 ms RTs) stays <= 900,000 bytes', async () => {
  const ctx = await openPage(browser, srv, `${BASE}&${SHORT}&seed=241&practiceTrials=2`);
  ctx.state.delayMs = 600;
  await drive(ctx, { policy: () => 'correct', timeoutMs: 400000 });
  await waitSaved(ctx.page);
  const uuid = await uuidOf(ctx.page);
  await ctx.context.close();
  const fin = postsFor(uuid).at(-1);
  assert.equal(fin.data.session.save_reason, 'final');
  assert.equal(fin.data.trials.filter((t) => t.phase === 'main' && !t.timed_out).length, 120);
  assert.deepEqual(postsFor(uuid).map((p) => p.data.session.save_reason),
    ['setup', 'practice_passed', 'block_1', 'block_2', 'block_3', 'block_4', 'block_5', 'main_done', 'final']);
  // projected worst case: every trial runs the full 2-s response window at 60 Hz (+ ~6 bytes per extra interval)
  const intervals = fin.data.trials.reduce((s, t) => s + (t.dots_frame_intervals_ms || []).length, 0);
  const worst = fin._bytes + (122 * 120 - intervals) * 6;
  console.log(`# T24b final payload ${fin._bytes} bytes; projected all-timeouts worst case ~${worst} bytes`);
  assert.ok(fin._bytes <= 900000);
  assert.ok(!fin.data.session.events.some((e) => e.type === 'payload_trimmed'));
});

test('T25 timeout -> "Too Slow!" for tooSlowMs, re-queued later with same trial_id', async () => {
  const ctx = await openPage(browser, srv, `${BASE}&${SHORT}&pilot=1&seed=25`);
  await ctx.page.evaluate(() => {
    window.__tooSlowInk = [];
    window.__starInPerson.frameListeners.push((info, ctx) => {
      if (info.phase !== 'too_slow') return;
      const c = ctx.canvas, d = ctx.getImageData(c.width / 2 - 60, c.height / 2 - 30, 120, 60).data;
      let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 64) n++;
      window.__tooSlowInk.push(n);
    });
  });
  await drive(ctx, { policy: (ev) => (ev.trial_phase === 'main' && ev.attempt_index === 2 ? 'none' : 'correct') });
  await waitSaved(ctx.page);
  const r = await ctx.page.evaluate(() => ({ frames: window.__starInPerson.frames, trials: window.__starInPerson.trials(), ink: window.__tooSlowInk, frameMs: window.__starInPerson.payloads.at(-1).data.session.display.refresh_median_interval_ms }));
  await ctx.context.close();
  const main = r.trials.filter((t) => t.phase === 'main');
  assert.equal(main.length, 9);
  const to = main.find((t) => t.attempt_index === 2);
  assert.equal(to.timed_out, true); assert.equal(to.correct, null); assert.equal(to.trial_in_block, null);
  const ts = r.frames.filter((f) => f.trial_phase === 'main' && f.attempt_index === 2 && f.phase === 'too_slow').map((f) => f.ts);
  const next = r.frames.find((f) => f.ts > ts.at(-1));
  const dur = next.ts - ts[0];
  assert.ok(Math.abs(dur - 200) <= 2 * r.frameMs, `Too Slow shown ${dur} ms`);
  assert.ok(r.ink.length >= 5 && r.ink.every((n) => n > 50), 'Too Slow! text drawn');
  const again = main.filter((t) => t.trial_id === to.trial_id && t.attempt_index !== 2);
  assert.equal(again.length, 1);
  assert.equal(again[0].requeue_count, 1); assert.equal(again[0].requeued_from, 2);
  assert.notEqual(again[0].attempt_index, 3, 're-queued trial must not be the immediately next one');
  assert.deepEqual(cellCounts(main), { open_true: 2, open_false: 2, blindfold_true: 2, blindfold_false: 2 });
  assert.equal(main.filter((t) => t.block === 1 && t.trial_in_block !== null).length, 4);
});

test('T26 practice failure: 4 fresh attempts, no main trials, terminal practice_failed POST + download', async () => {
  const ctx = await openPage(browser, srv, `${BASE}&${SHORT}&pilot=1&seed=26`);
  await drive(ctx, { policy: () => 'wrong' });
  await waitSaved(ctx.page);
  const uuid = await uuidOf(ctx.page);
  const trials = await ctx.page.evaluate(() => window.__starInPerson.trials());
  await sleep(300);
  await ctx.context.close();
  const posts = postsFor(uuid), last = posts.at(-1).data.session;
  assert.equal(trials.filter((t) => t.phase === 'main').length, 0);
  assert.equal(last.status, 'practice_failed'); assert.equal(last.complete, true); assert.equal(last.partial, false);
  assert.equal(last.practice.attempts.length, 4);
  assert.ok(last.practice.attempts.every((a) => !a.passed && a.n_correct === 0));
  assert.ok(new Set(last.practice.attempts.map((a) => a.directions.join())).size > 1, 'fresh sequences');
  assert.ok(ctx.downloads.some((d) => d.name.endsWith('_practice_failed.json') && d.json.data.session.status === 'practice_failed'));
  assert.equal(trials.length, 20);
});

test('T27 practice pass after one failed attempt', async () => {
  const ctx = await openPage(browser, srv, `${BASE}&${SHORT}&pilot=1&seed=27`);
  await drive(ctx, { policy: (ev) => (ev.trial_phase === 'practice' && ev.attempt_index < 5 ? 'wrong' : 'correct') });
  await waitSaved(ctx.page);
  const uuid = await uuidOf(ctx.page);
  await ctx.context.close();
  const s = postsFor(uuid).at(-1).data;
  assert.equal(s.session.practice.attempts.length, 2);
  assert.deepEqual(s.session.practice.attempts.map((a) => a.passed), [false, true]);
  assert.equal(s.session.status, 'complete');
  assert.equal(s.trials.filter((t) => t.phase === 'main' && !t.timed_out).length, 8);
});

test('T28 Ctrl+Shift+S manual download keeps the loop running; visibility hidden aborts + re-queues; [R] resumes', async () => {
  const ctx = await openPage(browser, srv, `${BASE}&${shortWith({ adaptorMs: 400 })}&pilot=1&seed=28`);
  ctx.state.delayMs = 200;
  const page = ctx.page;
  const phases = () => page.evaluate(() => window.__starInPerson.events.filter((e) => e.type === 'phase' && e.trial_phase === 'main'));
  const actions = (async () => {
    await waitFor(page, () => window.__starInPerson.events.some((e) => e.type === 'phase' && e.trial_phase === 'main' && e.phase === 'adaptor' && e.attempt_index === 1), null, 60000);
    const n0 = (await phases()).length;
    await page.keyboard.press('Control+Shift+S');
    await waitFor(page, () => window.__starInPerson.events.some((e) => e.type === 'download' && e.reason === 'manual'));
    await waitFor(page, (n) => window.__starInPerson.events.filter((e) => e.type === 'phase' && e.trial_phase === 'main').length > n, n0);
    await waitFor(page, () => window.__starInPerson.events.some((e) => e.type === 'phase' && e.trial_phase === 'main' && e.phase === 'fixation' && e.attempt_index === 3), null, 60000);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(page, () => document.body.dataset.screen === 'pause');
    const pausedFrames = await page.evaluate(() => window.__starInPerson.frames.length);
    await sleep(300);
    assert.equal(await page.evaluate(() => window.__starInPerson.frames.length), pausedFrames, 'no trial frames while paused');
    await page.evaluate(() => { delete document.visibilityState; delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    await page.keyboard.press('r');
  })();
  await drive(ctx, { policy: () => 'correct' });
  await actions;
  await waitSaved(page);
  const uuid = await uuidOf(page);
  const trials = await page.evaluate(() => window.__starInPerson.trials());
  const events = (await page.evaluate(() => window.__starInPerson.events)).map((e) => e.type);
  await sleep(300);
  await ctx.context.close();
  const manual = ctx.downloads.find((d) => d.json.data.session.save_reason === 'manual');
  assert.ok(manual && manual.name.endsWith('_manual.json'));
  assert.ok(!postsFor(uuid).some((p) => p.data.session.save_reason === 'manual'), 'manual save is download-only');
  const ab = trials.find((t) => t.aborted);
  assert.ok(ab, 'an aborted trial');
  assert.equal(ab.phase, 'main'); assert.equal(ab.attempt_index, 3); assert.equal(ab.abort_reason, 'hidden');
  assert.equal(ab.visibility_hidden_during_trial, true); assert.equal(ab.correct, null); assert.equal(ab.timed_out, false);
  const re = trials.find((t) => t.requeued_from === 3);
  assert.ok(re && re.trial_id === ab.trial_id && re.requeue_count === 1);
  assert.ok(events.includes('pause') && events.includes('resume'));
  assert.deepEqual(cellCounts(trials), { open_true: 2, open_false: 2, blindfold_true: 2, blindfold_false: 2 });
  assert.equal(postsFor(uuid).at(-1).data.session.status, 'complete');
});

// SPEC §7.2 field types (s = string, n = number, b = boolean, a = array, 0 = null allowed on any record,
// P = null allowed only on practice records, A = null allowed only on aborted records (phase not reached),
// F = null allowed only if fewer than 2 dots frames were drawn (no dot motion yet)).
const TRIAL_FIELDS = {
  session_uuid: 's', participant_id: 's', phase: 's', practice_attempt: 'n0', attempt_index: 'n', trial_id: 's0',
  requeue_count: 'n', requeued_from: 'n0', block: 'n0', trial_in_block: 'n0', adaptor_type: 's', eyes_condition: 's0',
  face_direction: 's0', face_side: 's0', tree_side: 's0', gaze_direction: 's0', implied_direction: 'sP', test_direction: 's',
  congruent: 'b0', congruent_gaze: 'b0', grating_direction: 's0', grating_phase0: 'n0', face_img: 's0', tree_img: 's0',
  tree_mirrored: 'b0', adaptor_images_drawn: 'a', adaptor_frames_drawn: 'n', response: 's0', response_key: 's0',
  response_key_raw: 's0', response_code_raw: 's0',
  correct: 'b0', timed_out: 'b', aborted: 'b', abort_reason: 's0', rt_ms: 'n0', rt_timebase: 's0', rt_handler_ms: 'n0',
  key_event_ts: 'n0', key_event_ts_raw: 'n0', key_handler_ts: 'n0', anticipatory_keys: 'a', late_keys: 'a',
  iti_planned_ms: 'n', iti_actual_ms: 'nA', fixation_actual_ms: 'nA', adaptor_actual_ms: 'nA', trial_start_ts: 'n',
  fixation_onset_ts: 'nA', adaptor_onset_ts: 'nA', dots_onset_ts: 'nA', dots_offset_ts: 'nA', onset_latency_ms: 'nA',
  dots_frames_drawn: 'n', dots_frame_interval_median_ms: 'nA', dots_frame_interval_max_ms: 'nA',
  dots_frame_intervals_ms: 'a', dropped_frames_n: 'n', has_dropped_frame: 'b', max_frame_interval_ms: 'nA', rdk_engine: 's',
  n_dots_per_frame_mean: 'nA', n_dots_per_frame_min: 'nA', n_dots_per_frame_max: 'nA', n_coherent_per_frame_mean: 'nA',
  measured_speed_deg_s: 'nF', dot_size_device_px: 'n', dots_seed: 'n', dots_frame_work_ms_max: 'n',
  visibility_hidden_during_trial: 'b', fullscreen_lost_during_trial: 'b',
};
// Fields that are null exactly when no dots frame was drawn (trial aborted before the dots phase).
const DOTS_FIELDS = ['adaptor_actual_ms', 'dots_onset_ts', 'dots_offset_ts', 'onset_latency_ms', 'dots_frame_interval_median_ms',
  'dots_frame_interval_max_ms', 'n_dots_per_frame_mean', 'n_dots_per_frame_min', 'n_dots_per_frame_max', 'n_coherent_per_frame_mean', 'measured_speed_deg_s'];
const RESPONSE_FIELDS = ['response', 'response_key', 'response_key_raw', 'response_code_raw', 'correct', 'rt_ms', 'rt_timebase', 'rt_handler_ms', 'key_event_ts_raw', 'key_handler_ts'];
const typeOk = (v, spec, t) => (v === null ? spec.includes('0') || (spec.includes('P') && t.phase === 'practice') || (spec.includes('A') && t.aborted) || (spec.includes('F') && t.dots_frames_drawn < 2)
  : Array.isArray(v) ? spec.includes('a')
  : typeof v === 'string' ? spec.includes('s') : typeof v === 'number' ? spec.includes('n') && Number.isFinite(v) : typeof v === 'boolean' ? spec.includes('b') : false);
function checkTrialSchema(t) {
  const where = `${t.phase} #${t.attempt_index}${t.aborted ? ' aborted' : ''}`;
  for (const [k, spec] of Object.entries(TRIAL_FIELDS)) {
    assert.ok(k in t, `trial missing ${k}`);
    assert.ok(typeOk(t[k], spec, t), `${k}=${JSON.stringify(t[k])} (${where}) not ${spec}`);
  }
  assert.ok([null, 'ArrowLeft', 'ArrowRight'].includes(t.response_key), `response_key ${t.response_key}`);
  assert.ok([null, 'event', 'handler'].includes(t.rt_timebase));
  const responded = t.response !== null;
  for (const k of RESPONSE_FIELDS) assert.equal(t[k] !== null, responded, `${k} (${where}) null iff no response`);
  if (responded) {
    assert.equal(t.response_key, t.response === 'left' ? 'ArrowLeft' : 'ArrowRight');
    const keyT = t.rt_timebase === 'event' ? t.key_event_ts : t.key_handler_ts;
    assert.ok(Math.abs(t.rt_ms - (keyT - t.dots_onset_ts)) < 1e-6, `rt invariant (${where})`);
    assert.equal(t.key_event_ts === null, t.rt_timebase === 'handler');
  } else assert.equal(t.key_event_ts, null);
  const dotsShown = t.dots_onset_ts !== null;
  assert.ok(dotsShown || t.aborted, `dots_onset_ts null only on aborted trials (${where})`);
  if (!dotsShown) for (const k of DOTS_FIELDS) assert.equal(t[k], null, `${k} (${where}) null before dots`);
  if (t.phase === 'practice') assert.equal(t.implied_direction, null);
}

const SESSION_KEYS = ['experiment', 'experiment_version', 'code_fingerprint', 'file_hashes', 'session_uuid', 'status', 'partial',
  'complete', 'main_done', 'save_seq', 'save_reason', 'saved_at_iso', 'setup', 'calibration', 'display', 'geometry', 'images',
  'environment', 'seed', 'stream_seeds', 'trial_list', 'config_effective', 'config_overrides', 'config_overridden', 'pilot', 'test',
  'timing', 'events', 'practice', 'main_summary', 'requeue_cap_hit', 'questionnaire', 'saves'];

test('T29 payload schema: every §7.2 field with its type and nullability (normal + aborted terminal payload, practice records); §7.3 session keys; config_effective = resolved config', async () => {
  const F = await fullSession();
  const fin = F.posts.at(-1).data;
  assert.ok(fin.trials.some((t) => t.phase === 'practice'), 'practice records present');
  for (const t of fin.trials) {
    checkTrialSchema(t);
    if (t.phase === 'main') {
      assert.ok(['open', 'blindfold'].includes(t.eyes_condition));
      assert.equal(t.face_direction, 'towards');
      assert.equal(t.congruent_gaze, t.congruent);
      assert.equal(t.congruent, t.test_direction === t.implied_direction);
      assert.equal(t.tree_side === t.face_side, false);
    }
  }
  for (const k of SESSION_KEYS) assert.ok(k in fin.session, `session missing ${k}`);
  for (const k of ['participant_id', 'experimenter', 'monitor_width_cm', 'viewing_distance_cm', 'chinrest_used', 'room_dark', 'monitor_model', 'expected_refresh_hz', 'input_device']) assert.ok(k in fin.session.setup, `setup.${k}`);
  for (const k of ['cm_per_deg', 'ppd_css', 'ppd_device', 'dpr_window', 'dpr_effective', 'inner_w', 'inner_h', 'screen_w', 'screen_h', 'canvas_w', 'canvas_h', 'ruler_confirmed', 'ruler_measured_mm', 'recalibrations', 'calibrated_at_iso', 'display_mode']) assert.ok(k in fin.session.calibration, `calibration.${k}`);
  for (const k of ['refresh_median_interval_ms', 'refresh_hz_est', 'refresh_interval_sd_ms', 'refresh_samples_n']) assert.ok(k in fin.session.display, `display.${k}`);
  for (const k of ['open_cong', 'open_incong', 'blind_cong', 'blind_incong']) assert.equal(fin.session.main_summary.cell_counts[k], 2);
  assert.equal(fin.session.images.length, 5); assert.ok(fin.session.images.every((i) => i.verified));
  assert.match(fin.session.code_fingerprint, /^[0-9a-f]{64}$/);
  assert.deepEqual(fin.session.config_effective, F.config);
  assert.equal(fin.session.trial_list.length, 8);
  assert.equal(typeof fin.session.calibration.refresh_override, 'boolean');

  // Aborted final payload: quit from the pause screen after a main trial is aborted during its adaptor (no dots).
  const ctx = await openPage(browser, srv, `${BASE}&${SHORT}&pilot=1&seed=29`);
  const page = ctx.page;
  const quit = (async () => {
    await waitFor(page, () => window.__starInPerson.events.some((e) => e.type === 'phase' && e.trial_phase === 'main' && e.phase === 'adaptor' && e.attempt_index === 1), null, 60000);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(page, () => document.body.dataset.screen === 'pause');
    await page.keyboard.press('q');
  })();
  await drive(ctx, { policy: () => 'correct' });
  await quit;
  await waitSaved(page);
  const uuid = await uuidOf(page);
  await sleep(300);
  await ctx.context.close();
  const ab = postsFor(uuid).at(-1).data;
  assert.equal(ab.session.status, 'aborted'); assert.equal(ab.session.save_reason, 'aborted'); assert.equal(ab.session.complete, true);
  for (const t of ab.trials) checkTrialSchema(t);
  const cut = ab.trials.find((t) => t.aborted);
  assert.ok(cut && cut.phase === 'main' && cut.attempt_index === 1 && cut.dots_onset_ts === null && cut.adaptor_onset_ts !== null, JSON.stringify(cut));
  assert.ok(ab.trials.some((t) => t.phase === 'practice' && t.implied_direction === null));
  assert.ok(ctx.downloads.some((d) => d.json.data.session.save_reason === 'aborted'), 'terminal download');
});

test('T30 hygiene: local requests only, no CDN/remote references, js files <= 400 lines, star/app.py untouched', async () => {
  const F = await fullSession();
  assert.ok(F.requests.length > 20);
  for (const u of F.requests) assert.ok(u.startsWith(F.origin + '/') || u.startsWith('blob:') || u.startsWith('data:'), `external request ${u}`);
  const root = path.join(REPO, 'static/star-inperson');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const files = walk(root);
  for (const f of files) {
    if (f.endsWith('.png')) continue;
    const txt = fs.readFileSync(f, 'utf8');
    assert.ok(!/(src|href)\s*=\s*["']?https?:\/\//i.test(txt), `${f}: remote src/href`);
    assert.ok(!/import[^;\n]*["']https?:\/\//.test(txt), `${f}: remote import`);
    for (const bad of ['@latest', 'unpkg', 'jsdelivr', 'cdnjs', 'googleapis']) assert.ok(!txt.includes(bad), `${f}: ${bad}`);
    if (f.includes(`${path.sep}js${path.sep}`)) assert.ok(txt.split('\n').length <= 400, `${f}: > 400 lines`);
  }
  // every file the page loads is fingerprinted (data.js CODE_FILES == file tree)
  const { CODE_FILES } = await import('../../static/star-inperson/js/data.js');
  const tree = files.map((f) => path.relative(root, f).split(path.sep).join('/')).sort();
  assert.deepEqual([...CODE_FILES].sort(), tree);
  const diff = execSync('git diff --stat main -- static/star app.py', { cwd: REPO }).toString().trim();
  assert.equal(diff, '', diff);
  const untracked = execSync('git status --porcelain -- static/star app.py', { cwd: REPO }).toString().trim();
  assert.equal(untracked, '', untracked);
});

test('T31 corrupted stimulus image -> fatal error screen, no trial, no fallback drawing', async () => {
  const bad = await startServer({ corrupt: ['star-inperson/img/face_blindfold_R.png'] });
  try {
    const ctx = await openPage(browser, bad, `${BASE}&${SHORT}&pilot=1&seed=31`);
    await waitFor(ctx.page, () => window.__starInPerson && window.__starInPerson.ready);
    await sleep(500);
    const r = await ctx.page.evaluate(() => ({ screen: document.body.dataset.screen, err: window.__starInPerson.error, frames: window.__starInPerson.frames.length,
      trials: window.__starInPerson.trials().length, setupHidden: document.getElementById('setup').hidden, text: document.getElementById('screen').innerText }));
    await ctx.context.close();
    assert.equal(r.screen, 'error');
    assert.match(r.text, /Stimulus image failed to load\/verify: img\/face_blindfold_R\.png/);
    assert.equal(r.frames, 0); assert.equal(r.trials, 0); assert.equal(r.setupHidden, true);
    assert.equal(bad.payloads.length, 0);
  } finally { await bad.close(); }
});
