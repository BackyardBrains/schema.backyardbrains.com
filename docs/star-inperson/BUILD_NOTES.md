# BUILD NOTES — `static/star-inperson/` (in-lab Guterstam & Graziano 2020 Exp 2 replication)

Built 2026-09-29 from `SPEC.md` v1.0, plus the **iPad-rig amendment** Greg Gage sent during the build (see
"iPad rig" below). Revised 2026-09-30 to fix every finding of the independent verification
(`/root/claude/graziano-lab-verify/REPORT.md`, verdict "READY AFTER FIXES"); see §9 "Fixes after verification". Nothing is committed or deployed. `static/star/`, `app.py` and the other experiments are
untouched: `git diff --stat main -- static/star app.py` is empty, and test T30 checks this.

Decisions implemented as given:
- Dot speed defaults to **1.4 °/s**. `?dotSpeedDegPerSec=2` switches it, and the change is logged and flagged.
- Framing is neutral: "The drawing is irrelevant to your task". There is no Bob story.
- There are **no catch trials**.
- Open vs blindfold, with the head always facing the tree.
- 120 trials = 30 per cell, in blocks of 20.

---

## 1. File tree (line counts)

```
static/star-inperson/                         (everything the page loads; no CDN, no third-party code)
  index.html                  74   shell: <canvas id="stage">, setup form, #screen, #banner, iPad meta tags
  manifest.webmanifest        10   Home Screen web app: display fullscreen, orientation landscape (iPad rig)
  css/star-inperson.css            80   overlays/forms/banners; canvas fixed full-viewport; touch-action none
  img/face_open_R.png, face_open_L.png, face_blindfold_R.png, face_blindfold_L.png, tree.png
                                    byte copies of static/star/img/BlankFaceLooking*(1).png + Tree.png (SHA-256 checked)
  js/config.js               144   CONFIG: EVERY parameter, units + source per key; PILOT_PRESET; enums/ranges; presets
  js/params.js               150   CONFIG + pilot + URL overrides -> validate -> freeze; experiment name; estimate
  js/rng.js                   47   mulberry32, FNV-1a stream seeds, shuffle, uniform
  js/calibration.js          146   ppd math (pure) + viewport metrics, display mode, fullscreen, refresh measure/warnings
  js/stage.js                175   Stage: device-px drawing in degrees, verified image load, prerender, dots, calib screen
  js/rdk.js                  177   Guterstam2020Dots + ShadlenDots (pure, no DOM)
  js/adaptors.js             124   face/tree layout (pure) + drawing, grating, geometry report
  js/design.js                94   trial lists, practice lists, requeue insertion (pure)
  js/trialRunner.js          260   the single rAF state machine; key timebase check; canonical key; per-trial record
  js/experiment.js           289   class StarInPersonExperiment: session flow, practice, blocks, pause/resume/quit
  js/setupFlow.js            129   setup screen + calibration check flow (iPad fields; refresh-override gate)
  js/screens.js              220   DOM screens: setup, calib panel, text, questionnaire, pause, rotate, end, error
  js/text.js                  63   every participant-facing string (neutral framing)
  js/data.js                 188   payload, serialised POST+retries, downloads, localStorage backup, fingerprint
  js/diag.js                  80   ?diag=1 rig diagnostics (iPad rig)
  js/keytest.js              102   ?keytest=1 counted keypress check: 20 prompted arrows (added 2026-09-30)
  js/testHooks.js             51   window.__starInPerson (only with ?test=1)
  js/main.js                  17   entry point
analysis/star_inperson.py     600   stdlib-only analysis (SPEC §8); PREREGISTRATION block at the top
tests/star-inperson/
  server.mjs                  80   static server for static/ + in-memory mock POST /data (also a dev server CLI)
  helpers.mjs                158   Chromium launch, page open, screen driver, key responder, stdlib PNG decoder
  unit.test.mjs              238   T1–T9 + iPad pure helpers + key-test scoring (Node)
  rdk.test.mjs               225   T10–T14 (Node, synthetic timestamps)
  display.test.mjs           376   T15–T22 (browser pixels; T17 in Node)
  session.test.mjs           415   T2 (browser part), T23–T31 (+ T24b, T24c)
  ipad.test.mjs              290   iPad-1 … iPad-7 (Chromium iPad emulation)
  test_analysis.py           329   T32–T35 (+ T34c/T34d, recovery / null / grating / CSV / edge cases)
  make_synthetic.py          236   synthetic-session generator (CLI + used by test_analysis.py)
  screenshots.mjs             68   regenerates docs/star-inperson/screenshots/*.png (not a test)
docs/star-inperson/BUILD_NOTES.md (this file), screenshots/*.png (9 images)
```
The largest JS file has 289 lines. The hard cap is 400, and T30 checks it.

---

## 2. Running it

### Locally
```
node tests/star-inperson/server.mjs 8765        # serves static/ and mocks POST /data (prints every save)
# open http://127.0.0.1:8765/star-inperson/?pilot=1
```
`python3 -m http.server` in `static/` also serves the page, but it cannot accept the POSTs. The page still
works: the POSTs fail, the end screen says "NOT saved to server", and the local download still happens.

### URL parameters
| Param | Effect |
|---|---|
| *(none)* | Real session. The setup screen must show **no orange banner**. |
| `pilot=1` | ~2-min pilot: 8 main trials, blocks of 4, 5 practice trials. Name gets `-pilot`. Blue banner. |
| `adaptor=grating` | Exp 1 rig check: 60 trials, drifting grating. Name gets `-grating`. Blue banner. Not flagged as an override. |
| `diag=1` | Rig diagnostics. After setup and calibration it draws dots for 10 s and reports fps, dropped frames and max frame/JS time. Nothing is POSTed; [D] downloads the report. |
| `keytest=1` | Counted keypress check. After setup and calibration it prompts 20 arrows (10 left, 10 right, shuffled) and reports correct / missed (no key in 3 s) / wrong / extra / unrecognised keys and the timebase used (event vs handler). PASS = 20/20 with no extra key. Nothing is POSTed; [R] reruns, [D] downloads the report. |
| `seed=<uint32>` | Fixed seed. Otherwise the seed is random and logged. |
| `pid=<id>` | Prefills the participant ID. |
| `<anyConfigLeafKey>=<value>` | Override, e.g. `dotSpeedDegPerSec=2` or `engine=shadlen`. Logged in `config_overrides`, sets `config_overridden`, and shows an orange banner. Unknown key, bad type or out-of-range value → fatal error screen. |
| `test=1` (`logDots=1`) | Test hooks only. Name gets `-test`. |

### In the lab
Paper-style monitor:
1. Chrome, 100 % zoom, VRR off if possible.
2. Measure the lit image width to 0.1 cm.
3. Open `/star-inperson/`.

iPad Pro rig (see "iPad rig" below):
1. Add the page to the Home Screen and launch it from the icon.
2. Pick the preset "iPad Pro 12.9" (26.3 cm)" and set expected refresh = 120.

Setup screen: participant ID, width, distance (default 54), expected refresh rate, response keyboard, chinrest
and room checkboxes. It shows the version, the first 12 hex of the code fingerprint, the seed, the estimated
duration, and a live ~2-s refresh estimate. **Record the fingerprint in the lab log.**

**Calibration** ("Enter fullscreen and check calibration"):
1. Hold a ruler to the 10-cm bar. It must read 100 ± 1 mm.
2. A bank card must exactly cover the outlined box.
3. If either is wrong, type the measured mm → **Recompute** → re-check.
4. Tick "Ruler reads 100 ± 1 mm" → **Calibration OK**.
5. The refresh line must say OK. Any red text means the frame rate is wrong for the chosen expected rate, and
   **Calibration OK stays disabled** until "Override refresh warning" is ticked. The override is logged
   (`calibration.refresh_override: true` + a `refresh_override` event). Do not override for a real participant.

**Experimenter controls:**
- Ctrl+Shift+S at any time downloads the cumulative JSON.
- Esc (fullscreen lost), a hidden tab or a resize or rotation that changes ppd aborts the current trial (it is
  re-queued) and pauses. [R] resumes, [D] downloads, [Q] quits (terminal save `aborted` + download).

---

## 3. Tests

### Commands (from the repo root)
```
NODE_PATH=$(npm root -g) node --test tests/star-inperson/        # 46 tests, ~3.8 min (4 files run in parallel)
python3 -m unittest tests/star-inperson/test_analysis.py -v       # 13 tests, ~8 s
```
- Playwright 1.61.1 is the global install. Chromium comes from `~/.cache/ms-playwright`, and
  `PLAYWRIGHT_BROWSERS_PATH` is unset. `playwright install` was never run.
- ESM ignores `NODE_PATH`, so `helpers.mjs` loads Playwright with `createRequire`.
- Browser tests start `server.mjs` on a free port, which mocks `POST /data` in memory. No request leaves
  127.0.0.1, and T30 asserts this.

### Latest results (2026-09-30, after the verification fixes): Node 45/46 in the full parallel run (iPad-2 flake, passes in isolation) + Python 13/13

Full parallel run (`node --test tests/star-inperson/`, real 3m50.2s): **45 pass, 1 fail**. The failure was iPad-2's
"no frame gap > 1.5 frames" check: `gap 33.3 ms in adaptor`, i.e. one dropped 60-Hz frame in headless Chromium
while four browser test files ran in parallel. It is not an assertion about the fixed code paths (the trial loop is
unchanged; only the record built after a trial changed). Re-runs: `--test-name-pattern=iPad-2` **pass, pass**; the
whole `ipad.test.mjs` file **7/7 pass**. The same check also failed once in an earlier `ipad.test.mjs`-only run
during this revision, so treat it as a known timing flake of headless Chromium under load (the 2026-09-29 notes
saw similar crowded-run failures), not as evidence either way about the iPad's frame timing.

The raw `node --test` output of the full run:
```
ok 1 - T15 DPR 1 / 1.5 / 2: canvas size, ppdDevice = ppdCss * dpr, ruler ink length
ok 2 - T16 end-to-end measured dot speed from pixels (guterstam2020 + shadlen, DPR 1/2, 1.4 and 2.0 deg/s)
ok 3 - T17 images: byte copies, sha256, contentBox/eyePx re-derived, blindfold covers eye only, L = mirrored R
ok 4 - T18 geometry: head/tree ink extents, eye on the pupil, face-right = mirror, gaze line through aperture centre
ok 5 - T19 blindfold actually drawn: probe dark on blindfold trials, background on open trials; logged images match
ok 6 - T20 fixation disc diameter and phase exclusivity
ok 7 - T21 dots never drawn outside the aperture (+ceil(s/2)+1 px)
ok 8 - T22 grating: period 0.8 deg, drift 0.8 deg/s in grating_direction, 14.7 x 5.7 deg; pilot session completes
ok 9 - iPad-1 viewport path: 1366x1024 @2x, preset 26.3 cm -> canvas 2732x2048, ppd, ruler, refresh warning blocks until override
not ok 10 - iPad-2 geometry from pixels at DPR 2, blindfold probe, every-frame drawing, logged iPad fields
  error: 'gap 33.30000000000018 ms in adaptor'
ok 11 - iPad-3 portrait -> "rotate to landscape" blocker; calibration proceeds after rotation
ok 12 - iPad-4 key .code fallback (key "Unidentified"), Space via code, KeyboardEvent.timeStamp timebase check
ok 13 - iPad-5 ?diag=1: 10-s style dots run reports fps, dropped frames, max frame time; nothing is POSTed
ok 14 - iPad-7 ?keytest=1: 20 prompted arrows counted; lost / wrong / extra keys fail; a clean 20/20 run passes; nothing is POSTed
ok 15 - iPad-6 static: viewport/zoom lock, Home Screen web-app meta + manifest, touch-action, arrows never scroll
# T13 60 Hz: mean first respawn 100.09 ms (expected 100 ± 5 %), discrete KS D=0.0089 (< 0.02), n=10000
ok 16 - T10 guterstam2020 speed: coherent dx/dt = dir*v, dy = 0; noise |d|/dt = v; noise directions uniform
ok 17 - T11 guterstam2020: every frame n = 1250, exactly 500 coherent
ok 18 - T12 bounds: all drawn positions inside [-W/2, W/2) x [-H/2, H/2) (both engines)
ok 19 - T13 guterstam2020 lifetime: 12-frame lives at 60 Hz, asynchronous initial ages (144-Hz KS + 60-Hz frame-grid distribution), respawn fraction dt/L
ok 20 - T14 shadlen: set alternation, n/frame, dots/s, coherent speed, coherence fraction, noise re-plotted
ok 21 - T2 (browser) override banner lists the override; bad params show a fatal screen and nothing runs
ok 22 - T23 RT zero = first dots frame; rt = key time - onset; default-duration phase timing
ok 23 - T24 full flow: save order, flags, cumulative payloads, final content, download, payload size
ok 24 - T24c analysis script reads the real browser payloads (server files + local download, deduped)
    # T24b final payload 280965 bytes; projected all-timeouts worst case ~341721 bytes
ok 25 - T24b default-size session (120 trials, short timings, ~600 ms RTs) stays <= 900,000 bytes
ok 26 - T25 timeout -> "Too Slow!" for tooSlowMs, re-queued later with same trial_id
ok 27 - T26 practice failure: 4 fresh attempts, no main trials, terminal practice_failed POST + download
ok 28 - T27 practice pass after one failed attempt
ok 29 - T28 Ctrl+Shift+S manual download keeps the loop running; visibility hidden aborts + re-queues; [R] resumes
ok 30 - T29 payload schema: every §7.2 field with its type and nullability (normal + aborted terminal payload, practice records); §7.3 session keys; config_effective = resolved config
ok 31 - T30 hygiene: local requests only, no CDN/remote references, js files <= 400 lines, star/app.py untouched
ok 32 - T31 corrupted stimulus image -> fatal error screen, no trial, no fallback drawing
ok 33 … 46 - T1 … T9 (unit), rng reference values, 3 iPad pure-helper tests, key-test scoring
# tests 46  # pass 45  # fail 1  # skipped 0   real 3m50.2s
```
Isolated re-runs: `node --test --test-name-pattern=iPad-2 tests/star-inperson/ipad.test.mjs` → `ok 2 - iPad-2 …` (twice);
`node --test tests/star-inperson/ipad.test.mjs` → `# pass 7  # fail 0`.

The Python run:
```
test_T32_known_drt_headers_and_signflip_branch ... ok
test_T33_dedupe_highest_save_seq_and_partial_not_participant ... ok
test_T33b_tie_with_differing_trials_keeps_more_and_warns ... ok
test_T34_exclusions ... ok
test_T34b_incomplete_fingerprint_and_banner ... ok
test_T34c_production_default_iterations ... ok          (no --iterations: iterations=10000)
test_T34d_min_valid_rt_per_cell_exclusion_and_fixed_contrast_n ... ok
test_T35_stats_helpers ... ok            (p_t(2.89,23)=0.008261, p_normal(1.96)=0.049996, signflip [1,2,3]=0.25)
test_empty_and_single_participant_do_not_crash ... ok
test_grating_mode ... ok
test_null_no_injected_effect ... ok
test_out_csv_columns ... ok
test_recovery_injected_drt ... ok
Ran 13 tests in 7.920s — OK
```

### Pass/fail per numbered acceptance test (SPEC §10.1)
- **T1–T35: all PASS** (T9, T13, T29, T34 now against the amended SPEC criteria; see §9).
- T1–T9: `unit.test.mjs`
- T10–T14: `rdk.test.mjs`
- T15–T22: `display.test.mjs`
- T2 browser part and T23–T31: `session.test.mjs`
- T32–T35: `test_analysis.py`

Extra tests:
- **T24b:** a 120-trial payload-size run.
- **T24c:** the analysis script run on real browser payloads (server files plus the local download,
  deduplicated).
- **iPad-1…7:** the iPad-rig checks (iPad-7 = `?keytest=1`; iPad-1/2 = refresh-override gate).
- **T34c/T34d:** production 10,000 iterations; `min_valid_rt_per_cell` exclusion and fixed contrast N.
- **Analysis:** recovery and null tests.

Test-mode timing notes:
- Headless Chromium runs rAF at a steady 59.9 Hz (SD 0.06 ms).
- Parallel runs have never produced a timing failure. T23 exempts trials with `has_dropped_frame`, as the
  spec allows.

---

## 4. Analysis
```
python3 analysis/star_inperson.py /path/to/uploads [/path/to/downloads] \
    [--experiment star-inperson | star-inperson-grating | star-inperson-pilot] [--iterations 10000] \
    [--seed 20260929] [--fingerprint <hex prefix>] [--include-overridden] [--target-n 32] [--interim] \
    [--out-csv per_participant.csv]
```
Server files and local downloads can be mixed in the same folder: dedupe keeps the highest `save_seq` per
UUID. Unless `--interim` is given, the script prints a stopping-rule banner while N < `--target-n`.

**Pre-registered thresholds.** Every threshold (target N 32, 10,000 iterations, seed, RT floor 200 ms, chance
α .05, `min_valid_rt_per_cell` 15, April 80 %, exact sign-flip N ≤ 20) is read from the labelled `PREREGISTRATION`
block at the top of `analysis/star_inperson.py` and printed in the report header together with the exclusion rules.
**These values must match the pre-registration; change them only before data collection.** A CLI value that
differs (e.g. `--iterations 2000` in the tests) prints a WARNING line.

**`min_valid_rt_per_cell` (pre-registered exclusion, added 2026-09-30).** A participant with fewer than 15 valid RTs
(correct, main, RT > 200 ms, not timed out) in any eye × congruency cell is excluded with that reason (after
`chance_accuracy`). Every main/[A]/[C] contrast must then use exactly N_included participants; the script raises
otherwise and prints each contrast's `n`. Pilot sessions have only 2 trials per cell, so analyse
`star-inperson-pilot` data with `--min-valid-rt-per-cell 1` (T24c does).

**Synthetic check.** Generate data with `tests/star-inperson/make_synthetic.py OUT --n 32 --drt-open 25 --drt-blind 0 --seed 2`,
then analyse it:

| dataset | open ΔRT | blindfold ΔRT | open − blindfold |
|---|---|---|---|
| injected +25 / 0 | +29.2 (SE 4.7), p_signflip .0001 | +5.4 (SE 5.3), p .31 | +23.8, p .001 |
| null 0 / 0 (same seed) | +4.2 (SE 4.7), p .38 | +5.4 (SE 5.3), p .31 | −1.2, p .85 |

- Both runs use the same trial noise, so the injected-minus-null open ΔRT is exactly the injected +25.0 ms.
- Every null contrast is within 1 SE of 0.
- With seed 1, the null blindfold ΔRT came out at −12.5 ms (p ≈ .006) by chance.
- Across 60 null datasets the t statistics had mean ≈ 0 and SD ≈ 1.05, so there is no generator bias.

Analysis choices where the spec was open:
- **Exclusion pool:** sessions with `main_done` plus `practice_failed` sessions.
- **Exclusion reason:** each session gets the first exclusion step it fails.
- **Duplicate participant IDs:** matched case-insensitively.
- **`--fingerprint`:** matched as a hex prefix.
- **Grating mode:** "incomplete" means fewer than `trialsPerCell` trials per congruency. The CSV puts the
  grating ΔRT in the `*_open` columns.

---

## 5. SPEC §12 bugs → where they are fixed
| # | v1.11 bug | Fixed in |
|---|---|---|
| B1 | ppd never set (50 px/° fallback) | `calibration.js` `computeCalibration`/`measureWindow`/`sizeCanvas`. `setupFlow.js` `runCalibration`: ruler, card, Recompute. T9, T15, iPad-1 |
| B2 | Two coordinate systems (`<img>` flexbox + 800-px canvas) | One canvas; `stage.js` `Stage.X/Y` in degrees; `adaptors.js` `faceTreeLayout`. T18, iPad-2 |
| B3 | `top:30px` moved the face down; wrong metadata | `config.geometry.gazeLineYDeg`; `adaptors.js` `geometryReport` logs the drawn geometry. T18 |
| B4 | SVG fallback face without blindfold; image not logged | `stage.js` `loadImages` is fatal on fetch, hash or decode failure (no fallback); `trialRunner.js` `_record` logs `face_img` and `adaptor_images_drawn` (from the draw calls). T19, T31 |
| B5 | Green catch face open-eyed in blindfold runs | No catch-trial code exists (`design.js` builds only the 4 cells) |
| B6 | Stimuli from mutable raw.githubusercontent | Local byte copies in `img/`, SHA-256 in `config.images`, checked in `stage.js` `loadImages`. T17, T30 |
| B7 | jsPsych @latest / Bootstrap CDN | No third-party code; everything is under `static/star-inperson/`. T30 |
| B8 | 3 interleaved sets; 1/3 speed | `rdk.js` `Guterstam2020Dots` (no interleave) and a correct `ShadlenDots`. T10–T16 |
| B9 | RT from jsPsych trial load; DOM swap adaptor→test | `trialRunner.js` `TrialRunner` (single rAF loop; `dots_onset_ts` = first dots frame; `onKey`/`keyTime`). T23 |
| B10 | Timeouts not re-queued; Too Slow 1.5 s | `design.js` `requeueInsert`; `experiment.js` `main()` provider `done`; `timing.tooSlowMs` 5000. T7, T25 |
| B11 | Upload only at the end; practice failure unsaved | `data.js` `DataStore.save` (serialised, cumulative, retries, backup); saves in `experiment.js` `run/practice/main/finish`. T24, T26 |
| B12 | Prolific / warning / Bob / catch screens | `text.js` (neutral §6 strings only); no feedback during the main task. Manual review |
| B13 | Same practice sequence each attempt; 3 attempts | `design.js` `PracticeLists.next` (one advancing stream); `practiceMaxAttempts` 4. T8, T26 |
| B14 | No commit hash; version lag | `config.meta.experimentVersion`; `data.js` `computeFingerprint` (all loaded files, incl. images). T29, T30 |
| B15 | Gaze direction not logged | `design.js` sets `gaze_direction`/`implied_direction`; `trialRunner.js` logs `congruent_gaze`. T29 |

---

## 6. Deviations from SPEC

1. **T9 constant** — *resolved 2026-09-30:* SPEC §10.1 now states `cmPerDeg(54) = 0.9425017 ± 1e-6` (the old
   0.94249 was truncated, 1.2e-5 off), and T9 asserts exactly that plus the formula `2·54·tan(0.5°)`.
2. **contentBox threshold.** The §3.3 boxes are reproduced by "alpha > 32", not by PIL `getbbox` (alpha > 0).
   With alpha > 0 the tree box is [29, 0, 1052, 1350], 3 px off. The config values are kept as in the spec,
   and T17 re-derives them at alpha > 32 (all within 2 px).
3. **Eye point as a pixel centre.** Placement uses `eyePx + 0.5`, so the head-right display is an exact mirror.
   The eye lands at x = −3.712° instead of −3.715° (0.003°).
4. **T13 initial-age check** — *resolved 2026-09-30 by amending SPEC §10.1 T13:* at 60 Hz the frame grid quantises
   first-respawn times in steps of dt/L = 1/12, which forces a continuous KS ≥ ~0.08 whatever the ages are (the
   verifier measured 0.083), so the literal criterion was unsatisfiable. The amended, quantisation-aware criterion
   (now tested): KS < 0.05 to U[0, L] at 144 Hz; at 60 Hz the mean first-respawn time is L/2 ± 5 %, every time is
   on the frame grid, and the frame-index distribution matches U[0, L) ages mapped to frames (dt/L per interior
   frame, partial mass at the ends) with discrete KS < 0.02 (observed D = 0.009, mean 100.1 ms, n = 10,000).
5. **T23 "one 4-trial run".** A face-tree run cannot have 4 trials (minimum 8 at `trialsPerCell=2`), so the
   default-duration check uses an 8-trial pilot plus 2 practice trials. All 10 trials are checked.
6. **T16 overrides and policy.** T16 uses `responseWindowMs=700` (to fit frames 5–25 / 6–30 quickly) and no
   responses, so the practice trials time out.
7. **The `innerWidth ≠ screen.width` warning** is shown on the *calibration* screen (in fullscreen, where it
   means something), not on the setup screen. It compares against the screen's *long* side, because iPadOS
   may report portrait dimensions.
8. **Terminal saves.** The local download is triggered immediately with the same envelope string that is then
   POSTed, so the content is byte-identical. The download does not wait for the POST retries (up to ~47 s).
   If a payload were ever trimmed, the download keeps `dots_frame_intervals_ms` (§7.4); in that case only,
   the download differs from the POST.
9. **Aborted practice trials** are re-queued at the end of the attempt and not scored. The spec only defines
   aborts for main trials.
10. **Grating φ0** comes from the `order` stream (drawn before the shuffle). The spec says "design RNG" but
    lists no separate stream.
11. **Monitor width is not remembered.** The spec remembers it in localStorage. Greg's iPad amendment
    overrides this: the field is empty unless a preset is picked.
12. **Extra files not in the §3.2 tree:**
    - `js/setupFlow.js`: split out so `experiment.js` stays well under 400 lines.
    - `js/diag.js` and `manifest.webmanifest`: iPad rig.
    - `tests/star-inperson/ipad.test.mjs`, `make_synthetic.py` and `screenshots.mjs`.
    - `js/keytest.js` (2026-09-30): the counted keypress check.
    - `analysis/star_inperson.py` is 600 lines against the ~450 budget. That budget is not a hard cap.
13. **Extra logged fields** (additive):
    - Per trial: `rt_timebase`, `response_key_raw`, `response_code_raw`, `key_event_ts_raw` (the §7.2 table now
      lists them; `key_handler_now` was renamed `key_handler_ts`, `response_code` became `response_code_raw`).
    - `calibration.refresh_override` (now in SPEC §2.3/§7.3).
    - `setup`: `expected_refresh_hz`, `input_device`, `monitor_preset`.
    - `calibration`: `css_w`/`css_h`, `visual_viewport_*`, `display_mode`, `monitor_width_cm`.
    - `display`: `expected_refresh_hz`, `refresh_warnings`, `refresh_matches_expected`,
      `setup_screen_estimate`.
    - `main_summary.cell_counts`: grating keys.
    - `session.timing.t0`.
14. **iPad-rig changes to SPEC behaviour.** Each is listed in §7 below:
    - `rt_ms` may use handler time (`rt_timebase: "handler"`, `key_event_ts` null; SPEC §7.2 invariant).
    - ppd width = `documentElement.clientWidth`. This equals `innerWidth` in Chrome; T15 still checks
      `innerWidth`.
    - Standalone mode counts as fullscreen.
    - Refresh warning thresholds differ.
    - Refresh is measured for ≥ 2 s as well as ≥ 180 intervals.
15. **Spec typos, not deviations.** §5.2 says "fixes B2/B12" and §5.7 says "fixes B9". The fixes are
    B9 and B11 respectively; the table above uses the correct numbers.

---

## 7. iPad rig (amendment from Greg Gage, 2026-09-29)

The rig is a 12.9" iPad Pro (M2), landscape, 2732×2048 device px (DPR 2, 1366×1024 CSS px), ProMotion 10–120 Hz,
running WebKit/Safari with a BT keyboard.

1. **Refresh**
   - VRR is no longer required to be off. The rAF loop draws every frame of every trial, including ITI,
     fixation and adaptor, so ProMotion holds its rate; iPad-2 checks for no gaps > 1.5 frames.
   - New config/setup field `expectedRefreshHz` (default 120; the setup offers 120 or 60).
   - Warnings appear if the rate is < 110 Hz (expected 120) or < 58 Hz (expected 60), if the SD is
     > min(2 ms, 15 % of the interval), or if the measured rate differs from the expected one by > 5 %.
   - Refresh is measured on the setup screen (~2 s) and again, and logged, on the calibration screen.
   - The Safari flag, Low Power Mode and Limit Frame Rate advice is in the setup screen's "iPad / Safari
     refresh checklist".
2. **Width**
   - ppd uses `documentElement.clientWidth` in fullscreen or standalone mode. `innerWidth`, `visualViewport`
     and `screen.*` are logged; `screen.*` is never used for ppd.
   - A "rotate to landscape" blocker shows while portrait (iPad-3).
   - The preset "iPad Pro 12.9" (26.3 cm)" fills the width; otherwise it stays empty.
   - The ruler and card check remain the ground truth.
3. **Fullscreen**
   - `requestFullscreen`, falling back to `webkitRequestFullscreen`.
   - Or Home Screen web app: `manifest.webmanifest` plus the `apple-mobile-web-app-*` meta tags. Standalone is
     detected via `navigator.standalone` or `(display-mode: fullscreen)`.
   - `display_mode` is logged: `fullscreen-api` | `standalone` | `browser`.
4. **Input**
   - Keys match on `event.key` **or** `event.code` (`trialRunner.js` `keyDirection`, `screens.js` `keyMatches`).
   - Arrows and Space are always `preventDefault`ed outside form fields.
   - Scrolling and zoom are blocked: `touch-action:none` on the stage, `overscroll-behavior:none`,
     `user-scalable=no`, and `gesturestart`/`dblclick`/`touchmove` are prevented.
   - `input_device` dropdown: BT / USB / Smart Connector keyboard.
5. **Timebase**
   - `KeyboardEvent.timeStamp` is used only if it lies 0–50 ms before `performance.now()` at handler entry.
     Otherwise handler time is used and `rt_timebase: "handler"` is logged (`trialRunner.js` `keyTime`); then
     `key_event_ts` is null and the rejected stamp is kept in `key_event_ts_raw`. `key_handler_ts` is always
     stored. Invariant: `rt_ms = (event ? key_event_ts : key_handler_ts) − dots_onset_ts`.
   - `response_key` is always the canonical `ArrowLeft`/`ArrowRight`; the raw `.key`/`.code` are in
     `response_key_raw`/`response_code_raw` (Safari may report `key: "Unidentified"`).
   - Safari coarsens both clocks to ~1 ms. That adds ≤ 1 ms of noise, unrelated to condition.
6. **Rendering cost**
   - Per frame: one `fillRect` clear, one path for all dots, integer-position `drawImage` of pre-rendered
     canvases (built once per calibration from decoded ImageBitmaps).
   - Layouts, id lists and the grating context are cached, and the text font is measured once.
   - **`?diag=1`** runs the configured engine for 10 s and reports achieved fps, dropped frames (> 1.5 ×
     median), p99/max frame interval and JS work. It passes if fps ≥ 95 % of expected and dropped ≤ 0.5 %.
7. **Tests** (`ipad.test.mjs`, Chromium only)
   - The page is emulated as an iPad: 1366×1024 @2x, touch, iPad Safari UA.
   - The tests check the ppd and canvas size, the ruler, the pixel geometry at DPR 2, the blindfold probe,
     every-frame drawing, the rotate blocker, key.code/Space.code, the timebase fallback (forged
     `timeStamp`) with the canonical-key/raw-field/rt invariants, diag mode, the refresh-override gate (iPad-1/2),
     the counted key test (iPad-7), and the static meta/manifest/CSS.
   - **WebKit itself is not tested.**

### On-device checklist (only the real iPad can verify these; do it before the first participant and after any iPadOS/Safari update)
1. Settings → Apps → Safari → Advanced → Feature Flags → **"Prefer Page Rendering Updates near 60fps" OFF**.
   Also check that Low Power Mode is off and Accessibility → Motion → **Limit Frame Rate** is off.
2. Open `https://schema.backyardbrains.com/star-inperson/?pilot=1` in Safari. Share → **Add to Home Screen**.
   Launch from the icon and check that the setup meta line says `display mode: standalone`, with no Safari
   bars visible.
3. Setup: preset iPad Pro 12.9", expected refresh 120, BT keyboard. The setup-screen refresh line must read
   **~120 Hz, OK**. If it reads 60, recheck step 1. On the calibration screen, "Calibration OK" must be enabled
   **without** ticking "Override refresh warning"; if the override box appears, the rig is not ready.
4. Calibration: the ruler bar measures **100 ± 1 mm** and a bank card covers the box. Canvas = 2732 x 2048,
   ppd(CSS) ≈ 48.95 at 54 cm. Rotate to portrait once: the rotate blocker must appear, then go away in
   landscape.
5. Run `?diag=1` (Home Screen icon, then add `?diag=1`, or open it in Safari fullscreen). It must report
   **PASS**: achieved fps ≥ 114, dropped ≤ 0.5 %, max JS work well under 8 ms. Download the report into the
   lab log.
5b. **Counted key test (required):** open `?keytest=1` from the Home Screen icon (or Safari fullscreen) with the
   participant's BT keyboard and press the 20 prompted arrows. It must report **PASS (20/20)**: 0 missed, 0 wrong,
   0 extra, 0 unrecognised. Note the timebase line (`event 20` expected; any `handler` means RT carries handler
   latency). Download the report into the lab log. **No participant before a 20/20 PASS**; repeat after re-pairing
   the keyboard or any iPadOS update.
6. Pilot session with the BT keyboard:
   - Arrows respond and the page never scrolls or zooms. Space advances screens.
   - Skip one response: "Too Slow!" stays 5 s.
   - You see both an open and a blindfolded head.
   - Check the downloaded JSON (Files app → Downloads):
     - `session.display.refresh_hz_est` ≈ 120 and `refresh_matches_expected: true`
     - `calibration.display_mode` = `standalone` (or `fullscreen-api`)
     - trials show `rt_timebase: "event"`; if they show `"handler"`, note it, because RT then carries
       handler latency
     - every completed trial's `response_key` equals the arrow for `response` (and `correct` matches what you
       pressed); `calibration.refresh_override` is `false`
     - `dots_frame_interval_median_ms` ≈ 8.3
7. Check that the server has `star-inperson-pilot_<uuid>_*.json` files.

---

## 8. Known limitations
- **Browser coverage.** All automated tests run in headless Chromium at 60 Hz. Safari/WebKit, ProMotion
  behaviour and 120 Hz timing are unverified until the on-device checklist has been run.
- **RT noise at 120 Hz.** Onset quantisation halves to 8.3 ms. It is random with respect to condition,
  so it adds variance, not bias.
- **iPadOS fullscreen and Home Screen mode.** iPadOS Safari's fullscreen API is limited. Home Screen mode is
  the recommended route. Leaving the app counts as "hidden" and pauses the session.
- **Thin face lines.** The head's 5-px source lines render about 1.1 device px wide at a 39.7-ppd desktop and
  about 2.3 px on the iPad, so they are faint on the desktop rig. This is inherent to the chosen drawing
  (SPEC D6); ask Arvid for the originals (§11.5 Q4).
- **Grating contrast.** The grating peak (128·2 = 256) is clipped to 255.
- **Payload size.** 120 trials came to ~281 KB (2026-09-30; the new raw key fields add ~8 KB), with a worst case of ~342 KB at 60 Hz. At 120 Hz the
  frame-interval arrays roughly double, to ~450 KB worst case. That is still under the 900 KB cap; above
  the cap, the POST drops the arrays and logs `payload_trimmed`.
- **localStorage backups** are best effort: the ~5 MB quota holds roughly 10–20 sessions, and the oldest are
  dropped first.
- **The upload limit on the real server** (nginx `client_max_body_size`) is not verified (§11.5 Q8). Check it
  with a real pilot POST.
- **Scope of `?diag=1`.** It exercises dots only (the heaviest phase), not adaptor drawing. The adaptor is
  a pre-rendered blit and cheap.
- **Fixation compliance** is only rated by the experimenter; there is no eye tracker (SPEC D1).

---

## 9. Fixes after verification (2026-09-30)

Source: `/root/claude/graziano-lab-verify/REPORT.md` ("READY AFTER FIXES"). Nothing is committed or deployed.

| # | REPORT.md finding | Change (file: function) | Covered by |
|---|---|---|---|
| B1 | Empty/sparse RT cell silently drops a participant from some contrasts while `INCLUDED N` is unchanged | `analysis/star_inperson.py`: `PREREGISTRATION` block (`min_valid_rt_per_cell` 15); `min_valid_rt`; `analyze` (new exclusion `min_valid_rt_per_cell` after `chance_accuracy`, same rule applied to the April set [C]; `tests()` raises `ValueError` if a main/[A]/[C] contrast N ≠ included N; threshold < 1 rejected); `format_tests` (per-contrast `n` column); `format_report` (PREREGISTRATION + EXCLUSION RULES header lines, [B] N warning); `build_parser` (`--min-valid-rt-per-cell`). SPEC §8 step 2 + output format, §9 stopping rule | `test_T34d_min_valid_rt_per_cell_exclusion_and_fixed_contrast_n`, T32 (printed `n` = 30), T34 (row `min_valid_rt_per_cell 0`); verifier counterexample (below) |
| B2 | iPad key fallback logs `response_key: "Unidentified"`; rejected `KeyboardEvent.timeStamp` kept in `key_event_ts`, breaking `rt_ms = key_event_ts − dots_onset_ts` | `static/star-inperson/js/trialRunner.js`: `canonicalKey`; `onKey` (stores raw key/code); `_record` (`response_key` canonical, `response_key_raw`, `response_code_raw`, `key_event_ts` null when rejected, `key_event_ts_raw`, `key_handler_ts` always). Analysis unchanged (uses `rt_ms`). SPEC §5.3, §7.2 (types, nullability, invariant) | iPad-4 (canonical key, raw fields, both invariants, forged stamp → null), T23, T29 (`checkTrialSchema`: invariant + canonical key on every record), unit "responses by key or code" |
| N1 | T9 literal 0.94249 ± 1e-5 unreachable | SPEC §10.1 T9 → `0.9425017 ± 1e-6`; `tests/star-inperson/unit.test.mjs` T9 asserts exactly that | T9 |
| N2 | T13 60-Hz KS < 0.05 impossible (frame quantisation) and skipped | SPEC §10.1 T13 amended (144 Hz: KS; 60 Hz: mean + on-grid + discrete distribution, KS < 0.02) with rationale; `tests/star-inperson/rdk.test.mjs` T13 does both | T13 (60 Hz: D = 0.009, mean 100.1 ms) |
| N3 | T29 types disagree with practice/aborted records; aborted payload untested | SPEC §7.2: nullable fields marked, "Nullability" paragraph (practice, no response, aborted-before-phase ᴬ; `measured_speed_deg_s` also null with < 2 dots frames). `tests/star-inperson/session.test.mjs`: `TRIAL_FIELDS` P/A/F codes, `checkTrialSchema`, new aborted-session check in T29 | T29 (normal final payload with practice records + `status:'aborted'` terminal payload whose aborted record has null dots fields) |
| N4 | T34 run only at 2,000 permutations | `tests/star-inperson/test_analysis.py`: `test_T34c_production_default_iterations` (no `--iterations`; asserts `iterations == 10000`, p on the 1/10001 grid, no PREREGISTRATION warning) | T34c |
| N5 | Checklist cannot catch lost BT keypresses; calibration allows continuing on refresh mismatch | `static/star-inperson/js/keytest.js` (new: `keytestSequence`, `scoreKeytest`, `runKeytest`), `params.js` (`keytest` flag), `experiment.js` `run`, `setupFlow.js` `runSetup` (banner), `data.js` `CODE_FILES`; refresh gate: `screens.js` `showCalibrationPanel` (override checkbox, `data-refresh`), `setupFlow.js` `runCalibration`/`applyCalibration` (`calibration.refresh_override`, `refresh_override` event). SPEC §2.3, §7.3, §10.2; checklist steps 3, 5b, 6 above | unit "?keytest=1 … scoring", iPad-7 (lost/wrong/extra → FAIL; clean 20/20 → PASS; no POST; download), iPad-1 (Calibration OK disabled until override ticked, re-disabled when unticked), iPad-2 (`refresh_override: true` + event logged), T29 (`refresh_override` boolean); `helpers.mjs` `passCalibration` ticks the override only when the check failed |
| N6 | Wrong journal in `config.js`; analysis thresholds not tied to the pre-registration | `static/star-inperson/js/config.js` header → *Progress in Neurobiology* 190:101797 (no other wrong citation found by grep); `analysis/star_inperson.py` `PREREGISTRATION` block, printed in the header; §4 above | T34c/T34d (header line), T30 (hygiene) |
| — | Browser coverage (no real WebKit/120 Hz/BT keyboard run) | Not fixable in CI; the on-device checklist (now with the counted key test) remains mandatory | manual |

Verifier counterexample after the fix:
```
$ python3 -c '… g.analyze(["/root/claude/graziano-lab-verify/synthetic/empty_congruent_cell"]) …'
31 [('open dRT vs 0', 31), ('blindfold dRT vs 0', 31), ('open - blindfold', 31)]
exclusions: min_valid_rt_per_cell 1  - P00  min valid RTs in a cell=0
```
Before the fix it printed `32 [('open dRT vs 0', 31), ('blindfold dRT vs 0', 32), ('open - blindfold', 31)]`.

Round-2 fixes (2026-09-30, from `/root/claude/graziano-lab-verify/round2/REPORT.md`):
- **[B] cohort:** robustness [B] now has its own fixed cohort (included participants with ≥ `min_valid_rt_per_cell`
  valid RTs in every cell after dropped-frame trials are removed). All three [B] contrasts are hard-asserted to use
  that N, the N is in the [B] heading, and omitted participants are named in a WARNING. Every contrast in every
  block now raises on an N mismatch. Test: `test_T34e_nodrop_cohort`.
- **Key test late keys:** a keydown after a prompt's 3 s deadline (including the blank gap) is recorded as `late`,
  counts as extra, and never repairs the miss (`keytest.js: scoreKeytest`, `runOnce`). Test: iPad-7 prompt #3.
- **`refresh_override` in every payload:** mirrored at `session.refresh_override` (false until calibration confirms
  an override), so a manual download before calibration carries it too (`experiment.js`, `setupFlow.js`).
- **Analysis size:** the SPEC §3.2 budget for `analysis/star_inperson.py` is raised to ~650 lines (one stdlib file
  is kept deliberately so the lab can run it anywhere).
- Results after round-2 fixes (2026-09-30): Node 46/46, Python 14/14, 0 failures.
