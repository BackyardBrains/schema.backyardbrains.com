// calibration.js — pixels-per-degree math (pure, SPEC §2.2) + canvas sizing + refresh measurement (§2.4).
// The pure functions are imported by Node tests; the DOM helpers only touch the DOM when called.

const DEG = Math.PI / 180;

// Physical size of one degree of visual angle at the screen centre (cm).
export function cmPerDeg(viewingDistanceCm) {
  return 2 * viewingDistanceCm * Math.tan(0.5 * DEG);
}

// CSS pixels per degree for a lit image `monitorWidthCm` wide shown across `cssW` CSS px.
export function ppdCss(cssW, monitorWidthCm, viewingDistanceCm) {
  return (cssW / monitorWidthCm) * cmPerDeg(viewingDistanceCm);
}

// Everything the stage needs, from window metrics + setup entries (SPEC §2.2, exact formulas).
export function computeCalibration({ innerW, innerH, dpr, monitorWidthCm, viewingDistanceCm }) {
  const canvasW = Math.round(innerW * dpr);
  const canvasH = Math.round(innerH * dpr);
  const dprEff = canvasW / innerW;
  const pCss = ppdCss(innerW, monitorWidthCm, viewingDistanceCm);
  return {
    cmPerDeg: cmPerDeg(viewingDistanceCm),
    ppdCss: pCss,
    ppdDevice: pCss * dprEff,
    dprWindow: dpr,
    dprEff,
    innerW, innerH, canvasW, canvasH,
    monitorWidthCm, viewingDistanceCm,
  };
}

// Relative change of ppd between two calibrations.
export function ppdChange(a, b) { return Math.abs(b.ppdDevice - a.ppdDevice) / a.ppdDevice; }

// Statistics of rAF intervals (ms); first `discard` samples are dropped.
export function refreshStats(intervals, discard = 10) {
  const xs = intervals.slice(discard).filter((x) => Number.isFinite(x) && x > 0);
  if (xs.length === 0) return { refresh_median_interval_ms: 16.667, refresh_hz_est: 60, refresh_interval_sd_ms: NaN, refresh_samples_n: 0 };
  const sorted = [...xs].sort((p, q) => p - q);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, xs.length - 1));
  return {
    refresh_median_interval_ms: median,
    refresh_hz_est: 1000 / median,
    refresh_interval_sd_ms: sd,
    refresh_samples_n: xs.length,
  };
}

// Warnings for a refresh measurement (SPEC §2.4, amended for the iPad rig): too slow for the expected rate,
// unstable (SD > 2 ms, or > 15 % of the interval at high rates), or measured != expected (> 5 % apart).
export function refreshWarnings(stats, expectedHz = 60) {
  const w = [], hz = stats.refresh_hz_est, sd = stats.refresh_interval_sd_ms;
  const minHz = expectedHz >= 100 ? 110 : 58;
  if (!(hz >= minHz)) w.push(`refresh ${hz.toFixed(1)} Hz is below ${minHz} Hz`);
  if (!(sd <= Math.min(2, 0.15 * stats.refresh_median_interval_ms))) w.push(`frame timing unstable (SD ${Number(sd).toFixed(2)} ms): close other apps${expectedHz >= 100 ? '' : ', disable VRR'}`);
  if (Math.abs(hz - expectedHz) / expectedHz > 0.05) w.push(`measured ${hz.toFixed(1)} Hz ≠ expected ${expectedHz} Hz: all participants in a study must run at the same rate`);
  return w;
}
export function refreshWarning(stats, expectedHz = 60) { return refreshWarnings(stats, expectedHz).length > 0; }

// ---- DOM helpers (call only in the browser) ----

// Viewport metrics. The ppd width is the layout-viewport CSS width (documentElement.clientWidth), NOT
// screen.width (iPadOS Safari may report portrait screen dimensions in landscape). Everything is logged.
export function viewportMetrics() {
  const de = document.documentElement, vv = window.visualViewport;
  return {
    css_w: de.clientWidth || window.innerWidth, css_h: de.clientHeight || window.innerHeight,
    inner_w: window.innerWidth, inner_h: window.innerHeight,
    visual_viewport_w: vv ? vv.width : null, visual_viewport_h: vv ? vv.height : null, visual_viewport_scale: vv ? vv.scale : null,
    screen_w: screen.width, screen_h: screen.height, dpr: window.devicePixelRatio || 1,
  };
}

export function isLandscape() { const m = viewportMetrics(); return m.css_w >= m.css_h; }

// 'fullscreen-api' | 'standalone' (Home Screen web app / display-mode fullscreen) | 'browser'
export function displayMode() {
  if (document.fullscreenElement || document.webkitFullscreenElement) return 'fullscreen-api';
  const mm = (q) => window.matchMedia && window.matchMedia(q).matches;
  if (navigator.standalone === true || mm('(display-mode: fullscreen)')) return 'standalone';   // iOS Home Screen app
  return 'browser';
}
export function isFullscreen() { return displayMode() !== 'browser'; }

// requestFullscreen with the webkit prefix fallback (iPadOS Safari). Resolves true/false; never throws.
export function requestFs() {
  if (displayMode() === 'standalone') return Promise.resolve(true);
  const el = document.documentElement;
  try {
    if (el.requestFullscreen) return el.requestFullscreen().then(() => true, () => false);
    if (el.webkitRequestFullscreen) { el.webkitRequestFullscreen(); return new Promise((r) => setTimeout(() => r(isFullscreen()), 500)); }
  } catch (e) { /* fall through */ }
  return Promise.resolve(false);
}

export function measureWindow(setup) {
  const m = viewportMetrics();
  return {
    ...computeCalibration({
      innerW: m.css_w, innerH: m.css_h, dpr: m.dpr,
      monitorWidthCm: setup.monitor_width_cm, viewingDistanceCm: setup.viewing_distance_cm,
    }),
    viewport: m,
  };
}

export function sizeCanvas(canvas, cal) {
  canvas.style.width = cal.innerW + 'px';
  canvas.style.height = cal.innerH + 'px';
  if (canvas.width !== cal.canvasW) canvas.width = cal.canvasW;
  if (canvas.height !== cal.canvasH) canvas.height = cal.canvasH;
  // dprEff as actually realised by the backing store
  return { ...cal, dprEff: canvas.width / cal.innerW, ppdDevice: cal.ppdCss * (canvas.width / cal.innerW) };
}

// Record rAF intervals for at least `minMs` and at least `n` intervals (the first `discard` are dropped).
export function measureRefresh(n = 180, discard = 10, minMs = 2000, onFrame = null) {
  return new Promise((resolve) => {
    const intervals = [];
    let prev = null, t0 = null;
    function tick(ts) {
      if (prev !== null) intervals.push(ts - prev);
      if (t0 === null) t0 = ts;
      prev = ts;
      if (onFrame) onFrame(ts);
      if (intervals.length < n || ts - t0 < minMs) requestAnimationFrame(tick);
      else resolve(refreshStats(intervals, discard));
    }
    requestAnimationFrame(tick);
  });
}

// Resolves after the next resize (or after `timeoutMs`), whichever is first.
export function nextResize(timeoutMs = 1000) {
  return new Promise((resolve) => {
    const done = () => { window.removeEventListener('resize', done); window.removeEventListener('orientationchange', done); clearTimeout(t); resolve(); };
    const t = setTimeout(done, timeoutMs);
    window.addEventListener('resize', done);
    window.addEventListener('orientationchange', done);
  });
}
