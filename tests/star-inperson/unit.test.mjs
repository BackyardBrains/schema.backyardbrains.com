// unit.test.mjs — pure-Node tests of config, params, rng, design and calibration math (SPEC §10.1 T1-T9).
// Run: NODE_PATH=$(npm root -g) node --test tests/star-inperson/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, PILOT_PRESET } from '../../static/star-inperson/js/config.js';
import { leafEntries, resolveParams } from '../../static/star-inperson/js/params.js';
import { mainList, faceTreeList, gratingList, PracticeLists, requeueInsert } from '../../static/star-inperson/js/design.js';
import { mulberry32, fnv1a32, makeStream } from '../../static/star-inperson/js/rng.js';
import { cmPerDeg, ppdCss, computeCalibration } from '../../static/star-inperson/js/calibration.js';

// SPEC §3.3 normative defaults (copied verbatim from the spec).
const SPEC_DEFAULTS = {
  experimentName: 'star-inperson', experimentVersion: '1.3.0',
  viewingDistanceCm: 54, backgroundRgb: [128, 128, 128], inkRgb: [0, 0, 0], requireFullscreen: true,
  requireRulerCheck: true, rulerLengthCm: 10, ppdChangeTolerance: 0.005,
  itiMinMs: 1000, itiMaxMs: 2000, fixationMs: 1500, adaptorMs: 1500, responseWindowMs: 2000, tooSlowMs: 5000,
  droppedFrameFactor: 1.5, fixationDiameterDeg: 0.5,
  engine: 'guterstam2020', apertureWidthDeg: 5, apertureHeightDeg: 5, densityDotsPerDeg2: 50,
  densityDotsPerDeg2PerSec: 50, dotDiameterDeg: 0.05, dotSpeedDegPerSec: 1.4, lifetimeMs: 200, coherence: 0.40,
  shadlenSets: 3, stimulusHeightDeg: 5.7, innerEdgeDeg: 2.5, gazeLineYDeg: 0, mirrorTreeWithSide: true,
  face_open_R: { file: 'img/face_open_R.png', sha256: '00bc1ab62bdf578e7c3658fad8dc22e0888a225fdecbee403ac58e3a5ea320a8', contentBox: [78, 173, 1003, 1177], eyePx: [789, 487] },
  face_open_L: { file: 'img/face_open_L.png', sha256: '85ecb8c0675c4f9d497a2b7e0fa27b666d266736009450d3144c4412d6678be8', contentBox: [77, 173, 1002, 1177], eyePx: [290, 487] },
  face_blindfold_R: { file: 'img/face_blindfold_R.png', sha256: '2311cf6dfb908b4a9c736dbc4c30908756a6a28d189286136c976dc1d40465da', contentBox: [78, 173, 1003, 1177], eyePx: [789, 487] },
  face_blindfold_L: { file: 'img/face_blindfold_L.png', sha256: 'd24dfabd45b3441779aec64cdd87697bbcf3816e57fe902494dcb59c4e0e35f8', contentBox: [77, 173, 1002, 1177], eyePx: [290, 487] },
  tree: { file: 'img/tree.png', sha256: 'c88e8a312a93fdae64759316e45d844f349a6406e2b4ebc3bd1ce98fef28cf6b', contentBox: [31, 0, 1049, 1350] },
  blindfoldProbePx: { R: [700, 445], L: [379, 445] },
  gratingPeriodDeg: 0.8, gratingWidthDeg: 14.7, gratingHeightDeg: 5.7, gratingSpeedDegPerSec: 0.8, gratingContrast: 1.0,
  adaptor: 'face_tree', trialsPerCell: 30, blockSize: 20, requeueTimeouts: true, maxTimeoutsPerSession: 40,
  practiceTrials: 10, practicePassAccuracy: 0.80, practiceMaxAttempts: 4,
  keyLeft: 'ArrowLeft', keyRight: 'ArrowRight',
  dataUrl: '/data', postTimeoutMs: 10000, postRetries: 3, autoDownloadAtEnd: true, saveFrameIntervals: true,
  maxPayloadBytes: 900000,
};

test('T1 leaf keys unique; every SPEC §3.3 key present with its default', () => {
  const keys = leafEntries(CONFIG).map((e) => e.key);
  assert.equal(new Set(keys).size, keys.length, 'duplicate leaf key');
  const byKey = Object.fromEntries(leafEntries(CONFIG).map((e) => [e.key, e.value]));
  for (const [k, v] of Object.entries(SPEC_DEFAULTS)) {
    assert.ok(k in byKey, `missing key ${k}`);
    assert.deepEqual(byKey[k], v, `default of ${k}`);
  }
  assert.deepEqual(PILOT_PRESET, { trialsPerCell: 2, blockSize: 4, practiceTrials: 5 });
});

test('T2 URL override is applied, logged and flagged; bad params are fatal', () => {
  const r = resolveParams('?dotSpeedDegPerSec=2&seed=42');
  assert.deepEqual(r.errors, []);
  assert.equal(r.config.rdk.dotSpeedDegPerSec, 2);
  assert.deepEqual(r.overrides.dotSpeedDegPerSec, { default: 1.4, value: 2 });
  assert.equal(r.overridden, true);
  assert.equal(r.seed, 42);
  assert.ok(Object.isFrozen(r.config) && Object.isFrozen(r.config.rdk), 'config frozen');
  for (const bad of ['?foo=1', '?coherence=abc', '?trialsPerCell=3', '?coherence=1.5', '?engine=kiani', '?itiMinMs=3000', '?seed=-1']) {
    assert.ok(resolveParams(bad).errors.length > 0, `${bad} must be fatal`);
  }
  assert.equal(resolveParams('?requireFullscreen=0').config.display.requireFullscreen, false);
  assert.deepEqual(resolveParams('?backgroundRgb=100,100,100').config.display.backgroundRgb, [100, 100, 100]);
});

test('T3 experiment name per mode; adaptor is the mode key (not flagged)', () => {
  assert.equal(resolveParams('').experimentName, 'star-inperson');
  assert.equal(resolveParams('?pilot=1').experimentName, 'star-inperson-pilot');
  const g = resolveParams('?adaptor=grating');
  assert.equal(g.experimentName, 'star-inperson-grating');
  assert.equal(g.overridden, false);
  assert.equal(resolveParams('?test=1').experimentName, 'star-inperson-test');
  assert.equal(resolveParams('?adaptor=grating&pilot=1&test=1').experimentName, 'star-inperson-grating-pilot-test');
  assert.equal(resolveParams('?pilot=1').overridden, false);
});

test('T4 pilot preset: 8 main trials, blocks of 4, 5 practice trials', () => {
  const r = resolveParams('?pilot=1');
  assert.equal(mainList(r.config, 1).length, 8);
  assert.equal(r.config.design.blockSize, 4);
  assert.equal(r.config.practice.practiceTrials, 5);
  assert.equal(new PracticeLists(r.config, 1).next().length, 5);
});

test('T5 face-tree list exactly balanced for seeds 1..200', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const L = mainList(CONFIG, seed);
    assert.equal(L.length, 120);
    for (const eyes of ['open', 'blindfold']) {
      for (const cong of [true, false]) {
        const cell = L.filter((c) => c.eyes_condition === eyes && c.congruent === cong);
        assert.equal(cell.length, 30);
        assert.equal(cell.filter((c) => c.face_side === 'left').length, 15);
        assert.equal(cell.filter((c) => c.face_side === 'right').length, 15);
      }
    }
    assert.equal(L.filter((c) => c.test_direction === 'left').length, 60);
    assert.equal(L.filter((c) => c.test_direction === 'right').length, 60);
    for (const c of L) {
      assert.equal(c.congruent, c.test_direction === c.implied_direction);
      assert.notEqual(c.implied_direction, c.face_side);
      assert.equal(c.gaze_direction, c.implied_direction);
    }
    assert.equal(new Set(L.map((c) => c.trial_id)).size, 120);
  }
});

test('T6 same seed -> identical list; different seeds -> different order; grating list', () => {
  assert.deepEqual(faceTreeList(CONFIG, 5), faceTreeList(CONFIG, 5));
  assert.notDeepEqual(faceTreeList(CONFIG, 1).map((c) => c.trial_id), faceTreeList(CONFIG, 2).map((c) => c.trial_id));
  const g = resolveParams('?adaptor=grating').config;
  const G = mainList(g, 3);
  assert.equal(G.length, 60);
  for (const d of ['left', 'right']) {
    for (const cong of [true, false]) {
      assert.equal(G.filter((c) => c.grating_direction === d && c.congruent === cong).length, 15);
    }
  }
  for (const c of G) {
    assert.equal(c.implied_direction, c.grating_direction);
    assert.equal(c.eyes_condition, null); assert.equal(c.face_side, null);
    assert.ok(c.grating_phase0 >= 0 && c.grating_phase0 < 2 * Math.PI);
  }
  assert.deepEqual(gratingList(g, 3), gratingList(g, 3));
});

test('T7 requeue insertion: index >= 1 when R >= 1; multiset preserved', () => {
  const rng = mulberry32(99);
  for (let rep = 0; rep < 500; rep++) {
    const n = Math.floor(rng() * 12);
    const queue = Array.from({ length: n }, (_, i) => `q${i}`);
    const inserted = [];
    const rq = makeStream(rep, 'requeue');
    for (let k = 0; k < 1 + Math.floor(rng() * 5); k++) {
      const R = queue.length;
      const item = `r${k}`;
      const j = requeueInsert(queue, item, rq);
      inserted.push(item);
      if (R >= 1) assert.ok(j >= 1 && j <= R, `j=${j} R=${R}`);
      else assert.equal(j, 0);
      assert.equal(queue[j], item);
      if (rng() < 0.5 && queue.length) queue.shift();   // simulate trials being consumed
    }
    const after = [...queue];
    // every re-queued item that has not been consumed is present exactly once; nothing else appeared
    for (const x of after) assert.ok(/^q\d+$/.test(x) || inserted.includes(x));
    assert.equal(new Set(after).size, after.length);
  }
  // pure multiset check without consumption
  const q = ['a', 'b', 'c'], rq = mulberry32(1);
  requeueInsert(q, 'x', rq); requeueInsert(q, 'y', rq);
  assert.deepEqual([...q].sort(), ['a', 'b', 'c', 'x', 'y']);
  assert.notEqual(q[0], 'x');
});

test('T8 practice: 5/5 directions per attempt, attempts are fresh sequences', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const P = new PracticeLists(CONFIG, seed);
    const attempts = [1, 2, 3, 4].map(() => P.next().map((c) => c.test_direction));
    for (const a of attempts) {
      assert.equal(a.length, 10);
      assert.equal(a.filter((d) => d === 'left').length, 5);
    }
    assert.ok(new Set(attempts.map((a) => a.join())).size > 1, `seed ${seed}: all attempts identical`);
  }
  const odd = new PracticeLists(resolveParams('?practiceTrials=7').config, 3).next();
  const nl = odd.filter((c) => c.test_direction === 'left').length;
  assert.ok(nl === 3 || nl === 4);
});

test('T9 calibration math', () => {
  // SPEC §10.1 T9 (corrected 2026-09-30): cmPerDeg(54) = 2*54*tan(0.5 deg) = 0.9425017 +- 1e-6.
  assert.ok(Math.abs(cmPerDeg(54) - 0.9425017) <= 1e-6, String(cmPerDeg(54)));
  assert.ok(Math.abs(cmPerDeg(54) - 2 * 54 * Math.tan(Math.PI / 360)) <= 1e-12);
  assert.ok(Math.abs(ppdCss(1600, 38, 54) - 39.68) <= 0.01, String(ppdCss(1600, 38, 54)));
  const c = computeCalibration({ innerW: 1600, innerH: 1200, dpr: 1.5, monitorWidthCm: 38, viewingDistanceCm: 54 });
  assert.equal(c.canvasW, 2400); assert.equal(c.dprEff, 1.5);
  assert.ok(Math.abs(c.ppdDevice - 1.5 * c.ppdCss) < 1e-9);
});

test('rng: FNV-1a reference values and determinism', () => {
  assert.equal(fnv1a32(''), 0x811c9dc5);
  assert.equal(fnv1a32('a'), 0xe40c292c);
  const a = mulberry32(7), b = mulberry32(7);
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
});

// ---- iPad-rig amendments (Greg 2026-09-29): pure helpers ----
import { keyTime, keyDirection, canonicalKey } from '../../static/star-inperson/js/trialRunner.js';
import { keytestSequence, scoreKeytest, KEYTEST_N } from '../../static/star-inperson/js/keytest.js';
import { refreshWarnings, refreshStats } from '../../static/star-inperson/js/calibration.js';

test('iPad: KeyboardEvent.timeStamp used only when on the performance.now() timebase', () => {
  assert.deepEqual(keyTime(1000, 1003), { t: 1000, timebase: 'event' });
  assert.deepEqual(keyTime(1000, 1000), { t: 1000, timebase: 'event' });
  assert.deepEqual(keyTime(1000, 1051), { t: 1051, timebase: 'handler' });        // > 50 ms old
  assert.deepEqual(keyTime(1005, 1000), { t: 1000, timebase: 'handler' });        // in the future
  assert.deepEqual(keyTime(1.7e12, 1000), { t: 1000, timebase: 'handler' });      // epoch-based stamp
  assert.deepEqual(keyTime(NaN, 1000), { t: 1000, timebase: 'handler' });
});

test('iPad: responses by KeyboardEvent.key or .code', () => {
  const K = CONFIG.keys;
  assert.equal(keyDirection({ key: 'ArrowLeft', code: 'ArrowLeft' }, K), 'left');
  assert.equal(keyDirection({ key: 'Unidentified', code: 'ArrowRight' }, K), 'right');
  assert.equal(keyDirection({ key: 'ArrowRight', code: '' }, K), 'right');
  assert.equal(keyDirection({ key: ' ', code: 'Space' }, K), null);
  // the logged response_key is always the canonical key of the recognised direction (raw values kept separately)
  assert.equal(canonicalKey(keyDirection({ key: 'Unidentified', code: 'ArrowRight' }, K), K), 'ArrowRight');
  assert.equal(canonicalKey('left', K), 'ArrowLeft');
  assert.equal(canonicalKey(null, K), null);
});

test('?keytest=1: balanced shuffled prompts; scoring of missed / wrong / extra / unrecognised keys', () => {
  const rng = makeStream(5, 'keytest'), a = keytestSequence(rng), b = keytestSequence(rng);
  assert.equal(a.length, KEYTEST_N); assert.equal(KEYTEST_N, 20);
  assert.equal(a.filter((d) => d === 'left').length, 10); assert.equal(b.filter((d) => d === 'right').length, 10);
  assert.notDeepEqual(a, b, 'a rerun gets a fresh order');
  const k = (dir, timebase = 'event') => ({ dir, timebase });
  const perfect = a.map((prompt) => ({ prompt, presses: [k(prompt)] }));
  assert.deepEqual(scoreKeytest(perfect), { n: 20, correct: 20, missed: 0, wrong: 0, extra: 0, late: 0, unrecognized: 0, timebase: { event: 20, handler: 0 }, pass: true });
  const bad = perfect.map((p) => ({ ...p, presses: [...p.presses] }));
  bad[0].presses = [];                                                     // lost key
  bad[1].presses = [k(bad[1].prompt === 'left' ? 'right' : 'left')];      // wrong direction
  bad[2].presses.push(k(bad[2].prompt, 'handler'));                       // double press
  bad[3].presses = [k(null)];                                             // unrecognised key (e.g. no .key/.code)
  const s = scoreKeytest(bad);
  assert.deepEqual([s.correct, s.missed, s.wrong, s.extra, s.unrecognized, s.pass], [17, 1, 2, 1, 1, false]);
  assert.deepEqual(s.timebase, { event: 19, handler: 1 });
  const extraOnly = perfect.map((p, i) => (i === 7 ? { ...p, presses: [k(p.prompt), k(p.prompt)] } : p));
  assert.equal(scoreKeytest(extraOnly).pass, false, '20/20 correct but an extra keydown is still a FAIL');
  const lateOnly = perfect.map((p, i) => (i === 4 ? { ...p, presses: [{ ...k(p.prompt), late: true }] } : p));
  const sl = scoreKeytest(lateOnly);   // round-2 finding: a key after the deadline must not repair the miss
  assert.deepEqual([sl.correct, sl.missed, sl.late, sl.extra, sl.pass], [19, 1, 1, 1, false]);
});

test('iPad: refresh warnings (< 110 Hz at 120 expected, unstable, measured != expected)', () => {
  const at = (ms, sd = 0) => refreshStats(Array.from({ length: 200 }, (_, i) => ms + (i % 2 ? sd : -sd)), 10);
  assert.deepEqual(refreshWarnings(at(1000 / 120), 120), []);
  assert.deepEqual(refreshWarnings(at(1000 / 60), 60), []);
  const w60 = refreshWarnings(at(1000 / 60), 120);
  assert.ok(w60.some((w) => /below 110/.test(w)) && w60.some((w) => /expected 120/.test(w)));
  assert.ok(refreshWarnings(at(1000 / 120, 1.5), 120).some((w) => /unstable/.test(w)));
  assert.ok(refreshWarnings(at(1000 / 120), 60).some((w) => /expected 60/.test(w)));
  assert.equal(CONFIG.display.expectedRefreshHz, 120);
});
