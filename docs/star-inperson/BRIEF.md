# Brief: Starfield in-person — replication of Guterstam & Graziano (2020) Exp 2 (open vs. blindfold)

Owner: Greg Gage (Backyard Brains). Written 2026-09-29.

## Goal
Answer one question cleanly: **is the Guterstam & Graziano (2020) Experiment 2 effect real?**
A static line drawing of a head gazing at a tree should slow discrimination of random-dot
motion that moves in the same direction (face → tree) compared with the opposite direction
(ΔRT = RT_congruent − RT_incongruent > 0) when the eyes are **open**, and not when the head is
**blindfolded**. Original result: open ΔRT = +22 ms (SE 8, t23 = 2.89, p = .008);
blindfold ΔRT = −3 ms (SE 8, n.s.). N = 24 after exclusions (32 recruited).

This run is **in person** (lab computer, fixed monitor, fixed viewing distance, experimenter
present), about **12 participants to start, more can be added**. Conditions: eyes open vs. blindfold,
within subject. Follow the recommendations of the April 2026 replication report (below):
one frozen code version, strict replication, no story framing, no catch trials, no face-away condition.

## Required reading (all local)
- April technical report: `/root/claude/sa-star/results/star_replication_technical_report.md`
  (see "Recommended Next Run", "Required data fields", "Recommended exclusion rules")
- April 27 follow-up: `/var/www/schema.backyardbrains.com/talk_build/cache/beams/starfield_followup.txt`
- The paper (scanned PDF, read as images): `/root/claude/sa-star/papers/Guterstam_behavioral_2020.pdf`
- Current (v1.11) code, one 1,428-line monolith: `static/star/index.html` in this repo
- Preferred house style (Greg likes this): `static/tube/index.html`, `static/tube/js/tubeExperiment.js`,
  `static/js/baseExperiment.js`, `static/js/utils.js` — plain JS, a `config` object at the top,
  a class for the experiment, small HTML shell, separate CSS/img folders.
  Greg wants something at least that navigable, ideally better: parameters in one obvious place,
  small files with one job each, easy to change.

## Parameters from the paper (Methods + Exp 2), verified by reading the PDF
- Chinrest at 54 cm; 38-cm-wide CRT, 80 Hz, 1600×1200 (≈39.7 px/deg). MATLAB + Psychtoolbox. Darkened room. EyeLink.
- Trial: ITI 1–2 s neutral gray → black central fixation point 0.5° diameter, 1.5 s → point
  disappears, adaptor (head + tree image) 1.5 s → random-dot motion until response, max 2 s.
- Dots: black dots on gray, 5°×5° square aperture at screen center; "Dot density was 50 dots per
  square visual degree"; dot diameter 0.05°; speed 2°/s; lifetime 200 ms; 60% random direction,
  40% coherent. **No interleaved dot sets are mentioned.**
- Response: left/right key as fast as possible. Dots disappear at response. If no response within
  2 s: "Too Slow!" for 5 s, and **the same trial configuration is re-queued later** so every
  participant finishes a balanced number of trials.
- Practice: 10 trials with accuracy feedback; repeat until ≥80%, up to 4 attempts; fail → excluded.
- Exclusion after main task: overall accuracy not significantly > 50% (permutation test, 10,000 iterations).
- Exp 2: 120 trials in 6 blocks of 20; 30 per cell (open/blindfold × congruent/incongruent);
  head on left facing right or on right facing left, counterbalanced; instructions said only that
  the head/tree was irrelevant to the motion task. Post-experiment awareness questionnaire.
- Geometry (Fig. 3 and Exp 7 text): head region ≈ x −9° to −2.5° (inner edge 2.5° from midline),
  tree ≈ +2.5° to +7°, both vertically centered on the same line as the dot field (y ≈ −2.5° to +2.5°).
  Exp 1 grating was 14.7° × 5.7°.
- Congruent is defined as dot motion in the head→tree direction (for toward-facing heads).

## Bugs and deviations found in the current code (v1.11 and earlier), 2026-09-29 review
Things the April reports did NOT catch:
1. **Screen geometry is uncalibrated.** `pixelsPerDegree` is never set; it is always the fallback
   50 px/deg. `monitorWidthCm = 38`, `viewingDistanceCm = 54` are hard-coded and only *logged*,
   never used. On a typical 1440-px-wide laptop at 54 cm the real value is ≈36 px/deg, so the
   "5° aperture at 1.4°/s" was really ≈7° at ≈2°/s, and every participant's screen differed.
2. **Face/tree and dots live in different coordinate systems.** Dots are in fixed canvas pixels
   (800×800 canvas); the face and tree are `<img>` tags sized by `60vw` flexbox. Face size,
   eccentricity and eye-line height all change with window width. The `top: 30px` CSS labelled
   "SHIFTED UP ABOVE MIDLINE" actually moves the face *down* (position: relative); the RDK is moved
   up 30 px. Earlier versions used `top: 65px` (face down 65 px) with a centered RDK.
3. **Catch trials broke the blindfold condition.** The green catch face (`BlankFaceLooking*Green.png`)
   is always the open-eyed face with a *green eye*, including in blindfold runs (v1.10), so a
   "blindfolded" Bob periodically appeared with a highlighted open eye. Catch trials also train
   attention onto the face/eye.
4. **Silent blindfold failure mode.** If an image fails to preload, the code falls back to an SVG
   face (`generateFaceSVG`) that has no blindfold variant, so blindfold trials would show open eyes.
   Nothing is logged per trial about which image was shown.
5. **Stimuli loaded from `raw.githubusercontent.com/.../main/...`** (open face, tree) — can change
   between runs without a code change; the blindfold image is pinned to an old commit and is a
   different file family (`BlindfoldDrawing*.png`) from the open face (`BlankFaceLooking*.png`).
   A matched `BlankFaceLooking*Blindfold (1).png` exists with identical canvas/bbox (a big
   rectangle blindfold) — the stimulus pair should be chosen deliberately and logged.
6. **jsPsych and plugins loaded as `@latest` from unpkg** — the library version could change
   between or during runs.
7. **Interleaved dot sets are not in the paper.** The 3-set interleave (from Shadlen-lab code) made
   each dot visible 1 frame in 3 and move in 3× jumps; it caused the one-third-speed bug through
   v1.8.6. The paper describes plain dots. Note an ambiguity: Shadlen-style code expresses density
   as dots/deg²/**s**; the paper says dots/deg². Take the paper literally (1,250 dots per frame in
   the 5°×5° aperture) but make density a config value and flag it as a question for Arvid Guterstam.
8. **Timeouts are not re-queued** (paper re-queues) and the "Too Slow" screen is 1.5 s (paper 5 s),
   so cell counts are unbalanced after timeouts.
9. **Data are only uploaded at the very end.** A crash, closed tab or practice failure loses
   everything (practice failures call `endExperiment` without saving).
10. **Prolific-only screens** (ID prompt, "58% chance" rejection warning, low-accuracy
    "return the study" screen after trial 15) apply pressure/feedback not in the paper.
11. Practice sequence is generated once, so repeated practice attempts reuse identical directions;
    paper allows 4 attempts, code allows 3.
12. Metadata is wrong in places: `facePositionRelativeToFixation: "above"` is logged although
    the face was moved down; `file_version` has lagged `experiment_version` before; no commit hash.

Interpretation note (not a code bug): in the face-away runs (v1.8.6, v1.9.2), "congruent" was
defined as toward the tree (same as the paper's Exp 3). The large negative away ΔRT (−31, −40 ms)
therefore means people were *slower when dots moved in the direction the face was looking*
(away from the tree) — the adaptation-like sign — not a cueing effect. Out of scope for this build,
but the data format should always log both face→tree direction and gaze direction.

## Power note (for the spec, not a design change)
Paper Exp 2: ΔRT 22 ms, SE 8, n 24 → SD ≈ 39 ms, dz ≈ 0.56. A one-sample t-test at n = 12 has
roughly 45% power; n = 24 ≈ 75%; n ≈ 28 for 80%. Much of the ΔRT variance is trial noise, so more
trials per cell raises power (e.g., 60 per cell ≈ 240 trials). Default to the paper's 120 trials /
30 per cell as the April report recommends; make trials-per-cell a single config value and state
the trade-off. Recommend pre-registering the stopping N (sequentially peeking at 12, 16, 20… inflates
false positives).

## Constraints
- Server: Flask app at `app.py`; `POST https://schema.backyardbrains.com/data` with
  `{experiment, UUID, data}` writes `uploads/{experiment}_{UUID}_{timestamp}.json` (one file per POST).
- New experiment lives at `static/star-inperson/` (served at https://schema.backyardbrains.com/star-inperson/);
  docs in `docs/star-inperson/`. Do not modify `static/star/` or other experiments, and do not touch
  `app.py` unless unavoidable (flag instead).
- Chromium + Playwright are preinstalled (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`; never run
  `playwright install`). Node is available. No scipy on the server Python.
- Do not deploy, push, or write into `/var/www/schema.backyardbrains.com` — work only in
  `/root/claude/star-inperson` (git worktree, branch `star-inperson`).
