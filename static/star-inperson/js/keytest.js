// keytest.js — ?keytest=1 counted keypress check (added 2026-09-30 after verification). After setup + calibration
// it prompts KEYTEST_N arrow presses (half left, half right, shuffled) on the real keyboard, records every keydown
// with the same key mapping (keyDirection) and timebase check (keyTime) as the trial runner, and reports missed,
// wrong, extra and unrecognised keys plus the timebase used. PASS = every prompt answered correctly, no extra key.
// The on-device checklist requires PASS (20/20) before a participant. Nothing is POSTed; [D] downloads the report.
import { keyDirection, keyTime, canonicalKey } from './trialRunner.js';
import { makeStream, shuffle } from './rng.js';
import { downloadText } from './data.js';
import * as S from './screens.js';

export const KEYTEST_N = 20;              // prompts per run (10 left + 10 right)
export const KEYTEST_TIMEOUT_MS = 3000;   // no keydown within this -> the prompt counts as missed (lost key)
export const KEYTEST_SETTLE_MS = 400;     // after the answer, further keydowns still count as extra for this prompt
export const KEYTEST_GAP_MS = 300;        // blank screen between prompts (keydowns here are extra, too)
const MODIFIERS = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'];
const r1 = (x) => Math.round(x * 10) / 10;

export function keytestSequence(rng, n = KEYTEST_N) {
  return shuffle([...Array(n / 2).fill('left'), ...Array(n / 2).fill('right')], rng);
}

// prompts: [{prompt: 'left'|'right', presses: [{dir, timebase, late, ...}]}]. The answer is the first press that
// arrived before the prompt's deadline; a press after the deadline is `late`: it never repairs a miss and counts as extra.
export function scoreKeytest(prompts) {
  const s = { n: prompts.length, correct: 0, missed: 0, wrong: 0, extra: 0, late: 0, unrecognized: 0, timebase: { event: 0, handler: 0 } };
  for (const p of prompts) {
    const onTime = p.presses.filter((k) => !k.late), first = onTime[0];
    s.late += p.presses.length - onTime.length;
    s.extra += Math.max(0, onTime.length - 1) + (p.presses.length - onTime.length);
    for (const k of p.presses) { if (!k.dir) s.unrecognized++; s.timebase[k.timebase]++; }
    if (!first) s.missed++; else if (first.dir === p.prompt) s.correct++; else s.wrong++;
  }
  s.pass = s.n > 0 && s.correct === s.n && s.extra === 0;
  return s;
}

function runOnce(exp, seq) {
  const keys = exp.cfg.keys, G = exp.hooks ? exp.hooks.G : null, stage = exp.stage;
  const prompts = seq.map((prompt) => ({ prompt, presses: [], timed_out: false }));
  let cur = -1, shownAt = 0, wake = null;
  const on = (e) => {
    if (e.repeat || cur < 0 || MODIFIERS.includes(e.key)) return;
    const now = performance.now(), dir = keyDirection(e, keys), kt = keyTime(e.timeStamp, now);
    prompts[cur].presses.push({ dir, key: canonicalKey(dir, keys), key_raw: e.key, code_raw: e.code, timebase: kt.timebase,
      key_event_ts_raw: r1(e.timeStamp), key_handler_ts: r1(now), t_rel_prompt_ms: r1(kt.t - shownAt),
      late: prompts[cur].timed_out || kt.t - shownAt > KEYTEST_TIMEOUT_MS });
    if (wake) wake();
  };
  const wait = (ms, untilPress) => new Promise((resolve) => {
    const t = setTimeout(() => { wake = null; resolve(); }, ms);
    wake = untilPress ? () => { clearTimeout(t); wake = null; resolve(); } : null;
  });
  window.addEventListener('keydown', on);
  return (async () => {
    for (let i = 0; i < prompts.length; i++) {
      cur = i;
      stage.clear();
      stage.drawText(prompts[i].prompt === 'left' ? '← LEFT' : 'RIGHT →', 1, 0);
      stage.drawText(`${i + 1} / ${prompts.length}`, 0.4, -3);
      shownAt = performance.now();
      if (G) G.keytestPrompt = { index: i, prompt: prompts[i].prompt };
      if (!prompts[i].presses.length) await wait(KEYTEST_TIMEOUT_MS, true);
      if (prompts[i].presses.length) await wait(KEYTEST_SETTLE_MS, false);
      else prompts[i].timed_out = true;   // deadline passed: the answer is frozen as missed
      stage.clear();
      if (G) G.keytestPrompt = { index: i, prompt: null };
      await wait(KEYTEST_GAP_MS, false);
    }
    cur = -1;
    window.removeEventListener('keydown', on);
    if (G) G.keytestPrompt = null;
    return prompts;
  })();
}

export function keytestReport(exp, prompts) {
  return {
    t_iso: new Date().toISOString(), experiment_version: exp.cfg.meta.experimentVersion, code_fingerprint: exp.session.code_fingerprint,
    input_device: exp.session.setup.input_device, display_mode: exp.session.calibration.display_mode,
    timeout_ms: KEYTEST_TIMEOUT_MS, ...scoreKeytest(prompts), prompts, user_agent: navigator.userAgent,
  };
}

export async function runKeytest(exp) {
  const rng = makeStream(exp.seed, 'keytest');
  await S.message(`<h1>Key test</h1><p>Press the arrow key shown on the screen, once per prompt, on the participant's keyboard
    (${KEYTEST_N} prompts). A prompt with no key within ${KEYTEST_TIMEOUT_MS / 1000} s counts as a lost key.</p><p>Press SPACE to start.</p>`, { name: 'keytest_intro' });
  for (;;) {
    S.setScreen('keytest');
    const r = keytestReport(exp, await runOnce(exp, keytestSequence(rng)));
    exp.stage.clear();
    exp.logEvent('keytest', { pass: r.pass, correct: r.correct, missed: r.missed, wrong: r.wrong, extra: r.extra, late: r.late, timebase: r.timebase });
    if (exp.hooks) exp.hooks.G.keytest = r;
    const rows = [
      ['verdict', r.pass ? `<span class="ok">PASS (${r.correct}/${r.n})</span>` : `<span class="warn">FAIL — ${r.correct}/${r.n} correct; do not run participants</span>`],
      ['missed (no key within timeout)', r.missed], ['wrong direction', r.wrong], ['extra keydowns', r.extra], ['late keydowns (after the deadline)', r.late],
      ['unrecognised keys', r.unrecognized], ['timebase', `event ${r.timebase.event}, handler ${r.timebase.handler}`],
      ['keyboard / display', `${r.input_device}, ${r.display_mode}`],
    ];
    const key = await S.message(`<h1>Key test</h1><table>${rows.map(([a, b]) => `<tr><td><b>${a}</b></td><td>${b}</td></tr>`).join('')}</table>
      <p>Press <b>R</b> to run again, <b>D</b> to download this report, <b>Q</b> to finish.</p>`, { name: 'keytest_report', keys: ['r', 'd', 'q'] });
    const k = String(key).toLowerCase();
    if (k === 'd') downloadText(`star-inperson-keytest_${exp.uuid}.json`, JSON.stringify(r, null, 2));
    if (k === 'q' || k === 'd') { S.showEnd('Key test finished. Reload the page to run a session.', ''); return; }
  }
}
