# Verification prompt (paste into the verifying model)

You are an independent verifier for a psychophysics experiment that another AI built. Your job is to find
what is wrong, not to confirm that it works. Assume the builder was confident and partly mistaken. The
experiment will be run in person on real participants to test whether a published effect is real, and a
bug that biases one condition would produce a false finding. Be adversarial and concrete.

## Where things are (on the BYB apps server)

- Code under review: `/root/claude/star-inperson` (git worktree, branch `star-inperson`, uncommitted
  changes on top of `origin/main`). The experiment is `static/star-inperson/`; the analysis script is under
  `analysis/` (see BUILD_NOTES); docs are in `docs/star-inperson/`.
- The spec it must satisfy: `docs/star-inperson/SPEC.md` (normative). Background: `docs/star-inperson/BRIEF.md`.
- Builder's claims: `docs/star-inperson/BUILD_NOTES.md` (test commands, results, deviations, bug→fix map).
- Source paper (scanned PDF, read the pages as images):
  `/root/claude/sa-star/papers/Guterstam_behavioral_2020.pdf` (Guterstam & Graziano 2020,
  Progress in Neurobiology 190:101797). Experiment 2 is the target.
- The old code being replaced (for comparison only): `static/star/index.html`.

Rules: do not modify the files under review. Put anything you write (scripts, screenshots, notes) in
`/root/claude/graziano-lab-verify/`. Do not push, deploy, or touch `/var/www/schema.backyardbrains.com`.
Playwright and Chromium are installed on this server (see BUILD_NOTES for the exact setup; do not run
`playwright install`).

## Decisions already made by the PI (do not re-litigate; do check they are implemented)

Dot speed 1.4 °/s by default (paper used 2.0; 2.0 must be reachable by one config/URL change and logged);
neutral framing (head and tree are irrelevant to the task); no catch trials; no "Bob" story;
open vs. blindfold, 30 trials per cell, 120 trials, 6 blocks of 20.

## Target rig (added after the spec; see BUILD_NOTES "iPad rig")

The experiment runs on a 12.9" iPad Pro (M2), landscape, Safari/WebKit (every iPadOS browser is WebKit),
ProMotion adaptive refresh up to 120 Hz, DPR 2 (1366×1024 CSS px, ≈26.3 × 19.7 cm), Bluetooth keyboard.
Only Chromium is available on this server, so: (a) run the iPad-emulation tests, (b) review the code for
WebKit-specific risks (fullscreen/standalone handling, `screen.width` reporting portrait dimensions in
landscape, `KeyboardEvent.timeStamp` timebase, touch/zoom/scroll suppression, rAF held at full rate through
every phase so ProMotion does not drop and ramp up at dot onset), and (c) review the on-device checklist in
BUILD_NOTES and say whether it would catch a rig running at 60 Hz, a wrong ppd, or lost keypresses.

## What to do

1. **Re-run everything yourself.** Run every automated acceptance test in SPEC §10.1 using the commands in
   BUILD_NOTES, and report pass/fail per numbered test from *your* run. If a test in §10.1 is missing,
   stubbed, trivially true, or tests something weaker than the spec says, count it as a FAIL and say why.
2. **Independently measure the stimulus, don't trust the builder's tests.** Write your own Playwright
   script that opens the experiment in pilot mode at a known calibration (e.g. monitor 52.7 cm, 1920 px,
   54 cm distance, DPR 1 and DPR 2) and, by reading canvas pixels frame by frame:
   - measures coherent dot speed in °/s (track displacement of the coherent population, e.g. by
     cross-correlating consecutive frames) and compares it with the configured 1.4 °/s and with 2.0 °/s
     after a URL override — for BOTH dot engines (`guterstam2020` and `shadlen`);
   - counts dots per frame and checks density, dot size in device pixels, and that no dot is drawn
     outside the 5° × 5° aperture;
   - checks that the coherent direction on "congruent" trials equals the head→tree direction and on
     "incongruent" trials is opposite, for head-left and head-right;
   - checks that the head's pupil, the fixation point and the aperture centre lie on one horizontal line,
     that head and tree heights match, and that the inner edges sit 2.5° from the midline (SPEC §1.5);
   - checks that the blindfold image is drawn on every blindfold trial and the open image on every open
     trial (hash the adaptor region per trial and match it to the logged condition);
   - measures RT zero: confirm RT is measured from the first frame on which dots are drawn, not from
     phase start, by injecting a synthetic keypress at a known time and comparing with the logged RT.
3. **Design and randomisation.** Generate many sessions (different seeds) and verify: exactly 30 trials
   per cell, head side 15/15 within every cell, seed logged and reproducible, no condition confounded with
   block, trial position or time; timeouts are re-queued later with `requeued_from` set; practice uses a
   fresh sequence per attempt, max 4 attempts, pass at ≥ 80 %, and a practice failure still saves data.
4. **Data.** Check the payload against SPEC §7 field by field (missing, misnamed, wrong units, wrong
   types). Verify partial saves after every block and the complete save at the end (intercept the POST),
   the local JSON download, the experimenter early-download shortcut, and the dedupe rule in §7.5.
   Confirm every save is under the spec's size cap. Confirm the effective config (after URL overrides)
   and a version/commit string are in every payload.
5. **Analysis.** Build synthetic datasets with a known injected ΔRT (e.g. +25 ms open, 0 ms blindfold,
   N = 32) and with none, run the analysis script, and check that it recovers the injected values, that
   the sign convention is ΔRT = RT(congruent) − RT(incongruent), that exclusions (permutation test vs 50 %
   with 10,000 iterations, practice failure, RT > 200 ms, correct trials only) are applied as the spec
   says, and that the stopping-rule banner behaves as specified. Hand-compute one participant's ΔRT and
   compare.
6. **Paper fidelity.** Read the paper pages and check SPEC §1.3 / §1.4 against them. Flag anything the spec
   or the build gets wrong about the paper (timings, sizes, trial counts, practice rules, exclusion rule,
   congruency definition). The only intended departures are those listed in SPEC §1.4 and the PI decisions
   above.
7. **Code quality against the goal.** The PI wanted the opposite of the old 1,400-line monolith: one
   obvious config file with every parameter (units + source), small single-purpose files, no CDN or
   unpinned libraries, easy to change a parameter. Check file sizes against the SPEC §3.2 budgets, look
   for parameters hard-coded outside the config, dead code, and anything a student would find hard to
   change safely.
8. **Look for the class of bugs that sank earlier versions:** speed off by a constant factor, parameters
   that are logged but not used, geometry that depends on window size, condition labels that don't match
   what was drawn, mid-run state leaking between trials (dot arrays, rAF loops not cancelled, key
   listeners piling up), and anything that differs between the two eye conditions other than the
   blindfold itself (image size, position, load timing, onset latency).

## What to hand back

A report with:
- **Verdict:** READY FOR PILOT / READY AFTER FIXES / NOT READY, in one line.
- **Blocking issues:** anything that could bias ΔRT between conditions, mislabel data, or lose data.
  Each with file:line, how you demonstrated it (command + output), and the smallest fix.
- **Non-blocking issues:** same format, shorter.
- **Acceptance test table:** every SPEC §10.1 test, your pass/fail, one-line evidence.
- **Independent measurements:** the numbers from step 2 (speed per engine per DPR, dots/frame, geometry,
  RT-zero offset), each with the expected value.
- **Disagreements with the spec or the paper**, if any.

Do not fix the code. Report only.
