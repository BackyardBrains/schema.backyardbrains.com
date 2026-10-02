// diag.js — ?diag=1 rig diagnostics (iPad rig amendment): after setup + calibration, draws the configured dot
// engine continuously for diagDurationMs (10 s) exactly as in a trial (clear + all dots every frame) and reports
// achieved fps, dropped frames and max frame time / JS work. Nothing is POSTed; the report can be downloaded.
import { makeEngine } from './rdk.js';
import { mulberry32 } from './rng.js';
import { refreshStats } from './calibration.js';
import { downloadText } from './data.js';
import * as S from './screens.js';

const pct = (xs, q) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : null; };
const f2 = (x) => (x === null || !Number.isFinite(x) ? 'n/a' : x.toFixed(2));

function runDots(exp, durationMs) {
  const cfg = exp.cfg, stage = exp.stage;
  const ap = { widthDeg: cfg.rdk.apertureWidthDeg, heightDeg: cfg.rdk.apertureHeightDeg, refreshHz: exp.session.display.refresh_hz_est };
  const eng = makeEngine(cfg.rdk.engine, cfg.rdk, ap, 1, mulberry32(exp.seed), null);
  const iv = new Float64Array(20000), work = new Float64Array(20000);
  let n = 0, prev = null, t0 = null;
  return new Promise((resolve) => {
    const tick = (ts) => {
      if (t0 === null) t0 = ts;
      if (prev !== null && n < iv.length) iv[n] = ts - prev;
      const w0 = performance.now();
      if (prev === null) stage.clear(); else stage.clearAperture();   // same as a trial's dots phase
      stage.drawDots(eng.frame(ts));
      if (prev !== null && n < iv.length) work[n++] = performance.now() - w0;
      prev = ts;
      if (ts - t0 < durationMs) requestAnimationFrame(tick);
      else resolve({ intervals: Array.from(iv.subarray(0, n)), work: Array.from(work.subarray(0, n)), durationMs: ts - t0, stats: eng.stats() });
    };
    requestAnimationFrame(tick);
  });
}

export function diagReport(exp, run) {
  const d = exp.session.display, expected = exp.session.setup.expected_refresh_hz;
  const st = refreshStats(run.intervals, 0);
  const ref = d.refresh_median_interval_ms, thr = exp.cfg.timing.droppedFrameFactor * ref;
  const dropped = run.intervals.filter((x) => x > thr).length;
  const fps = run.intervals.length / (run.durationMs / 1000);
  return {
    t_iso: new Date().toISOString(), experiment_version: exp.cfg.meta.experimentVersion, code_fingerprint: exp.session.code_fingerprint,
    engine: exp.cfg.rdk.engine, dots_per_frame: run.stats.nPerFrameMean, dot_size_device_px: exp.stage.dotSizePx(),
    canvas_w: exp.stage.canvas.width, canvas_h: exp.stage.canvas.height, ppd_device: exp.cal.ppdDevice,
    display_mode: exp.session.calibration.display_mode, expected_refresh_hz: expected,
    duration_ms: run.durationMs, frames: run.intervals.length + 1, achieved_fps: fps,
    median_interval_ms: st.refresh_median_interval_ms, median_hz: st.refresh_hz_est, interval_sd_ms: st.refresh_interval_sd_ms,
    p99_interval_ms: pct(run.intervals, 0.99), max_interval_ms: run.intervals.length ? Math.max(...run.intervals) : null,
    dropped_frames: dropped, dropped_fraction: run.intervals.length ? dropped / run.intervals.length : null,
    max_work_ms: run.work.length ? Math.max(...run.work) : null, p99_work_ms: pct(run.work, 0.99),
    measured_speed_deg_s: run.stats.measuredSpeedDegPerSec,
    pass: fps >= 0.95 * expected && dropped <= 0.005 * run.intervals.length,
    user_agent: navigator.userAgent,
  };
}

export async function runDiagnostics(exp) {
  for (;;) {
    S.setScreen('diag_running');
    const run = await runDots(exp, exp.cfg.display.diagDurationMs);
    exp.stage.clear();
    const r = diagReport(exp, run);
    exp.logEvent('diag', r);
    if (exp.hooks) exp.hooks.G.diag = r;
    const rows = [
      ['verdict', r.pass ? '<span class="ok">PASS</span>' : `<span class="warn">FAIL — expected ${r.expected_refresh_hz} fps with ≤ 0.5 % dropped frames</span>`],
      ['achieved fps', `${f2(r.achieved_fps)} (median interval ${f2(r.median_interval_ms)} ms = ${f2(r.median_hz)} Hz, SD ${f2(r.interval_sd_ms)} ms)`],
      ['dropped frames', `${r.dropped_frames} of ${r.frames - 1} (${f2(100 * r.dropped_fraction)} %)`],
      ['max / p99 frame interval', `${f2(r.max_interval_ms)} / ${f2(r.p99_interval_ms)} ms`],
      ['max / p99 JS work per frame', `${f2(r.max_work_ms)} / ${f2(r.p99_work_ms)} ms`],
      ['dots', `${r.engine}, ${r.dots_per_frame} per frame, ${r.dot_size_device_px} px, canvas ${r.canvas_w} x ${r.canvas_h}, ${r.display_mode}`],
    ];
    const key = await S.message(`<h1>Rig diagnostics (${(r.duration_ms / 1000).toFixed(1)} s of dots)</h1>
      <table>${rows.map(([a, b]) => `<tr><td><b>${a}</b></td><td>${b}</td></tr>`).join('')}</table>
      <p>Press <b>R</b> to run again, <b>D</b> to download this report, <b>Q</b> to finish.</p>`, { name: 'diag_report', keys: ['r', 'd', 'q'] });
    const k = String(key).toLowerCase();
    if (k === 'd') downloadText(`star-inperson-diag_${exp.uuid}.json`, JSON.stringify(r, null, 2));
    if (k === 'q' || k === 'd') { S.showEnd('Diagnostics finished. Reload the page to run a session.', ''); return; }
  }
}
