// setupFlow.js — experimenter setup screen (SPEC §2.1) and the fullscreen calibration check (§2.2-2.4),
// including the iPad-rig amendments: screen preset, expected refresh rate, input device, landscape blocker,
// fullscreen API *or* Home Screen (standalone) mode, viewport-based width. Functions take the experiment.
import { measureWindow, sizeCanvas, measureRefresh, refreshWarnings, nextResize, isFullscreen, isLandscape,
  displayMode, requestFs, viewportMetrics } from './calibration.js';
import { prerenderFaceTree } from './adaptors.js';
import { estimateMinutes } from './params.js';
import { countBackups, downloadBackups } from './data.js';
import { MONITOR_PRESETS, INPUT_DEVICES } from './config.js';
import * as S from './screens.js';

const fmtRefresh = (r) => `${r.refresh_hz_est.toFixed(1)} Hz (median ${r.refresh_median_interval_ms.toFixed(2)} ms, SD ${r.refresh_interval_sd_ms.toFixed(2)} ms, n=${r.refresh_samples_n})`;
export const refreshHtml = (r, expected) => {
  const w = refreshWarnings(r, expected);
  return `refresh: ${fmtRefresh(r)} ` + (w.length ? `<span class="warn">${w.join('; ')}</span>` : '<span class="ok">OK</span>');
};

export async function runSetup(exp) {
  const c = exp.cfg, p = exp.p, fp = exp.session.code_fingerprint, est = estimateMinutes(c);
  const banners = [];
  const ov = Object.entries(p.overrides).filter(([k]) => k !== 'adaptor');
  if (ov.length) banners.push({ cls: 'orange', text: 'NON-DEFAULT PARAMETERS (not for real participants): ' + ov.map(([k, v]) => `${k}=${JSON.stringify(v.value)} (default ${JSON.stringify(v.default)})`).join(', ') });
  if (p.pilot) banners.push({ cls: 'blue', text: 'PILOT MODE' });
  if (c.design.adaptor === 'grating') banners.push({ cls: 'blue', text: 'GRATING RIG-CHECK MODE' });
  if (p.diag) banners.push({ cls: 'blue', text: 'DIAGNOSTICS MODE (no data are saved)' });
  if (p.keytest) banners.push({ cls: 'blue', text: 'KEY TEST MODE (no data are saved)' });
  if (fp === 'unavailable') banners.push({ cls: 'red', text: 'crypto.subtle unavailable: code fingerprint cannot be computed (serve over https or localhost)' });
  S.setBanner(banners);
  const metaHtml = [
    `experiment: <b>${p.experimentName}</b>   version: ${c.meta.experimentVersion}`,
    `code fingerprint: <b>${fp === 'unavailable' ? '<span class="warn">unavailable</span>' : fp.slice(0, 12)}</b>   seed: ${exp.seed}`,
    `main trials: ${est.nMain} in ${est.blocks} blocks · engine ${c.rdk.engine} · speed ${c.rdk.dotSpeedDegPerSec} °/s`,
    `estimated participant time: ${Math.round(est.low)}–${Math.round(est.high)} min · display mode: ${displayMode()}`,
  ].join('<br>');
  if (exp.hooks) exp.hooks.G.ready = true;
  // Refresh estimate on the setup screen (~2 s), so Safari/iPad frame-rate settings can be fixed before starting.
  let setupRefresh = null;
  const show = () => S.setRefreshReadout(setupRefresh ? refreshHtml(setupRefresh, S.expectedRefresh()) : 'Measuring refresh rate…');
  measureRefresh(180, 10, c.display.refreshMeasureMinMs).then((r) => { setupRefresh = r; exp.session.display_setup_estimate = r; show(); });
  const v = await S.showSetup({
    metaHtml, presets: MONITOR_PRESETS, devices: INPUT_DEVICES, onExpectedChange: show,
    defaults: { participant_id: p.diag ? 'DIAG' : p.keytest ? 'KEYTEST' : p.pid, viewing_distance_cm: c.display.viewingDistanceCm, expected_refresh_hz: c.display.expectedRefreshHz },
    backups: countBackups(), onBackups: downloadBackups,
    onGesture: () => { if (c.display.requireFullscreen && !isFullscreen()) exp.fsPromise = requestFs(); },
  });
  exp.session.setup = v;
  exp.logEvent('setup', v);
}

export function applyCalibration(exp) {
  const cal = sizeCanvas(exp.stage.canvas, measureWindow(exp.session.setup));
  exp.stage.setCalibration(cal);
  if (exp.cfg.design.adaptor === 'face_tree') prerenderFaceTree(exp.stage);
  const prev = exp.session.calibration || { recalibrations: [], ruler_confirmed: false, ruler_measured_mm: null, refresh_override: false };
  const vp = cal.viewport;
  exp.session.calibration = {
    cm_per_deg: cal.cmPerDeg, ppd_css: cal.ppdCss, ppd_device: cal.ppdDevice, dpr_window: cal.dprWindow,
    dpr_effective: cal.dprEff, inner_w: vp.inner_w, inner_h: vp.inner_h, css_w: cal.innerW, css_h: cal.innerH,
    visual_viewport_w: vp.visual_viewport_w, visual_viewport_h: vp.visual_viewport_h, visual_viewport_scale: vp.visual_viewport_scale,
    screen_w: vp.screen_w, screen_h: vp.screen_h, canvas_w: cal.canvasW, canvas_h: cal.canvasH,
    monitor_width_cm: cal.monitorWidthCm, viewing_distance_cm: cal.viewingDistanceCm,
    display_mode: displayMode(), fullscreen: isFullscreen(),
    ruler_confirmed: prev.ruler_confirmed, ruler_measured_mm: prev.ruler_measured_mm, refresh_override: prev.refresh_override,
    recalibrations: prev.recalibrations, calibrated_at_iso: new Date().toISOString(),
  };
  exp.cal = cal;
  exp.logEvent('calibration', { ppd_device: cal.ppdDevice, css_w: cal.innerW, display_mode: displayMode() });
  return cal;
}

// Landscape is required (iPad rig): block with a "rotate" screen until the viewport is wider than tall.
export async function waitLandscape(exp) {
  if (isLandscape()) return;
  exp.logEvent('rotate_required', viewportMetrics());
  S.showRotate(true);
  while (!isLandscape()) await nextResize(500);
  S.showRotate(false);
  await nextResize(400);
}

// Calibration check screen. Loops until fullscreen (API or standalone) is active when required.
export async function runCalibration(exp) {
  const c = exp.cfg.display;
  while (c.requireFullscreen && !isFullscreen()) {
    await (exp.fsPromise || Promise.resolve(false));
    if (isFullscreen()) { await nextResize(700); break; }
    await S.message('<p class="warn">Fullscreen is required. Press F (or tap here) to enter fullscreen, or start the experiment from its Home Screen icon.</p>',
      { name: 'fullscreen', keys: ['f', 'F'], tap: true });
    exp.fsPromise = requestFs();
  }
  exp.fsPromise = null;
  await waitLandscape(exp);
  applyCalibration(exp);
  const vp = exp.cal.viewport, warnings = [];
  if (vp.css_w !== Math.max(vp.screen_w, vp.screen_h)) warnings.push(`Warning: viewport ${vp.css_w} CSS px ≠ screen long side ${Math.max(vp.screen_w, vp.screen_h)} (not fullscreen, or browser zoom ≠ 100 %). The ruler check is the ground truth.`);
  if (vp.visual_viewport_scale && Math.abs(vp.visual_viewport_scale - 1) > 1e-3) warnings.push(`Warning: page is zoomed (visualViewport.scale ${vp.visual_viewport_scale}).`);
  let measuredMm = null, refresh = exp.session.display;
  const expected = exp.session.setup.expected_refresh_hz;
  const draw = () => { const lay = exp.stage.drawCalibration({ refresh }); if (exp.hooks) exp.hooks.G._calibLayout = lay; };
  let confirm;
  const confirmed = new Promise((r) => { confirm = r; });
  const panel = S.showCalibrationPanel({ requireRulerCheck: c.requireRulerCheck, rulerMm: c.rulerLengthCm * 10, warnings }, {
    recompute: (mm) => {
      const before = exp.session.setup.monitor_width_cm, after = before * mm / (c.rulerLengthCm * 10);
      exp.session.setup.monitor_width_cm = after;
      exp.session.calibration.recalibrations.push({ t_iso: new Date().toISOString(), measured_mm: mm, monitor_width_cm_before: before, monitor_width_cm_after: after });
      measuredMm = mm;
      applyCalibration(exp); draw();
    },
    confirm: (boxChecked, override) => confirm({ boxChecked, override }),
  });
  draw();
  if (!refresh) {
    refresh = await measureRefresh(180, 10, c.refreshMeasureMinMs);
    const warn = refreshWarnings(refresh, expected);
    exp.session.display = { ...refresh, expected_refresh_hz: expected, refresh_warnings: warn,
      refresh_matches_expected: Math.abs(refresh.refresh_hz_est - expected) / expected <= 0.05, setup_screen_estimate: exp.session.display_setup_estimate || null };
    delete exp.session.display_setup_estimate;
    exp.logEvent('refresh', exp.session.display);
  }
  draw();
  // A failed refresh check blocks "Calibration OK" unless the experimenter ticks the explicit override (logged).
  panel.status(refreshHtml(refresh, expected), true, refreshWarnings(refresh, expected).length > 0);
  const { boxChecked, override } = await confirmed;
  Object.assign(exp.session.calibration, { ruler_confirmed: boxChecked, ruler_measured_mm: measuredMm, refresh_override: override, calibrated_at_iso: new Date().toISOString() });
  exp.session.refresh_override = override;   // mirrored at session level so it is present in every payload
  if (override) exp.logEvent('refresh_override', { warnings: refreshWarnings(refresh, expected), refresh_hz_est: refresh.refresh_hz_est, expected_refresh_hz: expected });
  S.hide();
  exp.stage.clear();
}
