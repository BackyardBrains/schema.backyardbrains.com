// config.js — ALL tunable parameters of the in-lab Guterstam & Graziano (2020) Exp 2 replication.
// Nothing else in static/star-inperson/ hard-codes a parameter; change values here (or by ?key=value, which is
// logged and flagged, see params.js).
//
// Conventions
//   * Units are in the key names (Ms, Deg, Cm, DegPerSec, ...).
//   * Every leaf key is unique across groups, so ?<leafKey>=<value> overrides are unambiguous (test T1).
//   * Source tags: pN = page N of the 10-page PDF of Guterstam & Graziano (2020, Progress in Neurobiology 190:101797);
//     "April" = star_replication_technical_report.md; "Greg" = decision by Greg Gage;
//     "ours: <why>" = our own choice where the paper is silent.  Full list: docs/star-inperson/SPEC.md §1.3.

export const CONFIG = {
  meta: {
    experimentName: 'star-inperson',   // POST /data "experiment"; suffixed by mode in params.js (-grating/-pilot/-test)
    experimentVersion: '1.2.0',       // bump on ANY change to static/star-inperson/; 1.1.0 band blindfold; 1.2.0 fast dot drawing
  },

  display: {
    viewingDistanceCm: 54,            // cm, eye to screen centre. p2 "chinrest 54 cm" (setup-screen default)
    backgroundRgb: [128, 128, 128],   // 0-255 sRGB. p2 "neutral gray"; luminance unreported -> ours: mid-gray
    inkRgb: [0, 0, 0],                // 0-255 sRGB. p2 "black central fixation point", "black dots"
    requireFullscreen: true,          // bool. ours: the ppd calibration assumes the fullscreen width
    requireRulerCheck: true,          // bool. ours: experimenter must confirm the 10-cm ruler
    rulerLengthCm: 10,                // cm, calibration ruler length. ours
    ppdChangeTolerance: 0.005,        // fraction. ours: pause if ppd drifts > 0.5 % after calibration
    expectedRefreshHz: 120,           // Hz the rig must run at (setup field; 120 = iPad Pro ProMotion, 60 = typical LCD).
                                      // Greg 2026-09-29 (iPad rig): warn if measured != expected; all participants same rate
    refreshMeasureMinMs: 2000,        // ms. measure >= this long AND >= 180 intervals (SPEC §2.4; iPad rig: ~2 s)
    diagDurationMs: 10000,            // ms of continuous dots in ?diag=1 rig diagnostics (iPad rig, Greg 2026-09-29)
  },

  timing: {
    itiMinMs: 1000,                   // ms. p2 "variable 1 - 2 s"
    itiMaxMs: 2000,                   // ms. p2; distribution unstated -> ours: uniform continuous
    fixationMs: 1500,                 // ms. p2
    adaptorMs: 1500,                  // ms. p2, p4, p7
    responseWindowMs: 2000,           // ms. p2 "maximum 2 s"
    tooSlowMs: 5000,                  // ms. p2 "Too Slow!" for 5 s
    droppedFrameFactor: 1.5,          // x median frame interval. coordinator 2026-09-29: interval > 1.5 x median = dropped
  },

  fixation: {
    fixationDiameterDeg: 0.5,         // deg. p2 "black central fixation point (0.5 deg)"; removed at adaptor onset
  },

  rdk: {
    engine: 'guterstam2020',          // 'guterstam2020' (paper text literally) | 'shadlen' (Kiani/Shadlen 3 sets). SPEC §4
    apertureWidthDeg: 5,              // deg. p2 "central, 5 x 5 deg area"; no border (Arvid; April)
    apertureHeightDeg: 5,             // deg. p2
    densityDotsPerDeg2: 50,           // dots/deg^2 PER FRAME (guterstam2020). p2 literal -> 1250 dots/frame
    densityDotsPerDeg2PerSec: 50,     // dots/deg^2/s (shadlen only). Kiani/Shadlen unit (their usual 16.7)
    dotDiameterDeg: 0.05,             // deg. p2; drawn as squares (SPEC D8)
    dotSpeedDegPerSec: 1.4,           // deg/s. Decided by Greg Gage 2026-09-29 (Renet speed study). Paper p2: 2.0
    lifetimeMs: 200,                  // ms. p2 (guterstam2020 only)
    coherence: 0.40,                  // fraction. p2 "random for 60 % of dots and coherent for 40 %"
    shadlenSets: 3,                   // count (shadlen only). Kiani/Shadlen convention
  },

  geometry: {
    stimulusHeightDeg: 5.7,           // deg, head content height = tree content height. Fig 3 box height; Arvid
    innerEdgeDeg: 2.5,                // deg from the vertical midline to nose tip / tree edge. p7 (Exp 7), Fig 3
    gazeLineYDeg: 0,                  // deg. y of the head's pupil AND the aperture centre; fixation stays at (0,0)
    mirrorTreeWithSide: true,         // bool. ours: head-right display = exact mirror of head-left display
  },

  images: {                           // local byte copies of static/star/img files; SHA-256 verified at load (SPEC §3.4)
    // contentBox = [x0, y0, x1, y1) of opaque pixels (alpha > 32) in source px; eyePx = pupil centre (source px)
    face_open_R:      { file: 'img/face_open_R.png',      sha256: '00bc1ab62bdf578e7c3658fad8dc22e0888a225fdecbee403ac58e3a5ea320a8', contentBox: [78, 173, 1003, 1177], eyePx: [789, 487] },
    face_open_L:      { file: 'img/face_open_L.png',      sha256: '85ecb8c0675c4f9d497a2b7e0fa27b666d266736009450d3144c4412d6678be8', contentBox: [77, 173, 1002, 1177], eyePx: [290, 487] },
    face_blindfold_R: { file: 'img/face_blindfold_R.png', sha256: '2311cf6dfb908b4a9c736dbc4c30908756a6a28d189286136c976dc1d40465da', contentBox: [78, 173, 1003, 1177], eyePx: [789, 487] },
    face_blindfold_L: { file: 'img/face_blindfold_L.png', sha256: 'd24dfabd45b3441779aec64cdd87697bbcf3816e57fe902494dcb59c4e0e35f8', contentBox: [77, 173, 1002, 1177], eyePx: [290, 487] },
    tree:             { file: 'img/tree.png',             sha256: 'c88e8a312a93fdae64759316e45d844f349a6406e2b4ebc3bd1ce98fef28cf6b', contentBox: [31, 0, 1049, 1350] },
    blindfoldProbePx: { R: [700, 445], L: [379, 445] },  // source px inside the band blindfold, transparent in the open face (T19)
  },

  grating: {                          // adaptor 'grating' only (Exp 1 rig check), p2
    gratingPeriodDeg: 0.8,            // deg per cycle. p2
    gratingWidthDeg: 14.7,            // deg. p2
    gratingHeightDeg: 5.7,            // deg. p2
    gratingSpeedDegPerSec: 0.8,       // deg/s drift. p2
    gratingContrast: 1.0,             // Michelson. Unreported -> ours (SPEC D10)
  },

  design: {
    adaptor: 'face_tree',             // 'face_tree' | 'grating' (mode key; ?adaptor=grating is not flagged as an override)
    trialsPerCell: 30,                // trials per eyes x congruency cell. p4; must be even (face side 15/15)
    blockSize: 20,                    // completed main trials per block. p4 "6 blocks of 20"
    requeueTimeouts: true,            // bool. p2 "the same configuration of trial was automatically repeated later"
    maxTimeoutsPerSession: 40,        // count. ours: stop re-queueing after 40 timeouts (session.requeue_cap_hit)
  },

  practice: {
    practiceTrials: 10,               // trials per attempt. p2
    practicePassAccuracy: 0.80,       // fraction correct to pass. p2
    practiceMaxAttempts: 4,           // attempts. p2 "repeated up to four times"
  },

  keys: {
    keyLeft: 'ArrowLeft',             // KeyboardEvent.key. p2 "key presses" (key names lost in our scan, SPEC §11.5 Q9)
    keyRight: 'ArrowRight',
  },

  data: {
    dataUrl: '/data',                 // same-origin Flask endpoint (app.py receive_data)
    postTimeoutMs: 10000,             // ms per POST attempt (AbortController)
    postRetries: 3,                   // retries after the first attempt; backoff 1 s / 2 s / 4 s
    autoDownloadAtEnd: true,          // bool. local JSON download on every terminal save
    saveFrameIntervals: true,         // bool. per-trial dots frame-interval arrays
    maxPayloadBytes: 900000,          // bytes. nginx default client_max_body_size is 1 MB (SPEC §11.5 Q8)
  },
};

// Setup-screen monitor presets (lit image width, cm). The width field is empty unless a preset is picked.
// iPad Pro 12.9" (6th gen): 2732 px / 264 ppi = 10.35 in = 26.29 cm (Greg 2026-09-29).
export const MONITOR_PRESETS = [{ label: 'iPad Pro 12.9" (26.3 cm)', widthCm: 26.3 }];
export const INPUT_DEVICES = [['bt_keyboard', 'BT keyboard'], ['usb_keyboard', 'USB keyboard'], ['smart_connector_keyboard', 'Smart Connector keyboard']];

// ?pilot=1 applies this preset before URL overrides (~2 min session). Not an "override" (not flagged orange).
export const PILOT_PRESET = { trialsPerCell: 2, blockSize: 4, practiceTrials: 5 };

// Allowed values for string-enum keys, and numeric ranges [min, max] checked by params.js (fatal if violated).
export const ENUMS = {
  engine: ['guterstam2020', 'shadlen'],
  adaptor: ['face_tree', 'grating'],
};
export const RANGES = {
  viewingDistanceCm: [20, 200], rulerLengthCm: [1, 50], ppdChangeTolerance: [0, 0.5],
  expectedRefreshHz: [30, 240], refreshMeasureMinMs: [500, 20000], diagDurationMs: [500, 120000],
  itiMinMs: [1, 60000], itiMaxMs: [1, 60000], fixationMs: [1, 60000], adaptorMs: [1, 60000],
  responseWindowMs: [1, 60000], tooSlowMs: [1, 60000], droppedFrameFactor: [1, 10],
  fixationDiameterDeg: [0.01, 5], apertureWidthDeg: [0.1, 40], apertureHeightDeg: [0.1, 40],
  densityDotsPerDeg2: [0.01, 500], densityDotsPerDeg2PerSec: [0.01, 5000], dotDiameterDeg: [0.001, 2],
  dotSpeedDegPerSec: [0, 100], lifetimeMs: [1, 1e9], coherence: [0, 1], shadlenSets: [1, 10],
  stimulusHeightDeg: [0.1, 40], innerEdgeDeg: [0, 40], gazeLineYDeg: [-20, 20],
  gratingPeriodDeg: [0.01, 40], gratingWidthDeg: [0.1, 80], gratingHeightDeg: [0.1, 80],
  gratingSpeedDegPerSec: [0, 100], gratingContrast: [0, 1],
  trialsPerCell: [2, 1000], blockSize: [1, 10000], maxTimeoutsPerSession: [0, 10000],
  practiceTrials: [1, 1000], practicePassAccuracy: [1e-9, 1], practiceMaxAttempts: [1, 100],
  postTimeoutMs: [100, 600000], postRetries: [0, 10], maxPayloadBytes: [1000, 1e9],
  backgroundRgb: [0, 255], inkRgb: [0, 255],
};
// Keys that may never be changed from the URL (identity and stimulus integrity).
export const NOT_OVERRIDABLE = ['experimentName', 'experimentVersion', 'face_open_R', 'face_open_L',
  'face_blindfold_R', 'face_blindfold_L', 'tree', 'blindfoldProbePx'];
