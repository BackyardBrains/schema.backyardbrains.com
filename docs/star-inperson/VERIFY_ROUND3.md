# Verification round 3 (paste into the verifying model)

Your round-2 report (`/root/claude/graziano-lab-verify/round2/REPORT.md`) left three items. They have been
changed; see `docs/star-inperson/BUILD_NOTES.md`, "Round-2 fixes (2026-09-30)". Same rules: do not modify
`/root/claude/star-inperson`; write to `/root/claude/graziano-lab-verify/round3/`; no push, no deploy.

1. Robustness [B]: re-run `python3 /root/claude/star-inperson/analysis/star_inperson.py
   /root/claude/graziano-lab-verify/round2/synthetic/dropped_open_cell` and your fault-injection over all twelve
   group-test calls. [B] now has its own cohort (included participants still meeting min_valid_rt_per_cell after
   dropped-frame trials are removed); all three [B] contrasts must share that N, the N must be printed, the
   omitted participant named, and every one of the twelve guards must raise on a mismatch. Say whether the
   amended SPEC section 8 wording is an acceptable pre-registered rule.
2. Key test: re-run your late-response case (key at about 3,104 ms, in the blank gap) and keys just before and
   just after the 3,000 ms deadline. A late key must be recorded as `late`, counted as extra, and never turn a
   miss into a pass.
3. Pre-calibration manual download: confirm `session.refresh_override` is present (false) in a setup-screen
   Ctrl+Shift+S payload and correct (true/false) in every later payload, and still mirrored in
   `calibration.refresh_override`.
4. Re-run both suites (expect Node 46/46, Python 14/14) and your stimulus probes to confirm nothing else moved.

Hand back a one-line verdict, a FIXED / NOT FIXED table for these three items with evidence, and any new
issue. Actual iPad / Safari / 120 Hz / Bluetooth checks remain the lab's on-device checklist and are out of
scope here.
