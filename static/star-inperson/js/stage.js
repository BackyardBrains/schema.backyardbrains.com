// stage.js — the one stimulus canvas (#stage). All drawing in device pixels via X(xDeg)/Y(yDeg) (SPEC §2.2);
// verified image loading (§3.4); exact-size image prerender; dots (§4.3); calibration check screen (§2.3).

const rgb = (a) => `rgb(${a[0]},${a[1]},${a[2]})`;

export async function sha256Hex(buffer) {
  const d = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class Stage {
  constructor(canvas, cfg) {
    this.canvas = canvas;
    this.cfg = cfg;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.bg = rgb(cfg.display.backgroundRgb);
    this.ink = rgb(cfg.display.inkRgb);
    this.bitmaps = {};      // id -> ImageBitmap
    this.imageInfo = [];    // session.images
    this.prerendered = {};  // key -> {canvas, x, y}
    this.cal = null;
  }

  // Fetch, SHA-256-verify and decode every stimulus image. Throws (fatal) on any failure; no fallback.
  async loadImages() {
    for (const [id, spec] of Object.entries(this.cfg.images)) {
      if (!spec.file) continue;
      let hex = null;
      try {
        const res = await fetch(spec.file, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        hex = await sha256Hex(await blob.arrayBuffer());
        if (hex !== spec.sha256) throw new Error(`sha256 ${hex} != expected ${spec.sha256}`);
        const bmp = await createImageBitmap(blob);
        this.bitmaps[id] = bmp;
        this.imageInfo.push({ id, file: spec.file, sha256: hex, natural_w: bmp.width, natural_h: bmp.height, verified: true });
      } catch (e) {
        throw new Error(`Stimulus image failed to load/verify: ${spec.file} (${e.message})`);
      }
    }
  }

  setCalibration(cal) {
    this.cal = cal;
    this.prerendered = {};
  }

  get ppd() { return this.cal.ppdDevice; }
  X(xDeg) { return this.canvas.width / 2 + xDeg * this.cal.ppdDevice; }
  Y(yDeg) { return this.canvas.height / 2 - yDeg * this.cal.ppdDevice; }

  clear() {
    this.ctx.fillStyle = this.bg;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  drawFixation() {
    const c = this.ctx;
    c.fillStyle = this.ink;
    c.beginPath();
    c.arc(this.X(0), this.Y(0), (this.cfg.fixation.fixationDiameterDeg / 2) * this.ppd, 0, 2 * Math.PI);
    c.fill();
  }

  dotSizePx() { return Math.max(1, Math.round(this.cfg.rdk.dotDiameterDeg * this.ppd)); }

  // Clear only the dot aperture (+ one dot of margin). Used on dots frames after the first, which clears the whole
  // screen: on the iPad Pro this (with fillRect dots) holds 120 Hz; full-screen path fills ran at ~59 Hz (bench.html).
  clearAperture() {
    const r = this.cfg.rdk, m = this.dotSizePx() + 1, p = this.ppd;
    const x0 = Math.floor(this.X(-r.apertureWidthDeg / 2) - m), y0 = Math.floor(this.Y(this.cfg.geometry.gazeLineYDeg + r.apertureHeightDeg / 2) - m);
    this.ctx.fillStyle = this.bg;
    this.ctx.fillRect(x0, y0, Math.ceil(r.apertureWidthDeg * p + 2 * m), Math.ceil(r.apertureHeightDeg * p + 2 * m));
  }

  // f: engine frame {n, xs, ys} in deg relative to the aperture centre (0, gazeLineYDeg).
  // One fillRect per dot: a single path of 1,250 rects rasterised at ~59 Hz in iPad Safari (bench.html, 2026-10-02).
  drawDots(f) {
    const c = this.ctx, s = this.dotSizePx(), h = s / 2;
    const cx = this.X(0), cy = this.Y(this.cfg.geometry.gazeLineYDeg), p = this.ppd;
    c.fillStyle = this.ink;
    for (let i = 0; i < f.n; i++) {
      c.fillRect(Math.round(cx + f.xs[i] * p - h), Math.round(cy - f.ys[i] * p - h), s, s);
    }
  }

  // Draw image `id` whose full source canvas occupies rect (leftDeg, topDeg, wDeg, hDeg); optionally mirrored.
  // Pre-rendered once per calibration at exact device size incl. the sub-pixel offset, then blitted at integers.
  drawImageRect(id, key, rect, mirrored) {
    const pr = this.prerender(id, key, rect, mirrored);
    this.ctx.drawImage(pr.canvas, pr.x, pr.y);
  }

  prerender(id, key, rect, mirrored) {
    let pr = this.prerendered[key];
    if (pr) return pr;
    const x = this.X(rect.leftDeg), y = this.Y(rect.topDeg);
    const w = rect.wDeg * this.ppd, h = rect.hDeg * this.ppd;
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const off = document.createElement('canvas');
    off.width = Math.ceil(fx + w); off.height = Math.ceil(fy + h);
    const oc = off.getContext('2d');
    oc.imageSmoothingEnabled = true;
    oc.imageSmoothingQuality = 'high';
    if (mirrored) { oc.translate(off.width, 0); oc.scale(-1, 1); }
    oc.drawImage(this.bitmaps[id], mirrored ? off.width - fx - w : fx, fy, w, h);
    pr = this.prerendered[key] = { canvas: off, x: ix, y: iy };
    return pr;
  }

  // Centered text with the cap height of "T" = capDeg degrees (e.g. "Too Slow!", 1 deg).
  drawText(str, capDeg = 1, yDeg = 0) {
    const c = this.ctx, key = `${capDeg}|${this.ppd}`;
    if (this._fontKey !== key) {              // measured once per size (no per-frame text measurement)
      c.font = '100px Arial, Helvetica, sans-serif';
      const asc = c.measureText('T').actualBoundingBoxAscent || 71.6;
      this._font = `${(100 * capDeg * this.ppd) / asc}px Arial, Helvetica, sans-serif`;
      this._fontKey = key;
    }
    c.font = this._font;
    c.fillStyle = this.ink;
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.fillText(str, this.X(0), this.Y(yDeg) + (capDeg * this.ppd) / 2);
  }

  // ---- Calibration check screen (SPEC §2.3). Returns layout (device px) for tests. ----
  drawCalibration(info) {
    const c = this.ctx, cal = this.cal, W = this.canvas.width, H = this.canvas.height;
    const pxPerCm = (cal.innerW / cal.monitorWidthCm) * cal.dprEff;   // device px per cm
    const fs = Math.round(15 * cal.dprEff);
    this.clear();
    c.fillStyle = this.ink; c.strokeStyle = this.ink;
    c.font = `${fs}px Arial, Helvetica, sans-serif`; c.textBaseline = 'alphabetic';

    // 1. Ruler: bar of rulerLengthCm, 1-cm major and 1-mm minor ticks above it.
    const L = this.cfg.display.rulerLengthCm * pxPerCm;
    const x0 = Math.round(W / 2 - L / 2), len = Math.round(L), x1 = x0 + len;
    const barH = Math.max(3, Math.round(0.1 * pxPerCm)), barY = Math.round(H * 0.16);
    c.fillRect(x0, barY, len, barH);
    const tw = Math.max(1, Math.round(cal.dprEff));
    const nMm = Math.round(this.cfg.display.rulerLengthCm * 10);
    for (let mm = 0; mm <= nMm; mm++) {
      const th = Math.round((mm % 10 === 0 ? 0.6 : mm % 5 === 0 ? 0.4 : 0.25) * pxPerCm);
      const tx = Math.min(x1 - tw, x0 + Math.round((mm / 10) * pxPerCm));
      c.fillRect(tx, barY - th, tw, th);
    }
    c.textAlign = 'center';
    c.fillText(`Hold a ruler here: this bar must measure ${nMm} mm`, W / 2, barY - 0.9 * pxPerCm);

    // 3. The 5-deg aperture, outlined at its true position (inside edge = aperture edge).
    const lw = Math.max(1, Math.round(cal.dprEff));
    const g = this.cfg.geometry.gazeLineYDeg, aw = this.cfg.rdk.apertureWidthDeg, ah = this.cfg.rdk.apertureHeightDeg;
    const ax0 = Math.round(this.X(-aw / 2)), ax1 = Math.round(this.X(aw / 2));
    const ay0 = Math.round(this.Y(g + ah / 2)), ay1 = Math.round(this.Y(g - ah / 2));
    c.lineWidth = lw;
    c.strokeRect(ax0 - lw / 2, ay0 - lw / 2, ax1 - ax0 + lw, ay1 - ay0 + lw);
    c.fillText(`Dot area: ${aw}° = ${(aw * cal.cmPerDeg).toFixed(2)} cm wide`, (ax0 + ax1) / 2, ay1 + 0.6 * pxPerCm);

    // 2. ID-1 card outline (85.60 x 53.98 mm), stroke inside the box. Anchored to the right edge so it never
    //    overlaps the aperture, even on a 26-cm iPad screen (card = 1/3 of the width); else below the readouts.
    const cw = 8.56 * pxPerCm, ch = 5.398 * pxPerCm, gap = Math.round(0.4 * pxPerCm);
    let cx0 = Math.round(W - Math.max(gap, W * 0.02) - cw), cy0 = Math.round(H * 0.5 - ch / 2);
    if (cx0 < ax1 + gap) { cx0 = Math.round(W * 0.03); cy0 = Math.round(H * 0.3 + 7 * fs * 1.6); }
    c.strokeRect(cx0 + lw / 2, cy0 + lw / 2, Math.round(cw) - lw, Math.round(ch) - lw);
    c.fillText('A bank/ID card should exactly cover this box', cx0 + cw / 2, cy0 - 0.3 * pxPerCm);
    const cardBox = [cx0, cy0, cx0 + Math.round(cw), cy0 + Math.round(ch)];

    // 4. Readouts.
    c.textAlign = 'left';
    const lines = [
      `ppd (CSS px/deg): ${cal.ppdCss.toFixed(3)}    ppd (device px/deg): ${cal.ppdDevice.toFixed(3)}`,
      `devicePixelRatio: ${cal.dprWindow}   effective: ${cal.dprEff.toFixed(4)}`,
      `window (CSS px): ${cal.innerW} x ${cal.innerH}    screen: ${screen.width} x ${screen.height}`,
      `canvas (device px): ${W} x ${H}`,
      `monitor width: ${cal.monitorWidthCm} cm   viewing distance: ${cal.viewingDistanceCm} cm   1° = ${cal.cmPerDeg.toFixed(4)} cm`,
      info.refresh ? `refresh: ${info.refresh.refresh_hz_est.toFixed(2)} Hz (median ${info.refresh.refresh_median_interval_ms.toFixed(2)} ms, SD ${info.refresh.refresh_interval_sd_ms.toFixed(2)} ms, n=${info.refresh.refresh_samples_n})` : 'refresh: measuring…',
    ];
    lines.forEach((t, i) => c.fillText(t, Math.round(W * 0.03), Math.round(H * 0.3) + i * fs * 1.6));
    return { rulerRowY: barY + (barH >> 1), rulerX0: x0, rulerX1: x1, pxPerCm, cardBox, apertureBox: [ax0, ay0, ax1, ay1] };
  }
}
