# Starfield in-person: change log

Shared log for everyone working on the in-person starfield study: what happened, what changed, what we
learned, and what comes next. **Newest entries first.** Add an entry every time you change the code, run a
session that matters, or make a decision (template at the bottom).

- Experiment (live): https://schema.backyardbrains.com/star-inperson/ (code in `static/star-inperson/`)
- Demo mode (about 2–3 min, data saved separately as `star-inperson-pilot`): add `?pilot=1`
- Rig checks: `?diag=1` (dot frame rate, must PASS) and `?keytest=1` (keyboard, must be 20/20)
- Analysis: `analysis/star_inperson.py` · Tests: `tests/star-inperson/`
- Design and background: [SPEC.md](SPEC.md) (what the study must do), [BRIEF.md](BRIEF.md) (why),
  [BUILD_NOTES.md](BUILD_NOTES.md) (how it is built, test commands, on-device checklist)
- Raw data: one JSON file per save in `/var/www/schema.backyardbrains.com/uploads/star-inperson_<UUID>_<time>.json`
  (several files per session; the analysis keeps the latest one per UUID)

**Naming rule:** never use "Graziano" in anything public (URL, page title, data names). Citing the paper
(Guterstam & Graziano 2020) in docs and code comments is fine.

---

## Current status (2026-10-07)

- **Version 1.2.0 is live** and runs the dots at 120 Hz on the 12.9" iPad Pro. **v1.3.0** (no practice pause, frame-gap
  logging) is built and tested on branch `star-inperson`, waiting to be merged.
- The rig is set up: iPad Pro with ProMotion, the Safari 60 Hz cap turned off, an Apple Magic Keyboard wired over
  USB-C with Bluetooth off, the chin holder at 54 cm.
- **No real participants yet.** Every session so far is a test (see the data table below).

## Next steps

1. Decide and write down the pre-registration before the first real participant: N = 32 included people
   (recommended in SPEC §9), dot speed 1.4 °/s, 120 trials, and the exclusion rules (accuracy not above chance,
   failed practice, fewer than 15 usable reaction times in any condition).
2. Before every session: run `?diag=1` (PASS at about 120 fps) and `?keytest=1` (20/20).
3. Today's session needed the frame-timing override at calibration (spread 1.23 ms). Decide whether that warning is
   too strict for the iPad, or always run from the Home Screen app, where the spread was lower.
4. Tech Trek demo (2026-10-02): no `star-inperson-pilot` files reached the server. Check whether the demo used
   `?pilot=1` and whether saves worked there.
5. Ask Arvid Guterstam / Christian Renet: which dot method and density unit their code uses, where the head's eye
   sat relative to fixation, and whether we can have their original head and tree drawings.
6. The server's `/uploads/` folder is publicly browsable (directory listing on). Close it before real data arrives.
7. People who tried the demo have seen the faces and blindfold. Do not recruit them as participants.
8. **Decide the end-of-session questions** (see 2026-10-07): last year's Google Form had different questions from
   the built-in questionnaire.
9. Luca's 2026-10-07 session stopped receiving answers for long stretches (95 timeouts). Find out whether he stepped
   away or the keyboard stopped working.

## Test sessions so far (none are study data)

| Date | Session UUID (start) | Version | What it was | Use in analysis? |
|---|---|---|---|---|
| 2026-09-30 | `0f0378bb` | 1.0.0 | Setup screen only, no trials | No |
| 2026-09-30 | `26cec785` | 1.0.0 | First full iPad pilot. Dots ran at ~59 Hz | No |
| 2026-10-01 | `759692c1` | 1.1.0 | 144 Hz laptop, refresh warning overridden, practice only | No |
| 2026-10-02 | `1a2e53d1` | 1.1.0 | Second full iPad pilot. Dots still ~59 Hz | No |
| 2026-10-05 | `e18e42ca` | 1.2.0 | First full run with 120 Hz dots ("TestSubject"); refresh override ticked | No |
| 2026-10-07 | `3eea5562` | 1.2.0 | Luca's test: 65 trials completed, 95 timeouts, ended by the 40-timeout limit | No |

---

## 2026-10-07: v1.3.0, no pause in practice; proof of the face-to-dots switch; end-form question

**What happened**
- Luca reported that practice trials pause for about 1.5 s after the fixation dot. He also noticed that the
  end-of-session questions differ from last year's Google Form.
- Greg: what matters most is that the dots appear immediately after the face, ideally within one 120 Hz frame
  (8.3 ms).

**What we learned**
- **The practice pause was by design.** Practice trials showed a 1.5 s blank gray screen where the face would be,
  to keep the same rhythm as real trials. To a participant it looks like the program froze. The paper does not say
  what practice trials contained.
- **In real trials, the dots already replace the face on the very next frame.** The code switches from face to dots
  inside the same frame update, so no blank frame is ever drawn in between. Data from 2026-10-05 and 2026-10-07
  (v1.2.0) show:
  - the face/tree drawn on exactly 180 frames (1,500 ms at 120 Hz) on every trial;
  - the first dots frame starting 1,500–1,501 ms after the face appeared, with the next frame 8–9 ms later.

  So the face is on screen until the refresh that shows the dots: the switch takes one refresh, 8.3 ms.
- Luca's session (`3eea5562`): after about 56 good trials, nearly every trial timed out (95 timeouts). Block 3 took
  16 minutes. The session ended itself at the 40-timeout limit with 65 trials completed. This is either the
  person stepping away or the keyboard dropping out; check with Luca.

**What changed (v1.3.0, on branch, not yet live)**
- Practice trials now go straight from the fixation dot to the dots on the next frame, with no blank screen. This is
  set by `practiceBlankMs` (0) in `js/config.js`; setting it to 1500 brings back the old behavior.
- New field on every trial, `last_frame_before_dots_ms`: the time from the last face/tree frame (or fixation frame in
  practice) to the first dots frame. It should be one refresh (~8.3 ms). Any session can now be checked for gaps.
- Tests: 46/46 browser tests, 14/14 analysis tests.

**Decision needed: end-of-session questions**
- Last year's online study sent people to a Google Form ("Backyard Brains Starfield Survey v1.8"):
  - What do you think the purpose of the experiment is?
  - How do you think human vision works?
  - Do you think the faces affected your ability to determine the direction of the stars? If so, how?
  - Gender (Male/Female)
  - Age group
  - Continent
  - Experimental ID and Prolific ID
- The in-person build instead asks two questions on the iPad, saved with the data: what the person thought the
  study was about, and whether the head/tree affected their answers. These are the questions the paper reports.
- Options are listed in the 2026-10-07 reply to Greg; record the choice here once made.

## 2026-10-05: first full run on v1.2.0; change log started

**What happened**
- A full 120-trial session ran on the iPad with v1.2.0, in the Safari tab (full screen), with the chin holder at
  54 cm and the wired keyboard.

**What we learned**
- **The 120 Hz fix works.** The dots ran at a median frame time of 8 ms, and only 12 of 12,147 dot frames were slow
  (0.1%). The first dots frame now arrives 8–9 ms after the face disappears; on v1.1.0 it took 22–23 ms. The
  face/tree screen was drawn for exactly 1,500 ms (180 frames) on every trial, and the dots moved at 1.4 °/s.
- The calibration screen flagged the frame-timing spread (1.23 ms) and the experimenter ticked the override. The
  frame rate itself was fine. See next step 3.
- Results for this one tester: open eyes ΔRT +83 ± 55 ms, blindfold +103 ± 56 ms (± is the standard error). With
  30 trials per condition, one person's ΔRT carries roughly ±30–55 ms of noise, so single-person results swing a
  lot. Only the group average means anything.

**What changed**
- Added this change log.

## 2026-10-02: v1.2.0, faster dot drawing (live for Tech Trek)

**What happened**
- Ran `bench.html` on the iPad, which tries five ways of drawing the dots:

  | Method | fps | Slow frames |
  |---|---|---|
  | A: whole screen cleared + all dots drawn as one shape (old) | 58.0 | all |
  | B: dot area cleared + all dots as one shape | 60.9 | all |
  | **C: dot area cleared + each dot drawn separately** | **120.0** | **0 / 600** |
  | D: pixel buffer | 119.9 | 1 / 600 |
  | E: WebGL | 120.1 | 0 / 601 |

**What changed**
- v1.2.0 uses method C. Each dot is drawn as its own small square, and after the first dots frame only the 5° dot
  area is cleared. The first dots frame still clears the whole screen so the face and tree disappear. `?diag=1`
  draws the same way. All tests pass (46 browser, 14 analysis).
- Deployed for the Tech Trek demo (`?pilot=1`, about 2–3 minutes per visitor).

**What we learned**
- Drawing 1,250 dots as one shape was the bottleneck in iPad Safari, not clearing the screen.
- Checking the refresh rate on the setup screen does not catch this, because it draws no dots. Run `?diag=1`
  before sessions.

## 2026-10-02: second iPad pilot on v1.1.0

**What we learned**
- The dots still ran at ~59 Hz while the face/tree ran at 120 Hz. The first dots frame took 22–23 ms; this is the
  "~30 ms gap between the faces and the stars" that Gemini noticed.
- Reaction times are timed from the moment the first dots frame starts, so they included this delay. It was the
  same in both conditions, so it could not create a false effect, but it added noise.
- The two pilots gave opposite-looking results (Sept 30: open −41 ms, blindfold +53 ms; Oct 2: open +56 ms,
  blindfold −20 ms). Both are within the ±30–40 ms noise of a single person.

## 2026-10-01: laptop practice run

- A practice-only session on a different computer (144 Hz laptop screen, 1536×864), with the refresh warning
  overridden. Fine as a demo; keep it out of the data.

## 2026-09-30: v1.1.0 band blindfold; rig set-up; first iPad pilot

**What changed**
- **v1.1.0:** the blindfolded face is now the hand-drawn band blindfold
  (`static/star/img/BlindfoldDrawingRight.png`), replacing the large rectangle. `tools/make_blindfold.py` lays only
  the band and strap over the sharp open-eyed face, so the two faces differ only by the blindfold. A test checks
  this.
- Added `bench.html`, a standalone page that times dot-drawing methods on the device.

**Rig set-up (what works)**
- Safari caps pages at 60 Hz by default. Turn off Settings → Apps → Safari → Advanced → Feature Flags → "Prefer
  Page Rendering Updates near 60fps", then force-quit Safari. Also keep Low Power Mode and "Limit Frame Rate" off.
  After this the iPad measures about 125 Hz, which is its 120 Hz maximum plus timer rounding.
- Keyboard: an Apple Magic Keyboard plugged in with its cable and the iPad's Bluetooth off works as a wired
  keyboard. Choose "USB keyboard" on the setup screen.

**What we learned (first iPad pilot, v1.0.0)**
- The dots ran at ~59 Hz while everything else ran at 120 Hz. This led to the benchmark and v1.2.0.

## 2026-09-30: v1.0.0 deployed; independent verification; renamed

**What happened**
- An independent model (Sol 6) verified the build in three rounds against the spec, measuring the stimulus from
  screen pixels. Final verdict: ready for the on-device checklist.
- The project's working name was replaced: the public name is **star-inperson** (`/star-inperson/`, data name
  `star-inperson`).
- Merged to `main` and deployed.

**What changed because of verification**
- New exclusion rule: anyone with fewer than 15 usable reaction times in any of the four conditions is excluded
  and replaced. Without it, one comparison could quietly run on fewer people than the others.
- iPad keyboard data: the saved key is always the plain arrow name, raw values are kept separately, and the data
  records which clock the reaction time came from.
- Added `?keytest=1` (20-press keyboard check), and the calibration screen can no longer be passed with a failed
  refresh check unless an override box is ticked (and logged).

## 2026-09-29: project start: why in person, and what was rebuilt

**Background**
- The online version (`/star/`, v1.0–v1.11, Nov 2025–Apr 2026, about 1,100 participants) never cleanly replicated
  Guterstam & Graziano (2020) Experiment 2: open eyes ≈ +22 ms, blindfold ≈ −3 ms.

**Problems found in the online code**
- The dots ran at one-third of the set speed through v1.8.6. Three dot sets were drawn in rotation (advice from
  Roozbeh Kiani, Sept 2025), but each set moved only one frame's worth when drawn instead of three.
- The screen was never calibrated, so every participant saw different sizes and speeds.
- The face and the dots were laid out differently, so the face's position depended on the window size.
- Catch trials showed an open green eye even on "blindfolded" Bob.
- Images and libraries loaded from addresses that could change between runs.
- Reaction time was not measured from when the dots appeared.
- Data uploaded only at the end of a session.

**Decisions (Greg, 2026-09-29)**
- Run in person on one fixed rig, comparing open eyes vs. blindfold.
- Dot speed 1.4 °/s, which Christian Renet's lab found gives the strongest effect (the 2020 paper used 2.0 °/s).
- Neutral instructions: "the head and tree are irrelevant". No Bob story, no catch trials.
- Follow the April 2026 report's recommendations: one frozen version, 120 trials (30 per condition), every
  condition logged.

**What was built**
- A new, modular experiment (one config file, small single-purpose files, no outside libraries).
- Everything is drawn in degrees on one canvas after calibration, and each trial runs as one continuous screen.
- Reaction time starts at the first frame with dots.
- Timed-out trials are repeated later in the session.
- Data saves after every block, plus a local download.
- A moving-grating mode checks the rig.
- A standard-library-only analysis script.

**Power**
- 12 people gives about 43% power; 32 gives about 87% (SPEC §9).

---

## How to add an entry

Copy this block to the top of the dated entries (below "Test sessions so far"). Also update **Current status**,
**Next steps**, and the **test sessions** table if they changed.

```
## YYYY-MM-DD: short title (vX.Y.Z if the code changed)

**What happened** – sessions run, decisions made, who was involved
**What changed** – code/config/stimuli/docs changed (bump experimentVersion in js/config.js for ANY change
  to static/star-inperson/, and say which version)
**What we learned** – results, surprises, numbers with units
**Next steps** – (or update the Next steps list above)
```

Keep entries in plain language. Put the numbers in (fps, ms, N), and say which data files or versions an entry
refers to.
