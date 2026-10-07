# SPEC: In-lab Guterstam & Graziano (2020) Exp 2 replication (`static/star-inperson/`)

Status: implementation spec, v1.0, 2026-09-29. Owner: Greg Gage. Author: Claude (spec only).
Audience: (1) the engineer who builds `static/star-inperson/`, the analysis script and the tests; (2) the model that
verifies the build against this document. Everything marked **MUST** is checked by an acceptance test in §10.

Read with: `docs/star-inperson/BRIEF.md` (why), this file (what, exactly). Where this spec and the BRIEF disagree,
this spec wins; disagreements are listed in §11.3.

Contents
1. Scientific design (parameters with sources, deviations from the paper)
2. Lab setup and calibration
3. Architecture and file tree
4. Dot engines (RDK) and the grating adaptor
5. Trial flow, timing, trial list, practice
6. Participant-facing text
7. Data: trial fields, session fields, saves, dedupe
8. Analysis script
9. Power and stopping rule
10. Acceptance tests (automated + manual)
11. Sources, decisions, deviations, open questions, disagreements with the BRIEF
12. Bugs in v1.11 and how this build fixes them

---

## 0. Decisions already made (do not re-open in the build)

| Decision | Value | Who / when |
|---|---|---|
| Dot speed default | **1.4 °/s** (paper Exp 2 used 2.0 °/s; 2.0 is one config/URL change away) | **Decided by Greg Gage 2026-09-29** |
| Instruction framing | **Neutral, paper-faithful**: "the head and tree are irrelevant; report dot direction". No Bob story. No `framing` switch is built. | **Decided by Greg Gage 2026-09-29** |
| Catch trials | **None.** No catch-trial code is built. | **Decided by Greg Gage 2026-09-29** |
| Conditions | Eyes open vs blindfold, head always facing the tree. No face-away condition. | BRIEF / April report |
| Trials | 120 = 30 per cell (open/blindfold x congruent/incongruent), blocks of 20 | Paper p. 4 |
| Default RDK algorithm | `guterstam2020` (plain per-frame dots, paper text literally); `shadlen` available by config | Coordinator 2026-09-29 (§11.1) |

---

## 1. Scientific design

### 1.1 Question and hypotheses

A static line drawing of a head gazing at a tree, shown for 1.5 s, is followed by random-dot motion (RDK).
Congruent = dots move in the head→tree direction. ΔRT = mean RT(congruent) − mean RT(incongruent), per
participant, correct trials only.

- **H1 (primary):** ΔRT_open > 0. Paper: +22 ms, SE 8, t23 = 2.89, p = .008 (p. 4, "congruent RT = 751 ms;
  incongruent RT = 729 ms").
- **H2:** ΔRT_blindfold ≈ 0. Paper: −3 ms, SE 8, t23 = −0.43, p = .670 (p. 4). (A non-significant result is not
  evidence of absence; report it with its CI.)
- **H3 (key secondary):** ΔRT_open − ΔRT_blindfold > 0. The paper did not test this contrast within Exp 2; its
  meta-analysis did (p. 7: 23 vs −1 ms, t47 = 2.29, p = .026).

### 1.2 Design

Within subject, 2 (eyes: open, blindfold) x 2 (congruent, incongruent), 30 trials per cell, 120 trials, 6 blocks
of 20, all trial types intermixed in one random order (p. 2: "All trial types were balanced and presented in a
random order"; p. 4: "120 trials in 6 blocks of 20 trials each, thus 30 trials per condition"). Within each cell,
head side is counterbalanced: 15 head-left (facing right) and 15 head-right (facing left) (p. 4, Fig. 1B caption).

### 1.3 Parameter table

Page numbers refer to the 10-page PDF `/root/claude/sa-star/papers/Guterstam_behavioral_2020.pdf`
(journal pagination differs; "p. 2" = PDF page 2). "April" = `/root/claude/sa-star/results/star_replication_technical_report.md`.
"Apr-27" = `talk_build/cache/beams/starfield_followup.txt`. Correspondence sources are in §11.1.

| Parameter (config key) | Value | Source |
|---|---|---|
| Viewing distance `viewingDistanceCm` | 54 cm (setup-screen default, editable) | p. 2 "chinrest 54 cm" |
| Monitor width `monitorWidthCm` | entered per rig, no default | our rig; paper 38 cm CRT, 1600x1200, 80 Hz (p. 2) |
| Background `backgroundRgb` | [128,128,128] | p. 2 "neutral gray field", "gray background"; p. 7 says "light gray". Luminance not reported → our choice, see §11.4 |
| Ink colour `inkRgb` | [0,0,0] | p. 2 "black central fixation point", "black dots" |
| ITI `itiMinMs`/`itiMaxMs` | 1000 / 2000, uniform continuous | p. 2 "variable 1 – 2 s"; distribution unspecified → uniform (our choice) |
| Fixation `fixationMs` | 1500 | p. 2 |
| Fixation diameter `fixationDiameterDeg` | 0.5° black disc at screen centre; removed at adaptor onset | p. 2 "the point disappeared" |
| Adaptor `adaptorMs` | 1500 | p. 2, p. 4, p. 7 |
| Response window `responseWindowMs` | 2000 | p. 2 |
| Too-slow screen `tooSlowMs` | 5000, text "Too Slow!" | p. 2 |
| Trial re-queue `requeueTimeouts` | true | p. 2 "the same configuration of trial was automatically repeated later" |
| Aperture `apertureWidthDeg`/`apertureHeightDeg` | 5 x 5°, square, no border | p. 2 "central, 5° x 5° area"; no frame (Arvid, §11.1; April) |
| Dot density `densityDotsPerDeg2` (guterstam2020) | 50 dots/deg² **per frame** → 1250 dots per frame | p. 2 "50 dots per square visual degree"; Renet 2026-04-28 same words. Unit ambiguity → §11.5 Q1 |
| Dot density `densityDotsPerDeg2PerSec` (shadlen) | 50 dots/deg²/s (Shadlen typical 16.7) | Kiani/Shadlen convention, §11.1 |
| Dot diameter `dotDiameterDeg` | 0.05° | p. 2 |
| Dot speed `dotSpeedDegPerSec` | **1.4 °/s** | **Decided by Greg Gage 2026-09-29** (KI speed finding, Renet §11.1; Apr-27 §10). Paper: 2 °/s (p. 2) |
| Dot lifetime `lifetimeMs` (guterstam2020) | 200 ms | p. 2 |
| Coherence `coherence` | 0.40 | p. 2 "random for 60 % of dots and coherent for 40 %"; Renet |
| Shadlen sets `shadlenSets` (shadlen only) | 3 | Kiani/Shadlen convention |
| Head/tree height `stimulusHeightDeg` | 5.7° (both; heights equal) | Fig. 3 boxes are 5.7° tall (measured, §1.5); equals Exp 1 grating height (p. 2); Arvid "tree height = head height" |
| Inner edge `innerEdgeDeg` | 2.5° from vertical midline (nose tip / tree edge) | p. 7 (Exp 7: "same visual eccentricity (2.5° from display midline) as the face stimulus in experiment 2"); Fig. 3 |
| Gaze line `gazeLineYDeg` | 0° (eye, aperture centre and fixation on one horizontal line) | Renet alternative; coordinator default. §1.5 |
| Mirror tree with side `mirrorTreeWithSide` | true (head-right display is the exact mirror of head-left) | our choice: makes face-side counterbalancing a pure mirror |
| Trials per cell `trialsPerCell` | 30 (must be even) | p. 4 |
| Block size `blockSize` | 20 completed trials | p. 4 |
| Practice `practiceTrials` | 10, dots only (blank adaptor interval), summary accuracy feedback after the 10 | p. 2 "practice session consisting of 10 trials, after which feedback regarding performance accuracy was displayed" |
| Practice pass `practicePassAccuracy` | 0.80 | p. 2 |
| Practice attempts `practiceMaxAttempts` | 4 | p. 2 "repeated up to four times" |
| Response keys | ArrowLeft / ArrowRight | p. 2 "key presses on a standard keyboard"; key names lost at a page break in our scan (§11.5 Q9) |
| Accuracy exclusion | permutation test vs 50 %, 10,000 iterations, exclude if p ≥ .05 | p. 2 |
| RT trial filter | correct & RT > 200 ms & not timed out | April pipeline (`schema_analysis/star/load.py`); the paper does not state an RT floor |
| Awareness questionnaire | purpose guess; explicit awareness of head/tree influence | p. 4 |
| Grating adaptor (Exp 1 rig check) | sinusoid, period 0.8°, 14.7° x 5.7°, drift 0.8 °/s L/R, 1.5 s; 60 trials, 30 per congruency | p. 2; Exp 1 ΔRT = +57 ms (p. 3) |

### 1.4 Deliberate differences from the paper, and how we compensate

| # | Paper | This build | Compensation / logging |
|---|---|---|---|
| D1 | EyeLink 1000 Plus eye tracking (p. 2) | No eye tracker | Instruct fixation (paper wording). Experimenter rates fixation compliance at the end (`experimenter_fixation_rating`). The paper did **not** exclude on eye data; Fig. 3 shows 93–95 % of dot-phase gaze in the dot field and no open/covered difference (p. 4), so the tracker was a post-hoc check. |
| D2 | 80 Hz CRT, 1600x1200, 38 cm (p. 2) | LCD at whatever refresh the rig has (≥ 60 Hz required) | Refresh measured at setup (`refresh_hz_est`), every frame interval logged during dots, dropped frames flagged per trial and analysed with/without (§8). LCD pixel response adds some motion smear; record `monitor_model`. Onset quantisation (16.7 ms at 60 Hz vs 12.5 ms at 80 Hz) is random with respect to condition, so it adds variance, not bias. VRR/ProMotion/G-Sync must be off (§10.2). |
| D3 | MATLAB + Psychtoolbox | Chrome, one `<canvas>`, `requestAnimationFrame` | RT zero = rAF timestamp of the first frame on which dots are drawn; key time = `KeyboardEvent.timeStamp` (same `performance.now()` timebase). Onset latency and actual phase durations logged per trial. |
| D4 | 2 °/s | **1.4 °/s** (Greg 2026-09-29) | `dotSpeedDegPerSec` override to 2.0 by URL for a paper-literal run; the effective value is in every payload. Pre-register the speed. |
| D5 | Head's eye height relative to fixation not reported | Eye (pupil centre) placed on the horizontal line through fixation and aperture centre (`gazeLineYDeg = 0`) | Geometry logged (`geometry` block in session). Paper's Fig. 3 head/tree boxes span y ≈ −3.2…+2.5°; ours span −3.92…+1.78° (0.7° lower) because we anchor the eye, not the box. §11.5 Q3. |
| D6 | The authors' head/tree drawings | Our BYB line-drawing head (`BlankFaceLooking*`) and silhouette tree (`Tree.png`) | Pair chosen so open and blindfold images differ **only** by the blindfold (verified pixel-exactly, §3.4). Ask Arvid for the originals (§11.5 Q4). |
| D7 | Practice content unspecified | Practice = fixation → dots on the next frame (no head/tree, no blank; `practiceBlankMs` 0 since v1.3.0, was a 1.5 s blank) | No pre-exposure to the adaptor. Our choice. |
| D8 | Dots presumably round | Square dots, side = round(0.05° x ppd_device) device px, min 1 | At 1.5–4 device px a square and a disc are indistinguishable. Logged `dot_size_device_px`. |
| D9 | Re-queue position unspecified | Re-queued config inserted at a random later position in the remaining queue (never immediately next when ≥ 1 other trial remains) | `requeued_from` logged. |
| D10 | Background luminance / grating contrast unreported | mid-gray 128; grating Michelson contrast 1.0 | §11.5 Q5. |
| D11 | Chinrest | Chinrest strongly recommended; if absent, fixed chair + tape mark. At 54 cm, ±5 cm head movement = ±9 % error in every size and speed | `chinrest_used` logged; analysis prints it. |
| D12 | Darkened, quiet room (p. 2) | Same (instruction to experimenter) | `room_dark` checkbox logged. |

### 1.5 Geometry (degrees; origin = screen centre = fixation; +x right, +y up)

Measured from Fig. 3 (PDF p. 5) by pixel analysis of the red dashed boxes (40 px/° horizontally, 35.5 px/°
vertically in the 200-dpi render): dot field x −2.5…+2.5, y −2.5…+2.5; head box x −7.6…−2.5; tree box
x +2.5…+7.0; head and tree boxes y −3.2…+2.5 (5.7° tall, top-aligned with the dot field). Head+tree span
14.6 x 5.7°, i.e. the Exp 1 grating's 14.7 x 5.7° footprint.

This build (defaults `stimulusHeightDeg 5.7`, `innerEdgeDeg 2.5`, `gazeLineYDeg 0`), head on the left:

| Element | x range (°) | y range (°) | Notes |
|---|---|---|---|
| Fixation disc | centre (0,0), Ø 0.5 | | fixation phase only |
| Aperture | −2.5…+2.5 | gazeLineY ± 2.5 = −2.5…+2.5 | aperture centre is on the gaze line by construction (**MUST**) |
| Head content box | −7.751…−2.500 | −3.917…+1.783 | nose tip at x = −2.5 |
| Eye point (pupil centre) | −3.715 | 0.000 | = gazeLineY |
| Tree content box | +2.500…+6.798 | −3.917…+1.783 | same top/bottom as head (heights equal) |

Head on the right: mirror in x. The gaze line (horizontal through the pupil) hits the tree 31 % down from its top
(in the branches). The build computes these from `images.*.contentBox` / `eyePx` (§3.4) and logs them in
`session.geometry`; the numbers above are the expected values for tests (§10, T18).

---

## 2. Lab setup and calibration

### 2.1 Setup screen (experimenter; DOM form in `index.html`)

Fields (all logged in `session.setup`):

| Field | id | Type / validation | Default |
|---|---|---|---|
| Participant ID | `participant_id` | required, `^[A-Za-z0-9_-]{1,32}$` | from `?pid=` if present |
| Experimenter initials | `experimenter` | optional, ≤ 8 chars | "" |
| Visible screen width (cm) | `monitor_width_cm` | required, number 10–200, 0.1 resolution. Label: "Width of the lit image area, edge to edge, not the bezel" | none (remembered in localStorage per browser as a convenience; value still shown for confirmation) |
| Viewing distance (cm) | `viewing_distance_cm` | required, 20–200 | 54 |
| Chinrest used | `chinrest_used` | checkbox | checked |
| Room darkened | `room_dark` | checkbox | checked |
| Monitor model / notes | `monitor_model` | optional text ≤ 200 | "" |

The setup screen also shows: `experimentVersion`, the first 12 hex of `code_fingerprint` (§3.5), the resolved
experiment name, the seed, and an **orange banner** listing every non-default parameter (§3.3) or a **blue
banner** "PILOT MODE" / "GRATING RIG-CHECK MODE". Button: **"Enter fullscreen and check calibration"**.

### 2.2 Pixels per degree (exact formulas)

Computed only while in fullscreen (`document.fullscreenElement` set), after the `resize` that follows entering it:

```
cssW           = window.innerWidth                // CSS px; in fullscreen this is the full screen width
cmPerDeg       = 2 * viewing_distance_cm * tan(0.5 deg)       // 0.94249 cm at 54 cm
ppdCss         = (cssW / monitor_width_cm) * cmPerDeg
canvas.style.width  = cssW + 'px';  canvas.style.height = innerHeight + 'px'
canvas.width   = round(cssW * devicePixelRatio);  canvas.height = round(innerHeight * devicePixelRatio)
dprEff         = canvas.width / cssW                // actual backing-store ratio (handles 1.25, 1.5, 2 …)
ppdDevice      = ppdCss * dprEff
X_dev(xDeg)    = canvas.width/2  + xDeg * ppdDevice
Y_dev(yDeg)    = canvas.height/2 - yDeg * ppdDevice
```

- All stimulus drawing uses device pixels via these two functions (no `ctx.scale`), on **one** canvas
  (`#stage`). Nothing stimulus-related is an `<img>` or DOM element.
- Using fullscreen `innerWidth` (not `screen.width`) keeps the calibration correct under browser zoom, because
  zoom rescales CSS px and our drawing identically. `screen.width`, `screen.height`, `innerWidth` and
  `devicePixelRatio` are all logged; if `innerWidth !== screen.width` the setup screen shows a warning (not fatal).
- Linear ppd (constant across the screen) as in Psychtoolbox practice; at 7.75° eccentricity the tangent error is
  0.6 %, below the calibration tolerance.
- Worked check: the paper rig (1600 px, 38 cm, 54 cm) gives ppdCss = 39.68 (BRIEF says ≈39.7, correct).
- On any `resize`/`fullscreenchange` during the session: recompute. If ppdDevice changes by > 0.5 % from the
  calibrated value, or fullscreen is lost, the session pauses (§5.8).

### 2.3 Calibration check screen (fullscreen canvas + small DOM panel)

Drawn on `#stage` with the same functions as the stimuli:

1. A horizontal **10 cm ruler** (length `10 * cssW / monitor_width_cm` CSS px → device px), 1-cm major ticks,
   1-mm minor ticks, labelled "Hold a ruler here: this bar must measure 100 mm".
2. An **ID-1 card outline** (85.60 x 53.98 mm), labelled "A bank/ID card should exactly cover this box".
3. The **5° aperture square** outlined, labelled with its expected physical width `5 * cmPerDeg` cm (4.71 cm at 54 cm).
4. Text readout: ppdCss, ppdDevice, dprEff, cssW x innerHeight, canvas size, refresh estimate (§2.4).

DOM panel: input "Measured ruler length (mm)" (optional), buttons **[Recompute from measurement]** (sets
`monitor_width_cm ← monitor_width_cm * measured_mm / 100`, redraws, logs both values in
`calibration.recalibrations[]`) and **[Calibration OK – continue]** (requires checkbox "Ruler reads 100 ± 1 mm";
sets `calibration.ruler_confirmed = true`). The experiment cannot start without `ruler_confirmed` unless
`requireRulerCheck=false` (a config override, flagged).
**Refresh gate (added 2026-09-30 after verification):** if the refresh check (§2.4, iPad-rig thresholds) produces any
warning, **[Calibration OK – continue]** stays disabled until the experimenter ticks an explicit checkbox "Override
refresh warning"; the choice is stored as `calibration.refresh_override` (bool; `true` only when overridden), mirrored at
`session.refresh_override` (present in every payload, `false` before calibration), and an
event `refresh_override` with the warnings is logged.

### 2.4 Refresh estimate

During the calibration screen, record 180 rAF intervals (discard the first 10). Log `refresh_median_interval_ms`,
`refresh_hz_est = 1000/median`, `refresh_interval_sd_ms`, `refresh_samples_n`. Show a red warning if
`refresh_hz_est < 58` or the SD > 2 ms ("frame timing unstable: close other apps, disable VRR").
`frameMs = refresh_median_interval_ms` is used for phase-transition rounding (§5.2) and dropped-frame flags (§5.6).

---

## 3. Architecture

### 3.1 Principles

- Vanilla JS ES modules, no build step, no framework, no CDN, no third-party code of any kind (no jsPsych,
  no Bootstrap, no jQuery). Everything the page loads is under `static/star-inperson/`. Nothing imported from
  `static/js/` (keeps the experiment frozen independent of shared files).
- One file = one job. **All tunable parameters in `js/config.js`.** All participant-facing strings in `js/text.js`.
- Pure logic modules (`config`, `params`, `rng`, `design`, `rdk`, `calibration` math) have no DOM access at import
  time, so Node tests import them directly.
- Style Greg likes (tube): a plain `CONFIG` object, a class for the experiment (`StarInPersonExperiment`), a small
  HTML shell, separate `css/` and `img/`.

### 3.2 File tree and size budgets

```
static/star-inperson/
  index.html            shell: <canvas id="stage">, setup form, #screen overlay, #banner; loads js/main.js   ~90 lines
  css/star-inperson.css      overlay/form/banner styles; canvas fixed full-viewport, cursor hidden during trials   ~100
  img/
    face_open_R.png       byte copy of static/star/img/BlankFaceLookingRight (1).png          (§3.4)
    face_open_L.png       byte copy of static/star/img/BlankFaceLookingLeft (1).png
    face_blindfold_R.png  face_open_R.png + band blindfold from static/star/img/BlindfoldDrawingRight.png
                          (built by tools/make_blindfold.py; changed 2026-09-30, v1.1.0, at Greg's request)
    face_blindfold_L.png  exact mirror of face_blindfold_R.png
    tree.png              byte copy of static/star/img/Tree.png
  js/
    config.js           CONFIG: every parameter, grouped, units + source comments; pilot preset         ~230
    params.js           merge CONFIG + URL overrides; validate; experiment name; freeze; override log   ~140
    rng.js              seeded PRNG (mulberry32), stream derivation, shuffle, uniform                   ~50
    calibration.js      ppd math (pure) + canvas sizing + refresh measurement                            ~110
    stage.js            Stage class: device-px drawing in degrees, image prerender, ruler/card screen   ~170
    rdk.js              Guterstam2020Dots and ShadlenDots engines (pure, no DOM)                         ~200
    adaptors.js         draw face+tree / grating / blank for one frame                                  ~120
    design.js           trial list, practice list, requeue insertion (pure)                             ~130
    trialRunner.js      the rAF state machine for one trial; returns the trial record                   ~260
    experiment.js       class StarInPersonExperiment: session flow, blocks, breaks, practice loop           ~260
    screens.js          DOM screens: setup, calibration panel, instructions, feedback, break,
                        questionnaire, pause, end                                                        ~170
    text.js             every participant-facing string (neutral framing only)                           ~90
    data.js             payload build, POST with retries, local download, localStorage backup,
                        code fingerprint                                                                 ~170
    testHooks.js        window.__starInPerson, active only with ?test=1                                     ~80
    main.js             entry: resolve params, create StarInPersonExperiment, start                         ~30
analysis/
  star_inperson.py       stdlib-only analysis (§8)                                                        ~650
tests/star-inperson/
  server.mjs            static file server for static/ + mock POST /data (captures payloads)           ~90
  helpers.mjs           launch Chromium, open page with params, auto-responder, pixel utils            ~150
  unit.test.mjs         config/params/rng/design/calibration unit tests (pure Node)                    ~200
  rdk.test.mjs          engine tests with synthetic timestamps (pure Node)                             ~200
  display.test.mjs      browser: calibration/DPR, geometry, blindfold probe, fixation, dots & grating pixels ~250
  session.test.mjs      browser: full flows, timeout/requeue, practice pass/fail, saves, downloads, overrides ~300
  test_analysis.py      unittest: synthetic sessions → known ΔRT, exclusions, dedupe                    ~200
docs/star-inperson/
  BRIEF.md, SPEC.md (this file)
```

Hard cap (tested, T30): no file under `static/star-inperson/js/` exceeds 400 lines.

### 3.3 `js/config.js` (normative content; comments abbreviated here, the file MUST carry units + source per key)

```js
// ALL tunable parameters. Units in names. Sources: paper PDF page (pN), April report, Greg decision, or "ours: why".
// Every leaf key is unique across groups (so ?key=value overrides are unambiguous).
export const CONFIG = {
  meta: {
    experimentName: 'star-inperson',   // POST /data "experiment"; suffixed by mode (params.js)
    experimentVersion: '1.0.0',       // bump on ANY change; also git tag star-inperson-v1.0.0
  },
  display: {
    viewingDistanceCm: 54,            // p2 chinrest
    backgroundRgb: [128, 128, 128],   // p2 "neutral gray"; ours: luminance unreported
    inkRgb: [0, 0, 0],                // p2 black dots/fixation
    requireFullscreen: true,          // ours: calibration assumes fullscreen width
    requireRulerCheck: true,          // ours
    rulerLengthCm: 10,
    ppdChangeTolerance: 0.005,        // pause if ppd drifts >0.5 % after calibration
  },
  timing: {
    itiMinMs: 1000, itiMaxMs: 2000,   // p2, uniform
    fixationMs: 1500,                 // p2
    adaptorMs: 1500,                  // p2, p4
    responseWindowMs: 2000,           // p2
    tooSlowMs: 5000,                  // p2
    droppedFrameFactor: 1.5,          // interval > 1.5 x median = dropped (coordinator 2026-09-29)
  },
  fixation: { fixationDiameterDeg: 0.5 },  // p2
  rdk: {
    engine: 'guterstam2020',          // 'guterstam2020' | 'shadlen'  (§4)
    apertureWidthDeg: 5, apertureHeightDeg: 5,   // p2
    densityDotsPerDeg2: 50,           // guterstam2020: per FRAME (p2 literal) -> 1250 dots
    densityDotsPerDeg2PerSec: 50,     // shadlen: per SECOND (Kiani/Shadlen unit; 16.7 is their usual)
    dotDiameterDeg: 0.05,             // p2
    dotSpeedDegPerSec: 1.4,           // Decided by Greg Gage 2026-09-29 (paper p2: 2.0)
    lifetimeMs: 200,                  // p2 (guterstam2020 only)
    coherence: 0.40,                  // p2
    shadlenSets: 3,                   // shadlen only
  },
  geometry: {
    stimulusHeightDeg: 5.7,           // Fig 3 box height = Exp1 grating height; head = tree height (Arvid)
    innerEdgeDeg: 2.5,                // p7 (Exp 7 text), Fig 3
    gazeLineYDeg: 0,                  // eye + aperture centre y; fixation always at (0,0)
    mirrorTreeWithSide: true,         // ours: exact mirror displays
  },
  images: {                           // byte copies; sha256 verified at load (§3.4)
    face_open_R:      { file: 'img/face_open_R.png',      sha256: '00bc1ab62bdf578e7c3658fad8dc22e0888a225fdecbee403ac58e3a5ea320a8', contentBox: [78, 173, 1003, 1177], eyePx: [789, 487] },
    face_open_L:      { file: 'img/face_open_L.png',      sha256: '85ecb8c0675c4f9d497a2b7e0fa27b666d266736009450d3144c4412d6678be8', contentBox: [77, 173, 1002, 1177], eyePx: [290, 487] },
    face_blindfold_R: { file: 'img/face_blindfold_R.png', sha256: '2311cf6dfb908b4a9c736dbc4c30908756a6a28d189286136c976dc1d40465da', contentBox: [78, 173, 1003, 1177], eyePx: [789, 487] },
    face_blindfold_L: { file: 'img/face_blindfold_L.png', sha256: 'd24dfabd45b3441779aec64cdd87697bbcf3816e57fe902494dcb59c4e0e35f8', contentBox: [77, 173, 1002, 1177], eyePx: [290, 487] },
    tree:             { file: 'img/tree.png',             sha256: 'c88e8a312a93fdae64759316e45d844f349a6406e2b4ebc3bd1ce98fef28cf6b', contentBox: [31, 0, 1049, 1350] },
    blindfoldProbePx: { R: [700, 445], L: [379, 445] },  // inside blindfold rect, transparent in open image (tests)
  },
  grating: {                          // adaptor 'grating' only (Exp 1 rig check), p2
    gratingPeriodDeg: 0.8, gratingWidthDeg: 14.7, gratingHeightDeg: 5.7,
    gratingSpeedDegPerSec: 0.8, gratingContrast: 1.0,   // contrast unreported: ours
  },
  design: {
    adaptor: 'face_tree',             // 'face_tree' | 'grating'  (mode key, see params.js)
    trialsPerCell: 30,                // p4; must be even
    blockSize: 20,                    // p4; completed trials per block
    requeueTimeouts: true,            // p2
    maxTimeoutsPerSession: 40,        // ours: stop re-queueing after 40 timeouts (flagged)
  },
  practice: {
    practiceTrials: 10,               // p2
    practicePassAccuracy: 0.80,       // p2
    practiceMaxAttempts: 4,           // p2
  },
  keys: { keyLeft: 'ArrowLeft', keyRight: 'ArrowRight' },
  data: {
    dataUrl: '/data',                 // same origin; tests point this at the mock server automatically
    postTimeoutMs: 10000, postRetries: 3,
    autoDownloadAtEnd: true,
    saveFrameIntervals: true,         // per-trial dots frame-interval arrays
    maxPayloadBytes: 900000,          // nginx default client_max_body_size is 1 MB (§11.5 Q8)
  },
};
export const PILOT_PRESET = { trialsPerCell: 2, blockSize: 4, practiceTrials: 5 };  // ~2 min
```

`contentBox` = `[x0, y0, x1, y1)` of non-transparent pixels (PIL `getbbox`, exclusive right/bottom) in source
pixels; `eyePx` = pupil centre (centre of the eroded filled pupil disc). These were measured on 2026-09-29; test
T17 re-derives them from the PNG alpha channel and fails if any differs by > 2 px.

### 3.4 Stimulus images: which pair and why

Candidates in `static/star/img/`: (a) `BlankFaceLooking{Left,Right} (1).png` + `BlankFaceLooking{Left,Right}Blindfold (1).png`;
(b) `BlindfoldDrawing{Left,Right}.png` (the v1.x blindfold); (c) photographic `star-face-male-001-*`; greens
(`*Green.png`, catch trials; RGB without alpha).

**Chosen: (a) + `Tree.png`.** Verified by alpha-channel diff (2026-09-29):
- The blindfold image equals the open image plus one filled black rectangle (source px x 332–895, y 357–645 in
  the right-facing image); there are **zero** pixels opaque in the open image and transparent in the blindfold
  image, i.e. the blindfold hides the whole eye (circle + pupil) and changes nothing else. Same 1080x1350 canvas,
  same content box. The two differ only by the blindfold, which is exactly the Exp 2 manipulation ("uncovered eyes
  or a black blindfold covering the eyes", p. 4).
- `Left` is the exact horizontal mirror of `Right` (alpha identical after flip) for both open and blindfold.
- (b) is rejected: different file family, different canvas (384x480), a band wrapping the head plus a patch, and a
  different eye position from the open face → open vs blindfold would differ in more than the blindfold (BRIEF item 5).
- (c) rejected: photographic, the open and blindfold photos have different size/crop (400² vs 1024²), not a line
  drawing (paper Fig. 1B is a line drawing).
- Known and accepted: the blindfold adds a filled black area (more dark ink than the open eye). The paper's
  blindfold (Fig. 1B) is also a filled black shape, so this is part of the manipulation, not a confound we add.

`Tree.png` (1080x1350, black silhouette, transparent background) is the tree used in v1.x. It is asymmetric; with
`mirrorTreeWithSide: true` it is drawn mirrored when on the left so the head-right display is the exact mirror of
the head-left display. File naming: `_R` = looking right = used when `face_side = 'left'`.

Loading: `stage.js` fetches each file as a Blob, computes SHA-256 (`crypto.subtle`), compares with
`CONFIG.images.*.sha256`, then decodes it with `createImageBitmap`. **Any mismatch or load failure is fatal**:
error screen "Stimulus image failed to load/verify: <file>", nothing runs, no fallback drawing of any kind
(fixes v1.11 SVG fallback, bug B4). After calibration each image is pre-rendered once into an offscreen canvas at
its exact device-pixel size (`imageSmoothingQuality = 'high'`), so every trial draws identical pixels with a plain
`drawImage` at integer device coordinates.

Image placement (face on left, image `_R`; `s = stimulusHeightDeg / (contentBox.y1 − contentBox.y0)` deg per source px):
source px (sx, sy) → x = −innerEdgeDeg − (x1 − sx)·s, y = gazeLineYDeg − (sy − eyePx.y)·s. Tree: content left edge
at +innerEdgeDeg, scaled to height stimulusHeightDeg, top aligned with the head's content top. Face on right: use
`_L`, anchor its content left edge `x0` at +innerEdgeDeg, tree (mirrored if configured) content right edge at
−innerEdgeDeg. Resulting coordinates in §1.5.

### 3.5 Parameters, overrides and versioning (`params.js`, `data.js`)

- Effective config = deep copy of `CONFIG`, then `PILOT_PRESET` if `?pilot=1`, then URL overrides. Frozen.
- **Override syntax:** `?<leafKey>=<value>` (leaf keys are unique; T1 checks). Type from the default: number
  (finite), boolean (`true|false|1|0`), string enum (`engine`, `adaptor` allowed values), arrays as comma lists.
  Unknown key, bad type or out-of-range value → fatal error screen listing the problem; nothing runs.
- Validation (fatal): `trialsPerCell` even and ≥ 2; `0 ≤ coherence ≤ 1`; all durations > 0; `itiMinMs ≤ itiMaxMs`;
  `blockSize ≥ 1`; `practicePassAccuracy` in (0,1]; `engine`/`adaptor` in their enums.
- Reserved non-config params: `pid` (prefill), `seed` (uint32), `pilot=1`, `test=1`, and test-only
  (`logDots=1`, only honoured with `test=1`).
- Logged: `session.config_effective` (full object), `session.config_overrides`
  (`{leafKey: {default, value}}` for URL overrides only), `session.config_overridden` (bool; true iff any URL
  override other than the mode key `adaptor`), `session.pilot`, `session.test`.
- **Experiment name** (POST `experiment` field) = `star-inperson` + (`adaptor==='grating'` ? `-grating` : '') +
  (`pilot` ? `-pilot` : '') + (`test` ? `-test` : ''). So pilots, rig checks and tests never mix with real data.
- **Version:** `experimentVersion` (manual) and `code_fingerprint`: at startup `data.js` fetches (`cache:'no-store'`)
  every file in a hard-coded list (`index.html`, `css/star-inperson.css`, all `js/*.js`, all `img/*`), computes
  SHA-256 of each, and `code_fingerprint = sha256(sorted lines "path:hex\n")`. Logged with the per-file hashes
  (`session.file_hashes`). Shown on the setup screen (first 12 hex). The runbook records it; analysis groups by it.
  If `crypto.subtle` is unavailable, fingerprint = `"unavailable"` and a red warning shows. Before the first real
  participant: commit, tag `star-inperson-v1.0.0`, record the fingerprint in the pre-registration.

---

## 4. Dot engines and the grating

Both engines live in `rdk.js`, share one interface, are pure (no DOM) and take a seeded RNG:

```js
const eng = new Guterstam2020Dots(rdkCfg, { widthDeg, heightDeg }, dirSign /* +1 right, -1 left */, rng, log?);
const f = eng.frame(ts); // ts = rAF timestamp (ms). First call = dots onset: initialise, no motion.
// f = { n, xs: Float32Array, ys: Float32Array }  positions in deg relative to aperture centre, to draw this frame
eng.stats(); // { frames, nPerFrameMin, nPerFrameMax, nPerFrameMean, coherentPerFrameMean,
             //   measuredSpeedDegPerSec, respawns, wraps }
```
`log` (tests only, `?logDots=1`) receives per frame `{ts, dots:[{i, x, y, coh, reborn, wrapped}]}`.
Dot RNG seed per trial = FNV-1a-32 of `"<seed>:dots:<phase>:<attempt_index>"` (§5.4), logged as `dots_seed`.

### 4.1 `guterstam2020` (default): plain dots, every dot every frame (paper text literally)

Let W, H = aperture size (deg), v = `dotSpeedDegPerSec`, L = `lifetimeMs`, c = `coherence`.
1. `N = round(densityDotsPerDeg2 * W * H)` (1250). `Nc = round(c * N)` (500). Slots `0..Nc−1` are coherent
   for the whole trial, the rest noise, so exactly `Nc` coherent dots are drawn every frame.
2. Init (first `frame(ts)` call): each dot `x ~ U[−W/2, W/2)`, `y ~ U[−H/2, H/2)`, `age ~ U[0, L)`; each noise dot
   `θ ~ U[0, 2π)`. Velocity: coherent `(dirSign·v, 0)`; noise `(v cosθ, v sinθ)`. Return positions unmoved.
3. Every later frame: `dt = ts − prevTs` (ms, real elapsed time, no clamp; stalls are flagged by §5.6). For each dot:
   `age += dt`; if `age ≥ L − dt/2` → **respawn**: new uniform position, new θ if noise, `age = 0`, no motion this frame;
   else `x += vx·dt/1000`, `y += vy·dt/1000`, then **wrap** each axis: `if (x ≥ W/2) x −= W; if (x < −W/2) x += W;`
   same for y (count wraps). Dots keep their type across respawns.
4. Result at steady 60 Hz: each dot lives round(L/frame) = 12 frames = 200 ms; ≈ 8.3 % of dots respawn per frame,
   asynchronously (random initial ages); density per frame constant = N.
5. No interleaved sets. (An interleave option is not built into this engine: the paper does not describe it, and
   it caused the v1.0–v1.8.6 one-third-speed bug. The correct Shadlen/Kiani interleave is the other engine.)

### 4.2 `shadlen`: correct Shadlen/Kiani 3-set algorithm

K = `shadlenSets` (3). Density is per second: `nPerFrame = round(densityDotsPerDeg2PerSec * W * H / refresh_hz_est)`
(50·25/60 = 21 at 60 Hz; the setup refresh estimate is used and logged; dots per second are then constant across rigs).
1. Init: K sets of `nPerFrame` dots at uniform random positions; each set `lastShownTs = null`.
2. Frame `f` (0-based within the dots phase) shows set `s = f mod K` only. If `set.lastShownTs !== null`:
   `dt = ts − set.lastShownTs`; for each dot in the set independently, with probability `c` (dots RNG) it is
   **coherent this update**: `x += dirSign·v·dt/1000`; if it leaves the aperture it re-enters at the opposite
   (upstream) edge: `x −= dirSign·W`, and gets a new `y ~ U[−H/2, H/2)` (Shadlen "replace along the opposite edge");
   otherwise it is **re-plotted at a uniform random position** (noise dots do not move in random directions).
   Then `set.lastShownTs = ts`. The first K frames show each set at its initial positions.
3. Displacement uses the real time since that set was last drawn (≈ K frames), so speed is correct by construction
   even with dropped frames. No lifetimes (`lifetimeMs` unused; logged as n/a).
4. Differences from original MATLAB (documented, accepted): square aperture (paper) instead of circular mask;
   displacement from measured elapsed time instead of `K/monRefresh`.

### 4.3 Drawing dots (`stage.js`)

`s = max(1, round(dotDiameterDeg * ppdDevice))` device px. For each dot: centre `(X_dev(x), Y_dev(y + gazeLineYDeg))`
(aperture centre is at (0, gazeLineYDeg)); `ctx.rect(round(X − s/2), round(Y − s/2), s, s)`; one `fill()` per frame
with `inkRgb`. Float positions are kept in the engine; only drawing is rounded, so mean speed is exact. The whole
canvas is cleared to `backgroundRgb` first every frame. No aperture border. Per-frame JS work (engine + draw) is
measured and logged (`dots_frame_work_ms_max`).

### 4.4 Grating adaptor (`adaptors.js`, mode `adaptor=grating`, Exp 1 rig check)

Vertical bars, luminance along x: `Lum(x,t) = bg · (1 + C · sin(2π (x − g·V·t)/P + φ0))`, clipped to 0–255, where
x (deg) is relative to the grating centre (0, gazeLineYDeg), g = +1 (drifts right) or −1, V = 0.8 °/s,
P = 0.8°, C = `gratingContrast`, t = (ts − adaptor_onset_ts)/1000, φ0 ~ U[0, 2π) per trial config (design RNG,
logged `grating_phase0`). Rectangle 14.7 x 5.7° centred on (0, gazeLineYDeg); rectangular boundary stationary.
Render per frame: compute one row of RGBA across the grating's device width into a 1-px-tall offscreen canvas,
`drawImage` it stretched to the grating's device height with `imageSmoothingEnabled = false`.
Trial list (grating mode): cells `grating_direction ∈ {left,right}` x `congruent ∈ {true,false}`, `trialsPerCell/2`
each → 60 trials at default (30 per congruency, as p. 2), blocks of 20. `implied_direction = grating_direction`,
`eyes_condition = null`, `face_side = null`. Everything else (fixation, dots, timing, practice, saves) identical.

---

## 5. Trial flow and timing

### 5.1 Session flow (`experiment.js`, class `StarInPersonExperiment`)

1. Load: resolve params → verify & load images → compute fingerprint → setup screen (§2.1). Any failure → error screen.
2. Calibration screen (§2.3, §2.4) in fullscreen. Save `reason:'setup'` (partial).
3. "Hand-over" screen for the experimenter: "Participant seated at the chinrest? Press SPACE to show instructions."
4. Instructions 1 (§6) → Practice attempt k (10 trials) → feedback. Pass → save `'practice_passed'` → Instructions 2.
   Fail and k < 4 → retry with a **fresh** sequence. Fail at k = 4 → terminal save `'practice_failed'` → end screen.
5. Main task: blocks of `blockSize` completed trials. After each block except the last: save `'block_<b>'`, break screen.
   After the last trial: save `'main_done'`.
6. Awareness questionnaire (§6.5) + experimenter section → terminal save `'final'` (`status:'complete'`) → auto
   local download → end screen showing save status.

### 5.2 One trial = one continuous rAF state machine (`trialRunner.js`)

A single `requestAnimationFrame` loop runs from the start of practice to the end of the main task; trials and phases
are states of it. No DOM changes, no new canvases and no awaits between fixation, adaptor, dots and response
(fixes B2/B12). DOM overlays appear only at breaks, feedback and pause screens, never inside a trial.

States: `ITI → FIXATION → ADAPTOR → DOTS → (response) → ITI of next trial`, or `DOTS → (timeout) → TOO_SLOW → ITI of next`.

Per rAF callback with timestamp `ts`:
1. Record `ts − prevTs` in the trial's frame log.
2. Transition check: `elapsed = ts − phaseOnsetTs`. If `elapsed ≥ plannedMs − frameMs/2`, advance to the next
   state and set its `phaseOnsetTs = ts` (so each phase lasts the planned duration rounded to the nearest frame).
3. Draw the current state's content for this frame (clear to background first):
   - ITI: background only. FIXATION: fixation disc. ADAPTOR: head+tree (or grating, or nothing in practice).
   - DOTS: dots only (no fixation, no head/tree). TOO_SLOW: text "Too Slow!" centred, 1° cap height, ink colour.
4. `onset` timestamps are the `ts` of the callback that first drew that state. **`dots_onset_ts` is the rAF
   timestamp of the first frame on which dots are drawn** (RT zero).

Durations: ITI planned = `U[itiMinMs, itiMaxMs]` from the `iti` RNG stream; FIXATION 1500; ADAPTOR 1500;
DOTS ends at response or at `responseWindowMs`; TOO_SLOW 5000.

### 5.3 Responses and RT

- `keydown` listener (capture phase, `{passive:false}`), ignores `event.repeat`.
- While state = DOTS and no response yet, `ArrowLeft`/`ArrowRight` = response: store `key`, `event.timeStamp`,
  and `performance.now()` at handler entry. Next rAF: dots removed (background drawn), `dots_offset_ts = ts`,
  ITI of the next trial starts at that same `ts` (p. 2: "As soon as a response was given, the dot motion stimulus
  disappeared and the inter-trial interval began").
- `rt_ms = key_event_ts − dots_onset_ts` (`rt_timebase: "event"`); if `event.timeStamp` fails the timebase check,
  `key_event_ts` is null (raw value in `key_event_ts_raw`) and `rt_ms = key_handler_ts − dots_onset_ts`
  (`rt_timebase: "handler"`, fallback). `rt_handler_ms = key_handler_ts − dots_onset_ts`. `response_key` is the
  canonical `ArrowLeft`/`ArrowRight` of the recognised direction; raw `.key`/`.code` go to `response_*_raw` (§7.2).
- Any key during ITI/FIXATION/ADAPTOR is logged in `anticipatory_keys` (`{key, t_rel_dots_onset_ms}`) and ignored.
  Keys during TOO_SLOW are logged as `late_keys` and ignored.
- Timeout: in DOTS, if `ts − dots_onset_ts ≥ responseWindowMs − frameMs/2` with no response → TOO_SLOW.
- The mouse cursor is hidden during the loop (`cursor:none` on canvas).

### 5.4 Trial list (`design.js`), seeded and exactly balanced

- **Seed:** `?seed=` or `crypto.getRandomValues` (uint32). Streams: `order`, `practice`, `iti`, `requeue`, `dots`;
  stream seed = FNV-1a-32 of the string `"<seed>:<stream>"` (dots: `"<seed>:dots:<phase>:<attempt_index>"`); PRNG = mulberry32.
  All stream seeds logged (`session.seed`, `session.stream_seeds`; per trial `dots_seed`).
- **Face-tree list:** for `eyes ∈ [open, blindfold]`, `congruent ∈ [true, false]`, `face_side ∈ [left, right]`,
  repeat `trialsPerCell/2` times → config `{trial_id, eyes_condition, congruent, face_side, gaze_direction,
  implied_direction, test_direction}` where `gaze_direction = implied_direction = (face_side==='left' ? 'right' : 'left')`,
  `test_direction = congruent ? implied_direction : opposite`. `trial_id = "T" + 3-digit index in generation order`.
  Then Fisher–Yates with the `order` stream. Result: 30 per cell, 15/15 head side within each cell, 60/60 dot
  direction, all intermixed.
- Same seed → identical list (tested). The list is logged in full (`session.trial_list`).

### 5.5 Timeouts and re-queue

On a main-task timeout (and `requeueTimeouts`, and session timeouts ≤ `maxTimeoutsPerSession`): insert a copy of the
same trial config (same `trial_id`, `requeue_count + 1`, `requeued_from = attempt_index` of the timed-out attempt)
at index `j ~ U{min(1,R), …, R}` of the remaining queue of length R (index 0 = next trial; so never the immediately
next trial unless it is the only one left; appended if R = 0), using the `requeue` stream. Timed-out attempts are
kept in the data (`timed_out: true`) but do not count toward block size or cell counts. After
`maxTimeoutsPerSession`, timeouts are not re-queued (`session.requeue_cap_hit = true`; the analysis flags the
participant as incomplete if cells are then short). Practice timeouts count as incorrect and are never re-queued.

### 5.6 Frame statistics per trial

`frame_ms_session = refresh_median_interval_ms` (§2.4). For intervals from `fixation_onset_ts` to `dots_offset_ts`:
`dropped_frames_n` = count of intervals > `droppedFrameFactor · frame_ms_session`; `has_dropped_frame`;
`max_frame_interval_ms`. For the dots phase: `dots_frames_drawn`, `dots_frame_interval_median_ms`,
`dots_frame_interval_max_ms`, `dots_frame_intervals_ms` (array, 0.1 ms precision, if `saveFrameIntervals`).
Also `iti_actual_ms`, `fixation_actual_ms` (= adaptor_onset − fixation_onset), `adaptor_actual_ms`
(= dots_onset − adaptor_onset) and `onset_latency_ms = dots_onset_ts − (adaptor_onset_ts + adaptorMs)`
(how late the first dots frame was relative to plan; within ±frameMs/2 when no frames drop).

### 5.7 Practice

- Each attempt: `practiceTrials` trials, exactly half left / half right dots (odd n: extra direction chosen by the
  `practice` stream), shuffled with the `practice` stream advanced per attempt, so every attempt is a fresh sequence.
- Trial = ITI → fixation → 1.5 s blank gray (`adaptor_type: 'blank'`) → dots → response / Too Slow (5 s).
- No per-trial feedback. After the attempt: "You got X of 10 correct (Y %)". Pass iff `correct/practiceTrials ≥
  practicePassAccuracy` (timeouts count as incorrect). Up to 4 attempts.
- Practice failure: terminal POST (`status:'practice_failed'`, `complete:true`), automatic local download, end
  screen "Thank you, that is the end of the session." Data are never discarded (fixes B9).

### 5.8 Breaks, pause, abort

- Break screen (DOM overlay): "Block b of B complete. Take a short rest. Press SPACE when you are ready to continue."
  No accuracy or speed feedback (the paper reports none; avoids v1.11's pressure screens, B10). The partial save is
  started when the break screen appears (non-blocking; saves are serialised, §7.4).
- Pause: if fullscreen is lost, the page becomes hidden, or ppd drifts (§2.2), the current trial is aborted
  immediately (`aborted: true`, `abort_reason`), its config is re-queued exactly like a timeout (not counted against
  `maxTimeoutsPerSession`), an event is logged, and a pause overlay shows: **[R]** resume (click → re-enter
  fullscreen → recompute ppd; must be within tolerance of the calibration, else re-run calibration),
  **[D]** download data now, **[Q]** quit: terminal save `status:'aborted'` + download.
- `beforeunload` while a session is in progress → browser confirm prompt.
- Experimenter shortcut **Ctrl+Shift+S** (any time, `preventDefault`): downloads the current cumulative payload
  (`save_reason:'manual'`); does not POST; does not interrupt the trial loop (Blob creation happens after the frame).

### 5.9 Session length (defaults)

Main trial ≈ ITI 1.5 + fixation 1.5 + adaptor 1.5 + RT ≈ 0.75 = 5.25 s → 120 trials ≈ 10.5 min; timeouts (≈ 3 %,
p. 2) ≈ +0.5 min; practice ≈ 1 min per attempt (1–4); 5 breaks ≈ 2.5 min; instructions + questionnaire ≈ 3 min.
**Participant time ≈ 17–20 min** — within Arvid's 15–20 min guidance (§11.1). At `trialsPerCell: 60` it is ≈ 30 min
(flagged in §9). The setup screen displays the estimate computed from the effective config.

---

## 6. Participant-facing text (`text.js`; exact strings, neutral framing)

No Bob story, no catch-trial text, no Prolific/rejection/chance-level warnings, no accuracy warnings during the
main task, no mention of eyes, gaze, blindfold, attention or adaptation anywhere before the questionnaire.

6.1 Instructions 1 (before practice):
> **Moving dots task**
> Please rest your chin on the chinrest and keep your head still.
> Each trial starts with a small black dot in the centre of the screen. Look at it, and keep your eyes on the centre
> of the screen for the whole trial.
> Then a patch of moving dots appears. Some of the dots move together to the LEFT or to the RIGHT; the rest move
> randomly. Decide which way the dots are moving overall.
> Press the **LEFT ARROW** key for left, or the **RIGHT ARROW** key for right, as quickly and as accurately as you can.
> If you do not answer within 2 seconds, you will see "Too Slow!" and the experiment will continue.
> You will start with 10 practice trials. Press SPACE to begin.

6.2 Practice feedback: "Practice: you got X of 10 correct (Y %)." then one of:
pass → "Well done. Press SPACE to continue."; fail, attempts left → "You need at least 8 of 10 correct to go on.
Let's practise once more. Press SPACE to try again."; final fail → "Thank you. That is the end of this session.
Please let the experimenter know you are finished."
(8 = `ceil(practicePassAccuracy · practiceTrials)`, computed.)

6.3 Instructions 2 (after practice):
> **Main task**
> The task is the same. In each trial, after the black dot and before the moving dots, a drawing of a head and a tree
> will appear on the screen for a moment. **The drawing is irrelevant to your task.** Your only task is to report the
> direction of the moving dots, as quickly and accurately as you can.
> Keep your eyes on the centre of the screen throughout each trial. There will be short breaks.
> Press SPACE to begin.

(Grating mode: "…a pattern of moving stripes will appear… The stripes are irrelevant to your task…")

6.4 Break: see §5.8. Too slow: "Too Slow!". End: "Thank you! The session is complete. Please let the experimenter know."

6.5 Awareness questionnaire (after the main task; DOM form; answers logged verbatim). **Changed 2026-10-07 (Greg):**
same questions as the 2025-26 online study's Google Form "Backyard Brains Starfield Survey v1.8", so answers compare
with the online data (typos fixed, continent and Prolific fields dropped, gender options extended):
- `q_purpose` (free text, required): "What do you think the purpose of the experiment is?"
- `q_vision` (free text, required): "How do you think human vision works? Describe in detail how we are able to see."
- `q_influence` (radio, required: `yes` / `no` / `not_sure`): "Do you think the faces affected your ability to
  determine the direction of the stars?" (grating mode: "the moving stripes")
- `q_influence_how` (free text, optional): "If so, how?"
- `q_gender` (radio, optional): `male` / `female` / `other` / `prefer_not`
- `q_age` (radio, optional): `under_18`, `18_24`, `25_34`, `35_44`, `45_54`, `55_64`, `65_up`
Experimenter section (heading "Experimenter only — please hand back the keyboard"): `experimenter_fixation_rating`
(radio `good` / `some_lapses` / `poor`), `experimenter_notes` (free text).

---

## 7. Data

### 7.1 POST envelope

`POST {dataUrl}` body `{ "experiment": <experiment name §3.5>, "UUID": <session_uuid>, "data": <payload> }`.
Flask writes `uploads/{experiment}_{UUID}_{YYYYmmdd-HHMMSS}.json` (one file per POST; a second POST within the same
second overwrites the first — harmless because payloads are cumulative and saves are serialised, §7.4). `app.py` is
not modified. `session_uuid` = `crypto.randomUUID()`.

### 7.2 Per-trial record (`payload.trials[]`, one record per presented attempt: practice and main, including timeouts and aborts)

| Field | Type | Meaning |
|---|---|---|
| `session_uuid`, `participant_id` | str | repeated for convenience |
| `phase` | `practice` \| `main` | |
| `practice_attempt` | int \| null | 1–4 (practice only) |
| `attempt_index` | int | 0-based order of presentation within the phase |
| `trial_id` | str \| null | stable id of the trial config (`T001`…); re-queued copies share it; null in practice |
| `requeue_count` | int | 0 = first presentation |
| `requeued_from` | int \| null | `attempt_index` of the timed-out/aborted attempt that caused this one |
| `block` | int \| null | 1-based block (main) |
| `trial_in_block` | int \| null | 1-based among completed trials of the block |
| `adaptor_type` | `face_tree` \| `grating` \| `blank` | |
| `eyes_condition` | `open` \| `blindfold` \| null | April's `sighted` = `open` |
| `face_direction` | `towards` \| null | constant; for April-pipeline compatibility |
| `face_side` / `tree_side` | `left` \| `right` \| null | |
| `gaze_direction` | `left` \| `right` \| null | direction the head looks |
| `implied_direction` | `left` \| `right` \| null | head→tree direction (grating: drift direction); **null on practice records** (no adaptor) |
| `test_direction` | `left` \| `right` | coherent dot direction |
| `congruent` | bool \| null | `test_direction === implied_direction` |
| `congruent_gaze` | bool \| null | `test_direction === gaze_direction` (recomputable for future away designs) |
| `grating_direction`, `grating_phase0` | str/num \| null | grating mode |
| `last_frame_before_dots_ms` | num \| null | dots onset − timestamp of the last frame before it (face/tree, or fixation in practice); one refresh when nothing is shown in between (v1.3.0) |
| `face_img`, `tree_img` | str \| null | file names actually drawn (e.g. `face_blindfold_R.png`) |
| `tree_mirrored` | bool \| null | |
| `adaptor_images_drawn` | str[] | distinct image ids drawn during the adaptor (from the draw call, not the plan) |
| `adaptor_frames_drawn` | int | |
| `response` | `left` \| `right` \| null | |
| `response_key` | `ArrowLeft` \| `ArrowRight` \| null | **canonical** key of the recognised response direction (matched on `KeyboardEvent.key` *or* `.code`); null iff no response (timed out, aborted) |
| `response_key_raw`, `response_code_raw` | str \| null | raw `KeyboardEvent.key` / `.code` of the response keydown as reported (Safari BT keyboards may send `key: "Unidentified"`); null iff no response |
| `correct` | bool \| null | null if timed out or aborted |
| `timed_out` | bool | |
| `aborted`, `abort_reason` | bool, str \| null | fullscreen_lost / hidden / ppd_changed / quit |
| `rt_ms` | num \| null | response time; **invariant:** `rt_timebase == "event"` ⇒ `rt_ms = key_event_ts − dots_onset_ts`; `rt_timebase == "handler"` ⇒ `rt_ms = key_handler_ts − dots_onset_ts` (± 0.1 rounding). Null iff no response. The analysis uses `rt_ms` only |
| `rt_timebase` | `event` \| `handler` \| null | `event` if `KeyboardEvent.timeStamp` passed the timebase check (0–50 ms before handler entry, `performance.now()` clock); otherwise `handler` = **fallback**: RT then includes the event-dispatch latency (≈ 1–3 ms, unrelated to condition). Null iff no response |
| `rt_handler_ms` | num \| null | `key_handler_ts − dots_onset_ts` (always, when responded) |
| `key_event_ts` | num \| null | ms, `performance.now()` timebase: the accepted `KeyboardEvent.timeStamp`; **null when it failed the timebase check** (`rt_timebase == "handler"`) or no response |
| `key_event_ts_raw` | num \| null | the `KeyboardEvent.timeStamp` as received (accepted or rejected); null iff no response |
| `key_handler_ts` | num \| null | `performance.now()` at keydown-handler entry; always present when responded, null iff no response |
| `anticipatory_keys`, `late_keys` | array | `{key, t_rel_dots_onset_ms}` |
| `iti_planned_ms` | num | |
| `iti_actual_ms`, `fixation_actual_ms`, `adaptor_actual_ms` | num \| null ᴬ | planned values are in config |
| `trial_start_ts` | num | rAF ms, 0.1 precision |
| `fixation_onset_ts`, `adaptor_onset_ts`, `dots_onset_ts`, `dots_offset_ts` | num \| null ᴬ | rAF ms, 0.1 precision |
| `onset_latency_ms` | num \| null ᴬ | §5.6 |
| `dots_frames_drawn` | int | 0 if aborted before dots |
| `dots_frame_interval_median_ms`, `dots_frame_interval_max_ms` | num \| null ᴬ | |
| `dots_frame_intervals_ms` | num[] | if `saveFrameIntervals` |
| `dropped_frames_n`, `has_dropped_frame`, `max_frame_interval_ms` | int, bool, num \| null ᴬ | §5.6 |
| `rdk_engine` | str | |
| `n_dots_per_frame_mean/min/max`, `n_coherent_per_frame_mean` | num \| null ᴬ | from `eng.stats()` |
| `measured_speed_deg_s` | num \| null | engine's own mean coherent displacement / time ("effective speed", April); null if fewer than 2 dots frames were drawn (aborted before dots, or a keypress within the first dots frame: no motion yet) |
| `dot_size_device_px` | int | |
| `dots_seed` | uint32 | |
| `dots_frame_work_ms_max` | num | JS time per dots frame (engine + draw) |
| `visibility_hidden_during_trial`, `fullscreen_lost_during_trial` | bool | |

**Nullability (amended 2026-09-30 after verification).** Records exist for every presented attempt, so values that
were never observed are null, never a placeholder number:
- *Practice records:* `implied_direction` (and the adaptor fields `eyes_condition`, `face_*`, `tree_*`, `gaze_direction`,
  `congruent`, `congruent_gaze`, `grating_*`) are null.
- *No response* (timed out or aborted): every response field (`response`, `response_key`, `response_key_raw`,
  `response_code_raw`, `correct`, `rt_ms`, `rt_timebase`, `rt_handler_ms`, `key_event_ts`, `key_event_ts_raw`,
  `key_handler_ts`) is null.
- ᴬ *Aborted records only:* a field marked ᴬ is null when the trial was aborted before the phase that defines it. An
  abort before the first dots frame makes `dots_onset_ts`, `dots_offset_ts`, `adaptor_actual_ms`, `onset_latency_ms`,
  the dots frame-interval metrics and the engine metrics (`n_dots_per_frame_*`, `n_coherent_per_frame_mean`,
  `measured_speed_deg_s`) null; an abort during the ITI or fixation additionally nulls the later onsets/durations.
  Completed and timed-out records have all ᴬ fields non-null.

Constant per-session parameters (coherence, aperture, density, diameter, declared speed, lifetime, ppd) are in
`session.config_effective` / `session.calibration`, not repeated per trial. April's "Required data fields" map:
`prolificPid → participant_id`, `uuid → session_uuid`, `faceOnLeft → face_side`, `impliedDirection →
implied_direction`, `testDirection → test_direction`, `effectiveDotSpeedDegPerSec → measured_speed_deg_s`,
`avg/min/maxFps → dots_frame_interval_*`, `commit_sha → code_fingerprint` + `experimentVersion`.

### 7.3 Session object (`payload.session`)

`experiment`, `experiment_version`, `code_fingerprint`, `file_hashes {path: sha256}`, `session_uuid`, `status`
(`in_progress` | `practice_failed` | `complete` | `aborted`), `partial` (bool), `complete` (bool), `main_done`
(bool), `save_seq` (int, starts 1, +1 per POST or download), `save_reason`, `saved_at_iso`,
`setup {participant_id, experimenter, monitor_width_cm, viewing_distance_cm, chinrest_used, room_dark, monitor_model}`,
`calibration {cm_per_deg, ppd_css, ppd_device, dpr_window, dpr_effective, inner_w, inner_h, screen_w, screen_h,
canvas_w, canvas_h, ruler_confirmed, ruler_measured_mm, refresh_override, recalibrations[], calibrated_at_iso}`,
`display {refresh_median_interval_ms, refresh_hz_est, refresh_interval_sd_ms, refresh_samples_n}`,
`geometry {aperture_deg, head_box_deg, tree_box_deg, eye_point_deg, gaze_line_y_deg, gaze_line_through_aperture_centre (bool)}` (per side),
`images [{id, file, sha256, natural_w, natural_h, verified}]`, `environment {user_agent, ua_data (brands, platform,
mobile, if available), platform, language, hardware_concurrency, device_memory, gpu_renderer, color_depth}`,
`seed`, `stream_seeds`, `trial_list` (planned configs in order), `config_effective`, `config_overrides`,
`config_overridden`, `pilot`, `test`, `timing {start_iso, end_iso, time_origin, duration_ms}`,
`events [{t, type, detail}]` (visibility, fullscreen, resize, pause, resume, save, download, error),
`practice {attempts [{attempt, n, n_correct, accuracy, passed, directions[]}], passed, n_attempts}`,
`main_summary {n_completed, n_attempts, n_timeouts, n_aborted, accuracy, cell_counts {open_cong, open_incong,
blind_cong, blind_incong}}`, `requeue_cap_hit`, `questionnaire {…§6.5}`, `saves [{seq, reason, t_iso, ok,
http_status, bytes, error}]`.

`payload = { session, trials }`. Every save contains the **whole** session so far (cumulative).

### 7.4 Saves

- Serialised: a promise chain; a save starts only after the previous one finished (so a later snapshot can never be
  overwritten by an earlier one, even with the 1-s filename resolution).
- POST: `fetch(dataUrl, {method:'POST', headers:{'Content-Type':'application/json'}, body})`, per-attempt timeout
  `postTimeoutMs` (AbortController), up to `postRetries` retries with 1 s / 2 s / 4 s backoff. Success iff
  `res.ok && json.status === 'ok'`. Outcome appended to `session.saves` (visible in the next save).
- Save points and flags:

| `save_reason` | when | `partial` | `complete` | `status` |
|---|---|---|---|---|
| `setup` | after calibration OK | true | false | in_progress |
| `practice_passed` | after the passing attempt | true | false | in_progress |
| `block_<b>` | at each break | true | false | in_progress |
| `main_done` | after the last main trial | true | false | in_progress (`main_done: true`) |
| `final` | after questionnaire | false | true | complete |
| `practice_failed` | after 4th failed attempt | false | true | practice_failed |
| `aborted` | experimenter quit | false | true | aborted |
| `manual` | Ctrl+Shift+S / pause [D] | true | false | (current) — download only, no POST |

- Automatic local download on every terminal save (`final`, `practice_failed`, `aborted`) when `autoDownloadAtEnd`:
  file `star-inperson_<participant_id>_<session_uuid>_<save_reason>.json` (experiment name prefix as in §3.5),
  content = exactly the POST envelope `{experiment, UUID, data}`.
- localStorage backup: after every save, `localStorage['star-inperson:backup:<uuid>'] = envelope` (try/catch; keep the
  20 most recent). The setup screen offers "Download N stored backups" when any exist.
- Payload size **MUST** stay ≤ `maxPayloadBytes` for a full default session; if a payload would exceed it, the
  POST omits `dots_frame_intervals_ms` (keeps it in the local download) and logs `event:'payload_trimmed'`.

### 7.5 Dedupe rule for analysis

Load every `*.json` whose envelope `experiment` equals the requested name (server files and local downloads can be
mixed in the same folder). Group by `UUID`. Keep the single file with the highest `data.session.save_seq`; on a tie
the files must be identical in `trials`; if not, keep the one with more trial records and print a warning. Never
merge files. A session counts as a participant session iff it reached `main_done: true` (the questionnaire is not
required for inclusion). Duplicate `participant_id` across UUIDs: keep the earliest `timing.start_iso`, exclude the
others as `duplicate_participant` (listed).

---

## 8. Analysis script `analysis/star_inperson.py`

Python ≥ 3.9 standard library only (`json`, `glob`, `math`, `random`, `statistics`, `argparse`, `csv`).

CLI:
```
python3 analysis/star_inperson.py DIR [DIR ...]
  [--experiment star-inperson]      # or star-inperson-grating, star-inperson-pilot
  [--iterations 10000] [--seed 20260929]
  [--fingerprint HEX]              # keep only sessions with this code_fingerprint
  [--include-overridden]           # default: sessions with config_overridden are excluded
  [--target-n 32] [--interim]      # prints a warning banner if N_included < target unless --interim
  [--min-valid-rt-per-cell 15]     # pre-registered exclusion threshold (step 2); >= 1
  [--out-csv per_participant.csv]
```
Mode is inferred from `config_effective.design.adaptor` (must be uniform across included sessions).

All thresholds (target N, iterations, seed, RT floor 200 ms, chance α .05, `MIN_VALID_RT_PER_CELL` 15, April 80 %,
exact sign-flip N ≤ 20) live in one labelled `PREREGISTRATION` block at the top of the script and are printed in the
report header with the exclusion rules; they must match the pre-registration. A CLI value that differs from the block
prints a WARNING line.

Pipeline (each step prints its count):
1. Load + dedupe (§7.5). Report files, unique UUIDs.
2. Session exclusions, in order: `overridden_config` → `fingerprint_mismatch` (only with `--fingerprint`; without it,
   if > 1 fingerprint is present, print all with counts in a red WARNING) → `duplicate_participant` →
   `practice_failed` → `incomplete` (fewer than `trialsPerCell` completed main trials in any cell) →
   `chance_accuracy` → `min_valid_rt_per_cell`.
   **Pre-registered exclusion `min_valid_rt_per_cell`** *(Added 2026-09-30 after verification; PI may change the
   threshold before data collection)*: a participant with fewer than `MIN_VALID_RT_PER_CELL` = **15** valid RTs (half
   of a 30-trial cell; valid = step 4: main phase, `correct is True`, `rt_ms > 200`, not timed out, not aborted) in
   **any** of the 4 eye × congruency cells (grating mode: the 2 congruency cells) is excluded and listed with that
   reason. Rationale: without it an empty or near-empty RT cell silently drops the participant from the contrasts
   that use that cell only, so the contrasts would run on different N. Consequently, after the exclusions **every
   contrast uses exactly `N_included` participants**; the script raises an error if any main, [A] or [C] contrast
   has a different N, and prints each contrast's N in the test table. [B] drops dropped-frame trials, which can
   thin a cell; [B] therefore has its own fixed cohort *(amended 2026-09-30, verification round 2)*: the included
   participants who still have ≥ `MIN_VALID_RT_PER_CELL` valid RTs in every cell after dropped-frame trials are
   removed. All three [B] contrasts use exactly that cohort (the script raises otherwise), its N is printed in the
   [B] heading, and a WARNING names any included participant omitted from [B].
3. **Accuracy permutation test (paper p. 2):** per participant, main-task completed trials (not timed out, not
   aborted; one per `trial_id` final completion). Observed accuracy `a`. Null: randomly permute the vector of
   responses across trials (dot directions fixed), recompute accuracy; `iterations` = 10,000; RNG
   `random.Random(seed + hash of UUID bytes)`, deterministic. `p = (1 + #{a_perm ≥ a}) / (1 + iterations)`.
   Exclude if `p ≥ 0.05`. Also print the exact one-sided binomial p (`math.comb`) for comparison. (For 120 trials the
   cut-off is ≈ 70/120 = 58 %.)
4. Trial filter for RT: `phase=='main'`, `correct is True`, `rt_ms > 200`, not timed out, not aborted.
5. Per participant: mean RT per cell; `drt_open = RT(open,cong) − RT(open,incong)`; `drt_blind` likewise;
   `drt_diff = drt_open − drt_blind`; accuracy per cell and `dA = acc_cong − acc_incong` per eyes condition
   (accuracy over all completed main trials). Median-based versions (`drt_*_median`) from per-cell medians.
   Also `sigma_within` = pooled SD of RT within cells (for power planning).
6. Group tests for each contrast (open ΔRT vs 0, blindfold ΔRT vs 0, open − blindfold vs 0):
   mean, SD, SE = SD/√n, `dz = mean/SD`, `t = mean/SE`, `df = n−1`,
   `p_t` = two-sided Student-t p via the regularised incomplete beta function (implemented in stdlib; this is the
   test the paper reported), `p_normal = erfc(|t|/√2)` (printed for comparison; anti-conservative at small n),
   `p_signflip` = two-sided sign-flip permutation p: exact enumeration of all 2^n sign patterns if n ≤ 20, else
   `iterations` random flips; `p = #{|mean_perm| ≥ |mean_obs| − 1e-9} / 2^n` (exact) or
   `(1 + #{…}) / (1 + iterations)` (Monte Carlo). **Pre-registered primary p = `p_signflip`**; `p_t` shown alongside.
   Grating mode: one contrast `grating ΔRT vs 0`.
7. Robustness blocks (same test table): [A] median-based ΔRT; [B] excluding trials with `has_dropped_frame`;
   [C] April participant rule (overall accuracy ≥ 80 %) instead of the permutation rule.

Exact output format (numbers illustrative; column widths fixed; `+` sign on ΔRT):

```
STAR-INPERSON ANALYSIS  experiment=star-inperson  mode=face_tree  version=1.0.0  fingerprint=3fa1c09b2e11
files=58 unique_uuids=33  seed=20260929  iterations=10000
PREREGISTRATION target_n=32  iterations=10000  seed=20260929  rt_floor_ms=200  alpha_chance=0.05  min_valid_rt_per_cell=15  april_acc=0.8  exact_signflip_max_n=20
EXCLUSION RULES: overridden_config, fingerprint_mismatch (with --fingerprint), … min_valid_rt_per_cell (< 15 valid RTs = correct & main & rt>200 ms & !timed_out, in any eye x congruency cell)
EXCLUSIONS (in order)
  overridden_config         0
  duplicate_participant     0
  practice_failed           1
  incomplete                0
  chance_accuracy           0
  min_valid_rt_per_cell     0
INCLUDED N=32   (chinrest_used: 32/32)
RT TRIAL FILTER: correct & rt>200 & !timed_out -> kept 3571/3840 (93.0%)

CELL MEANS (ms; mean of participant means)
  eyes        congruent  incongruent    dRT     SE    dA(%)
  open            751.2        729.0   +22.2    8.0    -2.4
  blindfold       728.4        731.9    -3.5    8.1    -2.6

TESTS  N=32 df=31   primary p = sign-flip (exact if N<=20, else 10000 random flips)
  contrast                n   mean_ms     SE     dz       t     p_t   p_normal  p_signflip
  open dRT vs 0          32     +22.2    8.0   0.49   2.775  0.0093    0.0055      0.0091
  blindfold dRT vs 0     32      -3.5    8.1  -0.08  -0.432  0.6687    0.6657      0.6702
  open - blindfold       32     +25.7   11.3   0.40   2.274  0.0300    0.0230      0.0296

ROBUSTNESS [A] medians            (same TESTS table)
ROBUSTNESS [B] no dropped-frame trials (N=32, kept 3502 trials)   (same TESTS table)
ROBUSTNESS [C] April rule acc>=80% (N=30)                    (same TESTS table)
sigma_within (pooled within-cell RT SD) = 128.4 ms
```

`--out-csv` columns: `participant_id, uuid, fingerprint, n_completed, n_timeouts, accuracy, acc_perm_p, acc_binom_p,
excluded_reason, rt_open_cong, rt_open_incong, rt_blind_cong, rt_blind_incong, drt_open, drt_blind, drt_diff,
drt_open_median, drt_blind_median, dA_open, dA_blind, n_rt_trials, n_dropped_frame_trials, chinrest_used,
refresh_hz_est, ppd_css, questionnaire_influence`.

---

## 9. Power and stopping rule

From the BRIEF (verified): paper Exp 2 ΔRT = 22 ms, SE 8, n = 24 → SD ≈ 39 ms, dz ≈ 0.56. Monte Carlo power
(two-sided α = .05, 6,000 simulated studies per cell; assumes trial-level within-person RT SD 110–130 ms, ~92 %
correct, so ~30–40 ms of the 39-ms between-person SD is trial noise; H3 assumes blindfold ΔRT = −3 ms and
independent open/blindfold ΔRTs; all effects estimated at 2 °/s — the effect at our 1.4 °/s is unknown and may be larger
per Renet, §11.1):

| Option | N included | trials/cell (total) | participant time | Power H1 (open ΔRT>0) | Power H3 (open − blindfold) |
|---|---|---|---|---|---|
| D: "12 to start" | 12 | 30 (120) | ~18 min | ≈ 0.43 | ≈ 0.29 |
| A: paper | 24 | 30 (120) | ~18 min | ≈ 0.75 | ≈ 0.54 |
| **B: recommended** | **32** | **30 (120)** | **~18 min** | **≈ 0.87** | **≈ 0.70** |
| C: more trials | 24 | 60 (240) | ~30 min | ≈ 0.88–0.92 | ≈ 0.78 |
| C': more trials, more people | 32 | 60 (240) | ~30 min | ≈ 0.95–0.98 | ≈ 0.88 |

- One-line explanations: **D** is a pilot, not a test (coin-flip power). **A** matches the paper exactly and has 3-in-4
  power for H1 but only ~1-in-2 for the dissociation. **B** keeps the paper's session and adds people: best power
  per participant-minute within the 20-min limit. **C** is one config change (`trialsPerCell: 60` → 240 trials,
  12 blocks) and buys power with trials instead of people, but the ~30-min session exceeds Arvid's 15–20 min
  guidance (long sessions may weaken the effect) and departs from the paper.
- **Recommendation:** Option B. Pre-register N = 32 *included* participants (recruit until 32 pass the exclusions;
  excluded participants are replaced, as the paper did: "tested more to compensate for exclusions", p. 2), default
  120 trials, speed 1.4 °/s, the three contrasts, primary p = sign-flip, α = .05 two-sided, H1 as the primary test.
- **Stopping rule:** fixed N; N counts participants who pass *all* pre-registered exclusions of §8 step 2, including
  `min_valid_rt_per_cell` (added 2026-09-30 after verification; PI may change the threshold before data collection),
  so all three contrasts are computed on the same N participants. Nobody computes ΔRT before N is reached (the script prints a banner if N < `--target-n`
  unless `--interim`). Data-quality checks on pilots/early sessions use only `star-inperson-pilot` or accuracy/timing
  fields. If Greg wants a look at 16, pre-register a two-look group-sequential design (looks at n = 16 and n = 32,
  Pocock boundary α = .0294 per look, two-sided); peeking at 12, 16, 20… without correction inflates false positives.
- The analysis prints `sigma_within`; after ~8 participants, re-run the power table with the observed value
  (this uses no ΔRT information and does not bias the test).

---

## 10. Acceptance tests

Run (from repo root):
```
NODE_PATH=$(npm root -g) node --test tests/star-inperson/
python3 -m unittest tests/star-inperson/test_analysis.py -v
```
Playwright is the global `playwright@1.61.1` (`/usr/local/lib/node_modules`), Chromium from `~/.cache/ms-playwright`
(resolves to `chromium-1228`). Never run `playwright install`. Browser tests start `tests/star-inperson/server.mjs` on a
free localhost port: it serves `static/` at `/` (so the page is at `/star-inperson/`) and implements `POST /data` in
memory (same response shape as Flask: `{"status":"ok","saved":"<name>"}`), exposing captured payloads to the tests.
Default viewport 1600x1200, `deviceScaleFactor` 1 unless stated. Browser tests use `?test=1` (exposes
`window.__starInPerson`, suffixes the experiment name with `-test`), `requireFullscreen=false&requireRulerCheck=false`
where fullscreen is not the subject, a fixed `seed`, and short timings where timing is not the subject
(`itiMinMs=20&itiMaxMs=40&fixationMs=100&adaptorMs=150&tooSlowMs=200`). Tests fill the setup form
(`monitor_width_cm=38`, distance 54) and respond with Playwright key presses.

**`window.__starInPerson` (test mode only):** `ready`, `config` (effective), `events[]` (`{t, type, …}`: phase changes
with `attempt_index`/`ts`, saves, downloads), `frames[]` (per trial frame: `{ts, phase, attempt_index, nDots,
imagesDrawn[], fixationDrawn}`), `trials()` (records so far), `payloads[]` (every envelope built), `frameListeners[]`
(functions `(info, ctx) => void` called synchronously right after each frame is drawn, so tests can
`ctx.getImageData` small patches), `degToDevice(x, y) → [X, Y]`, `stageInfo() → {ppdCss, ppdDevice, dprEffective,
canvasW, canvasH}`, and with `logDots=1` the per-frame dot log of §4.

### 10.1 Automated (the verifier re-runs all of these; each MUST pass)

Config and parameters (`unit.test.mjs`)
- **T1** All leaf keys of `CONFIG` are unique; every key listed in §3.3 exists with the stated default.
- **T2** URL override `?dotSpeedDegPerSec=2&seed=42` → `config_effective.rdk.dotSpeedDegPerSec === 2`,
  `config_overrides.dotSpeedDegPerSec` = `{default:1.4, value:2}`, `config_overridden === true`; the setup banner
  lists it (browser check). `?foo=1`, `?coherence=abc`, `?trialsPerCell=3` → fatal error screen, no trial starts.
- **T3** Experiment name: default `star-inperson`; `pilot=1` → `-pilot`; `adaptor=grating` → `-grating` and
  `config_overridden === false`; `test=1` → `-test`.
- **T4** Pilot preset gives 8 main trials, blocks of 4, 5 practice trials.

Trial list (`unit.test.mjs`)
- **T5** For seeds 1…200 at default config: 120 configs; each (eyes x congruent) cell = 30; within each cell
  face_side left = right = 15; test_direction left = right = 60; `congruent === (test_direction === implied_direction)`
  and `implied_direction` is opposite to `face_side` for every config; unique `trial_id`s.
- **T6** Same seed → identical list; seeds 1 and 2 → different order. Grating mode: 60 configs, 15 per
  (direction x congruency).
- **T7** Requeue insertion: for random queues, the inserted index is ≥ 1 when R ≥ 1 and the multiset of configs
  after all insertions equals original + re-queued.
- **T8** Practice lists: 5/5 directions per attempt; attempts 1–4 for a fixed seed are not all identical.

Calibration math (`unit.test.mjs`)
- **T9** `cmPerDeg(54) = 0.9425017 ± 1e-6` (= 2·54·tan 0.5°; corrected 2026-09-30, the earlier printed 0.94249 was
  truncated and 1.2e-5 off); `ppdCss(innerWidth 1600, width 38, distance 54) = 39.68 ± 0.01`.

RDK engines, synthetic timestamps (`rdk.test.mjs`; ts sequences: steady 60 Hz, steady 144 Hz, 60 Hz with ±2 ms
jitter, 60 Hz with one 50-ms stall; 2 s each; both directions; speeds 1.4 and 2.0)
- **T10 speed (guterstam2020):** over all coherent dots and consecutive frames with no respawn and no wrap,
  `Δx/Δt = dirSign·v` within 0.1 %, Δy = 0. Noise dots: `|Δ|/Δt = v` within 0.1 %; their directions pass a
  12-bin chi-square uniformity test (p > 0.001, ≥ 6,000 samples).
- **T11 count/coherence (guterstam2020):** every frame n = 1250 and exactly 500 coherent.
- **T12 bounds:** every drawn position satisfies −W/2 ≤ x < W/2, −H/2 ≤ y < H/2 (both engines).
- **T13 lifetime (guterstam2020):** at steady 60 Hz, ≥ 99 % of complete observed lives (born and died within the
  run) last 12 frames (± 1); per-frame respawn fraction mean = dt/L ± 10 %. Initial ages (first-respawn times,
  8 × 1,250 dots) — *frame-quantisation aware (amended 2026-09-30)*: at **steady 144 Hz** mean L/2 ± 5 % and KS
  distance to U[0, L] < 0.05; at **steady 60 Hz** mean L/2 ± 5 %, every first-respawn time lies on the frame grid, and
  the distribution of the first-respawn frame index k matches the expected discretised uniform — U[0, L) ages mapped
  to k = max(1, ⌈(L − dt/2 − a)/dt⌉), i.e. dt/L per interior frame with partial mass at both ends — with a discrete
  KS distance < 0.02. Rationale: respawns can only happen on frames, so at 60 Hz (steps dt/L = 1/12) a continuous
  KS against U[0, L] is ≥ ≈ 0.08 for *any* age distribution (verifier probe: 0.083); the literal criterion was
  unsatisfiable and tested nothing.
- **T14 shadlen:** frames alternate sets 0,1,2,…; per-frame n = `round(50·25/refresh)` (refresh given); dots per
  second = density·area ± 5 %; for dots coherent at an update, displacement / (ts − lastShown) = v within 0.1 %
  (excluding edge re-entries); fraction of coherent updates = c ± 0.02 over ≥ 10,000 updates; noise dots are
  re-plotted (positions uncorrelated with previous: |corr| < 0.05).

Display, browser pixels (`display.test.mjs`)
- **T15 DPR:** at `deviceScaleFactor` 1 and 2 (and 1.5), `canvas.width = round(innerWidth·dpr)`,
  `ppdDevice = ppdCss·dprEffective` (± 0.1 %), and on the calibration screen the drawn ruler's ink length along its row
  = `10·innerWidth/38·dpr` device px ± 2 px.
- **T16 measured dot speed (end to end):** `?coherence=1&lifetimeMs=100000&densityDotsPerDeg2=2` (50 dots,
  guterstam2020) at DPR 1 and 2, speeds 1.4 and 2.0: via a frame listener capture the aperture region at dots frames
  5 and 25; find the integer horizontal shift that maximises overlap of the binary dot masks; measured speed =
  shift / ppdDevice / (ts25 − ts5) within **± 5 %** of config, sign = test direction. Same for `engine=shadlen&densityDotsPerDeg2PerSec=120`
  (≈ 50 dots per frame at 60 Hz) with frames 6 and 30 (same set).
- **T17 images:** `static/star-inperson/img/*` are byte-identical to their `static/star/img` sources and match
  `CONFIG.images.*.sha256`; re-deriving `contentBox` and `eyePx` from the PNG alpha (Node, `zlib` PNG decode or
  Playwright canvas) matches config within 2 px; the blindfold image minus the open image has no pixel that is
  opaque only in the open image; `_L` alpha = mirrored `_R` alpha.
- **T18 geometry:** in an open, face-left adaptor frame, ink extents measured from pixels (in degrees via
  `stageInfo`): head x ∈ [−7.75, −2.50], tree x ∈ [+2.50, +6.80], both y ∈ [−3.92, +1.78], each edge ± 0.05°;
  the pixel at the eye point is ink (pupil). Face-right frame = horizontal mirror (± 1 device px). Aperture centre
  y equals the eye point y (`gaze_line_through_aperture_centre === true`).
- **T19 blindfold actually drawn:** run 4 trials per cell (16 trials). On the first adaptor frame of every trial,
  a frame listener reads a 3x3 device-px patch at the blindfold probe point (config `blindfoldProbePx`, mapped to
  device px by the same placement math): every blindfold trial → all 9 px luminance < 40; every open trial → all
  9 px within ± 6 of background. Also `face_img` matches `eyes_condition` (`face_blindfold_*` ↔ blindfold) and
  `adaptor_images_drawn` = [the face id, `tree`] on every trial.
- **T20 fixation:** fixation disc ink diameter = `0.5·ppdDevice` ± 1 px; fixation ink present only in FIXATION
  frames; no head/tree ink in DOTS frames; no dot ink in ADAPTOR frames.
- **T21 aperture pixels:** in DOTS frames, no non-background pixel outside the aperture rectangle expanded by
  `ceil(s/2)+1` device px.
- **T22 grating (`adaptor=grating`):** from rows sampled at y = gazeLine in two adaptor frames ≥ 30 frames apart:
  fitted spatial period = 0.8° ± 2 %, phase drift speed = 0.8 °/s ± 5 % in the trial's `grating_direction`,
  grating ink extent 14.7 x 5.7° ± 1 device px + rounding; a grating-mode session with `pilot=1` (T24-style)
  completes with 4 main trials and experiment name `star-inperson-grating-pilot-test` (the 60-trial list is covered by T6).

Sessions, timing, data (`session.test.mjs`; pilot-size configs)
- **T23 RT zero:** for every main trial, `dots_onset_ts` equals the `ts` of the first logged frame with
  `phase==='dots'` for that attempt; `rt_ms === key_event_ts − dots_onset_ts` (`rt_timebase` event; handler:
  `key_handler_ts − dots_onset_ts`, §7.2 invariant); `rt_ms > 0`. At default durations
  (one 4-trial run): `|adaptor_actual_ms − 1500| ≤ frame_ms + 1`, `|fixation_actual_ms − 1500| ≤ frame_ms + 1`,
  `|onset_latency_ms| ≤ frame_ms` unless `has_dropped_frame`.
- **T24 full flow + saves:** `pilot=1` (8 trials, blocks of 4), all answers correct: mock server receives, in order,
  `setup`, `practice_passed`, `block_1`, `main_done`, `final` with `save_seq` strictly increasing; partial/complete
  flags as §7.4; each payload's trials are a superset (prefix) of the previous; the final payload has
  `status:'complete'`, 8 completed main trials (2 per cell), questionnaire answers; a download event fires with
  file name per §7.4 and content deep-equal to the `final` envelope; final payload size ≤ `maxPayloadBytes`
  (and a separate default-size 120-trial run with short timings also stays ≤ 900,000 bytes).
- **T25 timeout + re-queue:** `pilot=1`, no response on the main trial with `attempt_index` 2: "Too Slow!" drawn for `tooSlowMs`
  (± 2 frames); a later attempt has the same `trial_id`, `requeue_count === 1`, `requeued_from === 2`, and it is not the
  immediately next attempt when ≥ 2 trials remained; completed per cell = 2 each; 9 attempts total; block 1 still
  has 4 completed trials.
- **T26 practice fail path:** answer every practice trial wrong → 4 attempts with fresh sequences (not all
  identical), no main trials, terminal POST `status:'practice_failed'`, `complete:true`, and a download.
- **T27 practice pass after fail:** attempt 1 wrong, attempt 2 ≥ 80 % → main task starts; `practice.attempts`
  length 2.
- **T28 manual download + pause:** Ctrl+Shift+S during a trial → a download with `save_reason:'manual'` and the loop
  continues (next phase change still occurs); dispatching `visibilitychange` to hidden aborts the trial
  (`aborted:true`), re-queues it, and shows the pause overlay; [R] resumes.
- **T29 payload schema:** every trial record in the final payload has all §7.2 fields with the stated types and
  nullability (practice records: `implied_direction` null; response fields null iff no response; the §7.2 rt
  invariant; `response_key` canonical); the same check on the terminal payload of a session **quit after a main trial
  was aborted during its adaptor** (`status:'aborted'`, the aborted record has null dots/timing/engine fields); every
  main face-tree trial has `eyes_condition ∈ {open, blindfold}`, `face_direction === 'towards'`, and
  `congruent_gaze === congruent`; session has all §7.3 keys; `config_effective` deep-equals the resolved config.
- **T30 hygiene:** no request leaves the local origin during a full session (Playwright request listener); no file in
  `static/star-inperson/` contains `http://` or `https://` in a `src`/`href`/`import`, `@latest`, `unpkg`, `jsdelivr`,
  `cdnjs`, `googleapis`; no file under `static/star-inperson/js/` > 400 lines; nothing under `static/star/` or `app.py`
  changed (`git diff --stat main -- static/star app.py` empty).
- **T31 fatal image failure:** serving a corrupted `face_blindfold_R.png` (test server option) → error screen, no
  trial runs, no fallback drawing.

Analysis (`test_analysis.py`, synthetic data written to a temp dir)
- **T32** 30 synthetic participants with known per-cell RT means (open +25 ms, blindfold 0 ms, Gaussian trial noise
  σ = 100 ms, seed fixed): script output ΔRT means within 0.5 ms of the values computed directly from the synthetic
  trials; the output contains the §8 table headers verbatim; `p_signflip` exact branch used for N ≤ 20 (check by
  subsetting to 12).
- **T33** Dedupe: the same UUID as `setup`, `block_1`…`final` files plus a local-download copy → counted once, using
  the highest `save_seq`; a UUID with only partial files and no `main_done` is not a participant.
- **T34** Exclusions: a participant answering at random (50 %) is excluded as `chance_accuracy`; a `practice_failed`
  session is excluded; a duplicate `participant_id` keeps the earlier session; a `config_overridden` session is excluded
  unless `--include-overridden`; a participant with < 15 valid RTs in a cell (e.g. every open-congruent trial
  wrong) is excluded as `min_valid_rt_per_cell` and every contrast (main, [A], [B], [C]) then has n = N_included;
  one run with the **production default** (no `--iterations` override) reports `iterations = 10000`.
- **T35** Stats helpers: `p_t(2.89, 23) = 0.0083 ± 0.0002`; `p_normal(1.96) = 0.0500 ± 0.0005`; exact sign-flip on
  `[1,2,3]` gives p = 0.25.

### 10.2 Manual checklist for the experimenter (lab rig, before the first participant and after any change)

1. Chrome, up to date; OS display at native resolution; OS/browser zoom 100 %; monitor refresh ≥ 60 Hz with
   VRR/G-Sync/FreeSync/ProMotion **off**; laptop on mains power; notifications off; room darkened; chinrest at 54 cm
   from the eyes to the screen centre.
2. Measure the lit image width with a tape (0.1 cm). Open `https://schema.backyardbrains.com/star-inperson/?pilot=1`.
3. Setup screen: enter width, distance, ID `PILOT-<initials>`. Note the code fingerprint and version in the lab log.
4. Enter fullscreen. **Ruler check:** the 10-cm bar must measure 100 ± 1 mm; a bank card must fit the outline. If not,
   type the measured mm → Recompute → re-check. Check the refresh estimate matches the monitor (e.g. 59.9–60.1).
5. Run the ~2-minute pilot yourself: fixation dot → head+tree → dots only inside a central square → dots vanish on
   key press; skip one response and confirm "Too Slow!" stays 5 s; see one break; see both an open-eyed and a
   blindfolded head; finish the questionnaire; a JSON appears in Downloads; the server has
   `star-inperson-pilot_<uuid>_*.json` (check `/api/uploads?pattern=star-inperson-pilot`).
6. Press Esc mid-trial once: the pause overlay appears; [R] resumes.
6b. Key test (added 2026-09-30): open `?keytest=1` with the participant's keyboard and answer the 20 prompted arrows;
   it must report **PASS (20/20)** with no missed, wrong or extra keys before any participant. The calibration screen
   blocks "Calibration OK" when the refresh check fails unless "Override refresh warning" is ticked (logged as
   `calibration.refresh_override: true`); never override for a real participant without a passing `?diag=1`.
7. Rig check (recommended before the face study): 2–3 lab members run `?adaptor=grating` (60 trials, ≈ 9 min).
   Expect a clearly positive grating ΔRT (paper +57 ms, p. 3; our online v1.0 bars gave +135 ms). If it is absent,
   stop and debug before running the face study.
8. For real sessions: plain URL (no parameters). The setup screen must show **no orange banner** and the recorded
   fingerprint. After each participant, confirm the end screen says "Saved to server" and the download exists.

---

## 11. Sources, decisions, deviations, open questions

### 11.1 Sources: correspondence

- **Greg → Luca, 2025-09-15 (origin of the 3 interleaved sets):** Roozbeh Kiani (NYU; Shadlen lineage) said "our
  stimulus is wrong. It needs to be smoother, and somehow they interleave 3 star positions over the refresh rate",
  pointing to the Kiani lab RandomDots MATLAB code (link now 404). In that convention dots are split into 3 sets shown
  on successive frames; each set is re-plotted every 3rd frame; coherent dots are displaced by speed x 3 frame
  durations; the others are re-plotted at random locations; density is dots/deg²/**s** (typ. 16.7), so dots per
  frame = density x area / refresh. Our v1.x port mixed conventions (per-frame density x 3 sets, random-direction
  noise dots, per-dot lifetimes, and until v1.9.2 no 3x displacement). → both engines in §4, default the paper's text.
- **Christian Renet (KI; Guterstam's PhD student), 2026-04-28/29:** in-lab 40 % coherence, "50 dots per visual degree
  squared"; no catch trials ("participants have to make a forced choice at the end of each trial anyway"); exclude
  participants not significantly better than chance. Their newer speed study ("revealing the speed of implied motion
  signals") found the aftereffect peaks at ≈ 1.4 °/s for eyes open (and for gratings); at 2.0 °/s eyes-open and
  blindfold looked the same. Geometry in their lab: fixation at screen centre; face+object stimulus centred on the
  screen; the starfield centred on the gaze line (between the agent's eye and the object), so participants fixate
  toward the bottom of the starfield; alternative offered: align the agent's eye with the fixation dot so fixation is
  at the starfield centre. → `gazeLineYDeg` (§1.5), speed default 1.4.
- **Arvid Guterstam, 2026-02-24 (on our online version):** attention to face and tree is crucial; preferred a Bob
  backstory ("Bob is looking for a squirrel in the tree") to "ignore the face and tree"; long lab sessions with many
  conditions weaken the effect, keep 15–20 min and 1–2 conditions; suggested 10–20 % catch trials for *online* use;
  tree height should match head height; on his screen dots were too large, dense and slow (suggested ~15–20 % lower
  density, smaller dots, a bit faster, no frame); blindfold may read as sunglasses online; away-looking face is an
  alternative control. → height matched; session ≤ 20 min; no frame. His framing/catch suggestions were considered
  and not adopted (Greg's decisions, §0); his size/density remarks were about an uncalibrated online screen, which
  this build fixes by calibration.
- **External review of v1.8.6, Greg → Luca 2026-03-13 ("Logic Error caught"):** fixation, adaptor and dots must be one
  continuous canvas state machine; RT zero must be the first frame with dots drawn (at 60 Hz one frame, 16.7 ms, is
  the size of the effect); ppd never set; cue and test in different coordinate systems; recommended an Exp 1 grating
  rig check; median ΔRT and dropped-frame robustness checks; log implied and gaze direction. → §5.2, §2.2, §4.4, §8,
  §7.2. These points were raised in March and were still unfixed in v1.11 (§12).
- **Decided by Greg Gage 2026-09-29:** speed 1.4 °/s default; neutral framing, no Bob option; no catch trials.

### 11.2 What was verified against the primary sources (2026-09-29)

Paper (all 10 PDF pages read, pp. 2, 4, 5, 7 at 200 dpi): every §1.3 value with a page reference; Exp 2 results;
Fig. 3 geometry by pixel measurement; Exp 7 eccentricity sentence. Code: every BRIEF bug claim about
`static/star/index.html` (§12) was checked in the file. Images: pair identity by alpha diff (§3.4). Server: `POST /data`
file naming (`app.py` `receive_data`), nginx serves `static/` directly (`SERVER_ARCHITECTURE.md`).

### 11.3 Disagreements with / corrections to the BRIEF

1. **Head geometry:** BRIEF says head ≈ x −9° to −2.5° and head/tree vertically on the dot-field line
   (y ≈ −2.5…+2.5). Fig. 3 measured: head box x ≈ −7.6…−2.5°; head and tree boxes y ≈ −3.2…+2.5° (5.7° tall,
   top-aligned with the dot field, extending 0.7° lower), matching the Exp 1 grating's 14.7 x 5.7°.
2. **"Typical 1440-px-wide laptop ≈ 36 px/deg":** that holds for a ≈ 38-cm-wide display. A 13" MacBook Air (1440 CSS px
   across ≈ 28.6 cm) at 54 cm gives ≈ 47 px/deg, close to the 50 fallback. The core point stands (uncalibrated;
   every participant's geometry differed), but the error size varied by screen and was not uniformly ~40 %.
3. **Practice feedback:** BRIEF "10 trials with accuracy feedback". The paper says feedback on accuracy was displayed
   *after* the 10-trial session (summary), not per trial. Built as summary only.
4. **Playwright path:** `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` does not exist on this server (variable unset,
   directory absent). Playwright 1.61.1 is global (`/usr/local/lib/node_modules`), browsers in `~/.cache/ms-playwright`
   (default resolution works). Use `NODE_PATH=$(npm root -g)`.
5. **Speed:** the BRIEF follows the paper's 2 °/s; Greg decided 1.4 °/s (§0). This is a deviation from a strict
   Exp 2 replication and must be stated as such in the pre-registration and the book.
6. **Density "take the paper literally":** agreed as the default, but the new correspondence (§11.1) makes the
   Shadlen/Kiani per-second reading plausible, so both engines are built (1,250 vs ≈ 21 dots per frame at 60 Hz — a
   60-fold difference in what participants see).
7. **Scan gaps:** our PDF (Safari print of the Elsevier reader) drops text at two page breaks: after "coherent for 40 %
   of dots;" (PDF p. 2, likely the response-key sentence) and before "achieve a power of 0.8" (PDF p. 3, the power
   analysis). The BRIEF's "left/right key" is therefore inferred, not read. Get a clean copy.
8. All other BRIEF paper claims checked out (timings, sizes, 32 recruited / 8 excluded / 24 analysed, results,
   re-queue, 4 practice attempts, 120 trials in 6 x 20, instructions, questionnaire, ≈ 39.7 px/deg).

### 11.4 Deviations list

See §1.4 (D1–D12). In addition: Chrome/rAF instead of Psychtoolbox; Fisher–Yates full-session randomisation (paper
"random order", no constraints stated); summary-only practice feedback; our questionnaire wording.

### 11.5 Open questions (for Greg; items 1–5 are best sent to Arvid Guterstam / Christian Renet)

1. **Which RDK algorithm and density unit did the 2020 lab code use?** Per-frame 50 dots/deg² (1,250 dots) or
   Shadlen/Kiani 50 (or 16.7) dots/deg²/s with 3 interleaved sets and random-position noise? Engine switch is ready
   (`?engine=shadlen`). Ask Guterstam/Renet for the stimulus code.
2. **Speed:** citation and effect sizes for Renet's speed study; confirm 1.4 °/s is the right choice for the book's
   "replication" framing (a 2.0 °/s run is `?dotSpeedDegPerSec=2`, flagged as overridden — if Greg wants a second
   pre-registered arm, make it a separate `experimentName`).
3. **Eye height in 2020 Exp 2:** where was the head's eye relative to fixation and the dot field? Fig. 3 boxes vs
   Renet's current-lab description disagree. We place the eye on the fixation line (`gazeLineYDeg = 0`).
4. **Original head and tree drawings** (would remove deviation D6).
5. **Background luminance** (cd/m²) and **grating contrast**; whether practice included the adaptor.
6. **N and stopping rule** (§9): choose A/B/C; recommendation B (N = 32 included, 120 trials).
7. **RT floor:** the paper states none; we keep the April pipeline's > 200 ms. Pre-register it.
8. **Upload size limit:** nginx's default `client_max_body_size` is 1 MB and the schema server block sets none, yet
   11 MB `bff_*` uploads exist, so something else may raise it. The build caps payloads at 900 KB (§7.4) either way;
   confirm with a real POST during the manual pilot (§10.2 step 5).
9. **Response keys** (lost in our scan): arrow keys assumed.
10. **Chinrest availability** in the lab (D11).

---

## 12. Bugs in v1.11 (`static/star/index.html`) and how this build fixes them

All checked in the file on 2026-09-29. "History" = when first raised.

| # | Bug in v1.11 (verified) | History | Fix here |
|---|---|---|---|
| B1 | `let pixelsPerDegree = null` is never assigned; every size/speed uses the 50 px/° fallback; `monitorWidthCm = 38` / `viewingDistanceCm = 54` only logged | Raised 2026-03-13 review; unfixed in v1.11; BRIEF 2026-09-29 | §2.2 calibration + ruler check; T9, T15 |
| B2 | Face/tree are `<img>` in a `60vw` flexbox; dots on a fixed 800x800 canvas — two coordinate systems, geometry changes with window width | Raised 2026-03-13; unfixed | one canvas, all in degrees (§2.2, §1.5); T18 |
| B3 | `top: 30px` ("SHIFTED UP ABOVE MIDLINE") moves the face *down*; RDK moved *up* 30 px; metadata says `facePositionRelativeToFixation: "above"` | BRIEF 2026-09-29 | explicit `gazeLineYDeg`, geometry logged from the draw math; T18 |
| B4 | SVG fallback face has no blindfold → silent open eyes on blindfold trials; image shown per trial not logged | BRIEF | fatal on load/hash failure, `face_img` + `adaptor_images_drawn` per trial; T19, T31 |
| B5 | Catch face `*Green.png` is open-eyed even in blindfold runs | BRIEF | no catch trials (Greg) |
| B6 | Stimuli from `raw.githubusercontent.com/.../main/...` (mutable); blindfold from a different file family pinned to an old commit | BRIEF | local byte copies with SHA-256 check (§3.4); T17, T30 |
| B7 | jsPsych + plugins `@latest` from unpkg; Bootstrap from CDN | BRIEF | no third-party code; T30 |
| B8 | 3 interleaved sets (not in paper; Shadlen port with mixed conventions); speed 1/3 through v1.8.6 | April report; 2025-09-15 Kiani origin | `guterstam2020` engine without interleave; correct `shadlen` engine; T10–T16 |
| B9 | RT measured by jsPsych from trial load, not from the first frame with dots; adaptor→test is a DOM/trial swap | Raised 2026-03-13; unfixed | single rAF state machine, RT from first dots frame (§5.2–5.3); T23 |
| B10 | Timeouts not re-queued; "Too Slow" 1.5 s (paper 5 s) | BRIEF | §5.5; T25 |
| B11 | Data uploaded only at the end; practice failure calls `endExperiment` without saving | BRIEF | cumulative saves at each block + terminal saves + local download + localStorage (§7.4); T24, T26 |
| B12 | Prolific ID prompt, "58 % chance" rejection warning, low-accuracy "return the study" screen after trial 15, Bob story, green catch instructions | BRIEF; April "narrative" note | removed; neutral paper text (§6) |
| B13 | Practice sequence generated once (same directions every attempt); 3 attempts instead of 4 | BRIEF | fresh balanced sequence per attempt, 4 attempts; T8, T26 |
| B14 | No commit hash; `file_version` lagged `experiment_version` in v1.6 | April report; BRIEF | `experimentVersion` + runtime `code_fingerprint` (§3.5) |
| B15 | Congruency only relative to face side; gaze direction not separately logged for away designs | 2026-03-13 review; BRIEF | `implied_direction`, `gaze_direction`, `congruent_gaze` (§7.2) |
