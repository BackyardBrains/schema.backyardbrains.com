// adaptors.js — what is drawn between fixation and dots: head + tree, drifting grating, or nothing (practice).
// Layout math is pure (degrees; SPEC §1.5, §3.4) so tests and session.geometry use exactly what is drawn.

// Placement of the face and tree images for one side. Returns full-image rects in degrees
// ({leftDeg, topDeg, wDeg, hDeg}), content boxes, eye point and ids.
// Face on the left uses the right-looking image (_R); face on the right uses _L.
export function faceTreeLayout(cfg, faceSide, eyes = 'open') {
  const g = cfg.geometry, im = cfg.images;
  const suffix = faceSide === 'left' ? 'R' : 'L';
  const faceId = `face_${eyes}_${suffix}`;
  const f = im[faceId], t = im.tree;
  const [fx0, fy0, fx1, fy1] = f.contentBox;
  const s = g.stimulusHeightDeg / (fy1 - fy0);                  // deg per face source px
  const eyeX = f.eyePx[0] + 0.5, eyeY = f.eyePx[1] + 0.5;       // pupil centre (pixel centre)
  const NW = 1080, NH = 1350;                                   // source canvas size (verified at load)
  const top = g.gazeLineYDeg + eyeY * s;                        // full-image top edge
  const faceLeft = faceSide === 'left' ? -g.innerEdgeDeg - fx1 * s : g.innerEdgeDeg - fx0 * s;
  const face = { leftDeg: faceLeft, topDeg: top, wDeg: NW * s, hDeg: NH * s };
  const headBox = [faceLeft + fx0 * s, faceLeft + fx1 * s, top - fy1 * s, top - fy0 * s];   // [x0, x1, y0, y1]
  const eye = [faceLeft + eyeX * s, g.gazeLineYDeg];

  const [tx0, ty0, tx1, ty1] = t.contentBox;
  const st = g.stimulusHeightDeg / (ty1 - ty0);
  const contentTop = headBox[3];
  const treeTop = contentTop + ty0 * st;
  const mirrored = faceSide === 'right' && g.mirrorTreeWithSide;
  let treeLeft;
  if (faceSide === 'left') treeLeft = g.innerEdgeDeg - tx0 * st;                  // content left edge at +innerEdge
  else if (mirrored) treeLeft = -g.innerEdgeDeg - (NW - tx0) * st;               // mirrored content right edge at -innerEdge
  else treeLeft = -g.innerEdgeDeg - tx1 * st;
  const tree = { leftDeg: treeLeft, topDeg: treeTop, wDeg: NW * st, hDeg: NH * st };
  const cx0 = mirrored ? treeLeft + (NW - tx1) * st : treeLeft + tx0 * st;
  const cx1 = mirrored ? treeLeft + (NW - tx0) * st : treeLeft + tx1 * st;
  const treeBox = [cx0, cx1, contentTop - (ty1 - ty0) * st, contentTop];
  return { faceId, face, tree, treeMirrored: mirrored, headBox, treeBox, eye, scaleFace: s, scaleTree: st };
}

// Blindfold probe point (SPEC §3.3 blindfoldProbePx) in degrees for a face side.
export function probeDeg(cfg, faceSide) {
  const lay = faceTreeLayout(cfg, faceSide, 'blindfold');
  const p = cfg.images.blindfoldProbePx[faceSide === 'left' ? 'R' : 'L'];
  return [lay.face.leftDeg + (p[0] + 0.5) * lay.scaleFace, lay.face.topDeg - (p[1] + 0.5) * lay.scaleFace];
}

const r4 = (x) => Math.round(x * 10000) / 10000;

// session.geometry (per side), computed from the same math that positions the drawing.
export function geometryReport(cfg) {
  const g = cfg.geometry, k = cfg.rdk;
  const aperture = [-k.apertureWidthDeg / 2, k.apertureWidthDeg / 2,
    g.gazeLineYDeg - k.apertureHeightDeg / 2, g.gazeLineYDeg + k.apertureHeightDeg / 2];
  const out = {};
  for (const side of ['left', 'right']) {
    const L = faceTreeLayout(cfg, side, 'open');
    const apCentreY = (aperture[2] + aperture[3]) / 2;
    out[side] = {
      aperture_deg: aperture.map(r4),
      head_box_deg: L.headBox.map(r4),
      tree_box_deg: L.treeBox.map(r4),
      eye_point_deg: L.eye.map(r4),
      gaze_line_y_deg: g.gazeLineYDeg,
      gaze_line_through_aperture_centre: Math.abs(L.eye[1] - apCentreY) < 1e-9,
      tree_mirrored: L.treeMirrored,
    };
  }
  return out;
}

// Pre-render every head/tree image at the current calibration (called after each calibration, never in a trial).
export function prerenderFaceTree(stage) {
  for (const side of ['left', 'right']) {
    for (const eyes of ['open', 'blindfold']) {
      const L = faceTreeLayout(stage.cfg, side, eyes);
      stage.prerender(L.faceId, `${L.faceId}|${side}`, L.face, false);
      stage.prerender('tree', `tree|${side}`, L.tree, L.treeMirrored);
    }
  }
}

// Draw head + tree for one frame. Returns the image ids actually drawn (for adaptor_images_drawn).
// Layouts and id lists are cached on the stage (degrees only; no per-frame allocation in the trial loop).
export function drawFaceTree(stage, trial) {
  const k = `${trial.face_side}|${trial.eyes_condition}`;
  const cache = (stage._faceTree ||= {});
  const c = cache[k] || (cache[k] = (() => {
    const L = faceTreeLayout(stage.cfg, trial.face_side, trial.eyes_condition);
    return { L, ids: [L.faceId, 'tree'], faceKey: `${L.faceId}|${trial.face_side}`, treeKey: `tree|${trial.face_side}` };
  })());
  stage.drawImageRect(c.L.faceId, c.faceKey, c.L.face, false);
  stage.drawImageRect('tree', c.treeKey, c.L.tree, c.L.treeMirrored);
  return c.ids;
}

// Drifting sinusoidal grating (SPEC §4.4). tSec = time since adaptor onset.
// One RGBA row is computed across the device width, then stretched vertically without smoothing.
export function drawGrating(stage, trial, tSec) {
  const cfg = stage.cfg, gr = cfg.grating, g = cfg.geometry.gazeLineYDeg;
  const x0 = Math.round(stage.X(-gr.gratingWidthDeg / 2)), x1 = Math.round(stage.X(gr.gratingWidthDeg / 2));
  const y0 = Math.round(stage.Y(g + gr.gratingHeightDeg / 2)), y1 = Math.round(stage.Y(g - gr.gratingHeightDeg / 2));
  const w = x1 - x0, h = y1 - y0;
  if (!stage._gratingRow || stage._gratingRow.width !== w) {
    stage._gratingRow = document.createElement('canvas');
    stage._gratingRow.width = w; stage._gratingRow.height = 1;
    stage._gratingCtx = stage._gratingRow.getContext('2d');
    stage._gratingImg = stage._gratingCtx.createImageData(w, 1);
  }
  const data = stage._gratingImg.data, bg = cfg.display.backgroundRgb;
  const sign = trial.grating_direction === 'right' ? 1 : -1;
  const shift = sign * gr.gratingSpeedDegPerSec * tSec, cx = stage.X(0), p = stage.ppd;
  const k = (2 * Math.PI) / gr.gratingPeriodDeg, C = gr.gratingContrast, ph = trial.grating_phase0;
  for (let c = 0; c < w; c++) {
    const xDeg = (x0 + c + 0.5 - cx) / p;
    const m = 1 + C * Math.sin(k * (xDeg - shift) + ph);
    for (let ch = 0; ch < 3; ch++) data[4 * c + ch] = Math.max(0, Math.min(255, Math.round(bg[ch] * m)));
    data[4 * c + 3] = 255;
  }
  (stage._gratingCtx ||= stage._gratingRow.getContext('2d')).putImageData(stage._gratingImg, 0, 0);
  const ctx = stage.ctx;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(stage._gratingRow, x0, y0, w, h);
  ctx.imageSmoothingEnabled = true;
  return GRATING_IDS;
}
const GRATING_IDS = ['grating'];
