// experiment.js — class StarInPersonExperiment: the session flow (SPEC §5.1): load -> setup -> calibration ->
// hand-over -> instructions -> practice (<= 4 attempts) -> main blocks with breaks -> questionnaire -> final save.
// Also: pause/resume/quit (§5.8), experimenter download shortcut, saves at every milestone (§7.4).
import { Stage } from './stage.js';
import { measureWindow, ppdChange, nextResize, isFullscreen, isLandscape, requestFs } from './calibration.js';
import { geometryReport } from './adaptors.js';
import { mainList, PracticeLists, requeueInsert } from './design.js';
import { makeStream, streamSeed, randomSeed } from './rng.js';
import { TrialRunner } from './trialRunner.js';
import { DataStore, computeFingerprint, environmentInfo } from './data.js';
import { runSetup, runCalibration, applyCalibration } from './setupFlow.js';
import { runDiagnostics } from './diag.js';
import { runKeytest } from './keytest.js';
import { TEXT } from './text.js';
import * as S from './screens.js';

const SOURCE_W = 1080, SOURCE_H = 1350;   // layout math in adaptors.js assumes this canvas size

export class StarInPersonExperiment {
  constructor(params, hooks = null) {
    this.p = params; this.cfg = params.config; this.hooks = hooks;
    this.seed = params.seed ?? randomSeed();
    this.uuid = crypto.randomUUID();
    this.trials = [];
    this.active = false; this.pauseP = null; this.ended = false;
    this.mainAttempt = 0; this.practiceIndex = 0; this.nTimeouts = 0;
    this.stage = new Stage(document.getElementById('stage'), this.cfg);
    this.requeueRng = makeStream(this.seed, 'requeue');
    this.trialList = mainList(this.cfg, this.seed);
    const t0 = performance.now();
    this.session = {
      experiment: params.experimentName, experiment_version: this.cfg.meta.experimentVersion,
      code_fingerprint: null, file_hashes: {}, session_uuid: this.uuid, status: 'in_progress',
      partial: true, complete: false, main_done: false, save_seq: 0, save_reason: null, saved_at_iso: null,
      setup: { participant_id: params.pid || '' }, refresh_override: false, calibration: null, display: null,
      geometry: geometryReport(this.cfg), images: this.stage.imageInfo, environment: null,
      seed: this.seed,
      stream_seeds: Object.fromEntries(['order', 'practice', 'iti', 'requeue'].map((s) => [s, streamSeed(this.seed, s)])),
      trial_list: this.trialList, config_effective: this.cfg, config_overrides: params.overrides,
      config_overridden: params.overridden, pilot: params.pilot, test: params.test,
      timing: { start_iso: new Date().toISOString(), end_iso: null, time_origin: performance.timeOrigin, duration_ms: null, t0 },
      events: [], practice: { attempts: [], passed: false, n_attempts: 0 }, main_summary: null,
      requeue_cap_hit: false, questionnaire: null, saves: [],
    };
    this.session.stream_seeds.dots = 'per trial: FNV-1a-32("<seed>:dots:<phase>:<attempt_index>") = dots_seed';
    this.store = new DataStore({
      cfg: this.cfg, experiment: params.experimentName, uuid: this.uuid, hooks,
      getState: () => { this.session.main_summary = this.mainSummary(); return { session: this.session, trials: this.trials }; },
      logEvent: (type, detail) => this.logEvent(type, detail),
    });
    if (hooks) {
      Object.assign(hooks.G, { config: this.cfg, _stage: this.stage, _trials: () => this.trials, uuid: this.uuid });
      S.onScreenChange((n) => hooks.screen(n));
    }
  }

  logEvent(type, detail = null) {
    this.session.events.push({ t: Math.round((performance.now() - this.session.timing.t0) * 10) / 10, type, detail });
  }

  fatal(e) {
    const msg = e && e.message ? e.message : String(e);
    this.logEvent('error', msg);
    this.active = false;
    if (this.runner) this.runner.stop();
    S.showError(msg);
    if (this.hooks) { this.hooks.G.error = msg; this.hooks.G.ready = true; }
  }

  async run() {
    try {
      await this.stage.loadImages();
      for (const im of this.stage.imageInfo) {
        if (im.natural_w !== SOURCE_W || im.natural_h !== SOURCE_H) throw new Error(`Stimulus image failed to load/verify: ${im.file} (size ${im.natural_w}x${im.natural_h})`);
      }
      Object.assign(this.session, await computeFingerprint());
      this.session.environment = environmentInfo();
      this.installListeners();
      await runSetup(this);
      await runCalibration(this);
      if (this.p.diag) { await runDiagnostics(this); return; }   // ?diag=1: rig check only, nothing is saved
      if (this.p.keytest) { await runKeytest(this); return; }   // ?keytest=1: counted keypress check, nothing is saved
      this.store.save('setup');
      this.active = true;
      this.runner = new TrialRunner({ stage: this.stage, cfg: this.cfg, seed: this.seed, display: this.session.display, hooks: this.hooks, session: { session_uuid: this.uuid, participant_id: this.session.setup.participant_id } });
      await S.message('<p>Experimenter: participant seated at the chinrest? Press SPACE to show instructions.</p>', { name: 'handover' });
      await S.message(TEXT.instructions1(this.cfg), { name: 'instructions1' });
      if (!(await this.practice())) return;
      await S.message(this.cfg.design.adaptor === 'grating' ? TEXT.instructions2Grating : TEXT.instructions2FaceTree, { name: 'instructions2' });
      await this.main();
      const answers = await S.showQuestionnaire(this.cfg.design.adaptor);
      this.session.questionnaire = answers;
      await this.finish('final', TEXT.end);
    } catch (e) { this.fatal(e); }
  }

  // ---------- trial segments ----------
  async segment(provider) {
    await this.ensureDisplay();
    S.setScreen('trials');
    await this.runner.runSegment(provider);
  }

  async practice() {
    const P = this.cfg.practice, lists = new PracticeLists(this.cfg, this.seed);
    const need = Math.ceil(P.practicePassAccuracy * P.practiceTrials - 1e-9);
    for (let attempt = 1; attempt <= P.practiceMaxAttempts; attempt++) {
      const list = lists.next(), recs = [];
      await this.segment({
        next: () => {
          const c = list.shift();
          return c ? { config: c, phase: 'practice', practice_attempt: attempt, attempt_index: this.practiceIndex++, requeue_count: 0, requeued_from: null } : null;
        },
        done: (r) => { this.trials.push(r); if (r.aborted) list.push(this.configOf(r)); else recs.push(r); },
      });
      const nCorrect = recs.filter((r) => r.correct === true).length, passed = nCorrect >= need;
      this.session.practice.attempts.push({ attempt, n: P.practiceTrials, n_correct: nCorrect, accuracy: nCorrect / P.practiceTrials, passed, directions: recs.map((r) => r.test_direction) });
      this.session.practice.n_attempts = attempt;
      const score = TEXT.practiceScore(nCorrect, P.practiceTrials);
      if (passed) {
        this.session.practice.passed = true;
        this.store.save('practice_passed');
        await S.message(`<p>${score}</p><p>${TEXT.practicePass}</p>`, { name: 'practice_feedback' });
        return true;
      }
      if (attempt < P.practiceMaxAttempts) {
        await S.message(`<p>${score}</p><p>${TEXT.practiceRetry(need, P.practiceTrials)}</p>`, { name: 'practice_feedback' });
      } else {
        await this.finish('practice_failed', `${score} ${TEXT.practiceFinalFail}`);
        return false;
      }
    }
    return false;
  }

  configOf(r) {
    const keys = ['trial_id', 'adaptor_type', 'eyes_condition', 'congruent', 'face_side', 'tree_side', 'gaze_direction', 'implied_direction', 'test_direction', 'grating_direction', 'grating_phase0'];
    return Object.fromEntries(keys.map((k) => [k, r[k]]));
  }

  async main() {
    const d = this.cfg.design, queue = this.trialList.map((c) => ({ config: c, requeue_count: 0, requeued_from: null }));
    const B = Math.ceil(queue.length / d.blockSize);
    for (let b = 1; queue.length > 0; b++) {
      let completed = 0;
      await this.segment({
        next: () => {
          if (completed >= d.blockSize || queue.length === 0) return null;
          const q = queue.shift();
          return { config: q.config, phase: 'main', attempt_index: this.mainAttempt++, block: b, requeue_count: q.requeue_count, requeued_from: q.requeued_from };
        },
        done: (r) => {
          this.trials.push(r);
          if (r.timed_out || r.aborted) {
            if (r.timed_out) this.nTimeouts++;
            const again = r.aborted || (d.requeueTimeouts && this.nTimeouts <= d.maxTimeoutsPerSession);
            if (again) requeueInsert(queue, { config: this.configOf(r), requeue_count: r.requeue_count + 1, requeued_from: r.attempt_index }, this.requeueRng);
            else if (d.requeueTimeouts) this.session.requeue_cap_hit = true;
          } else { completed++; r.trial_in_block = completed; }
        },
      });
      if (queue.length > 0) {
        this.store.save(`block_${b}`);
        await S.message(`<p>${TEXT.breakScreen(b, B)}</p>`, { name: 'break' });
      }
    }
    this.session.main_done = true;
    this.store.save('main_done');
  }

  mainSummary() {
    const main = this.trials.filter((t) => t.phase === 'main');
    const done = main.filter((t) => !t.timed_out && !t.aborted);
    const n = (f) => done.filter(f).length;
    const cells = { open_cong: n((t) => t.eyes_condition === 'open' && t.congruent), open_incong: n((t) => t.eyes_condition === 'open' && !t.congruent),
      blind_cong: n((t) => t.eyes_condition === 'blindfold' && t.congruent), blind_incong: n((t) => t.eyes_condition === 'blindfold' && !t.congruent) };
    if (this.cfg.design.adaptor === 'grating') Object.assign(cells, { grating_cong: n((t) => t.congruent), grating_incong: n((t) => !t.congruent) });
    return { n_completed: done.length, n_attempts: main.length, n_timeouts: main.filter((t) => t.timed_out).length,
      n_aborted: main.filter((t) => t.aborted).length, accuracy: done.length ? n((t) => t.correct) / done.length : null, cell_counts: cells };
  }

  // Terminal save (final / practice_failed / aborted) + end screen with the save status.
  async finish(reason, text) {
    this.active = false; this.ended = true;
    if (this.runner) this.runner.stop();
    const tm = this.session.timing;
    tm.end_iso = new Date().toISOString(); tm.duration_ms = Math.round(performance.now() - tm.t0);
    S.showEnd(text, 'Saving…');
    const rec = await this.store.save(reason);
    S.updateEndSave(rec.ok ? '<span class="ok">Saved to server.</span> A copy was downloaded.'
      : `<span class="warn">NOT saved to server (${rec.error}). Keep the downloaded file.</span>`);
  }

  // ---------- pause / resume / quit (SPEC §5.8) ----------
  installListeners() {
    window.addEventListener('keydown', (e) => this.onKeyDown(e), { capture: true, passive: false });
    document.addEventListener('visibilitychange', () => {
      this.logEvent('visibility', document.visibilityState);
      if (document.visibilityState === 'hidden' && this.active) this.pauseIfRunning('hidden');
    });
    const onFs = () => {
      this.logEvent('fullscreen', isFullscreen());
      if (!isFullscreen() && this.active && this.cfg.display.requireFullscreen) this.pauseIfRunning('fullscreen_lost');
    };
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
    window.addEventListener('resize', () => {
      this.logEvent('resize', { w: window.innerWidth, h: window.innerHeight });
      if (this.active && this.cal && ppdChange(this.cal, measureWindow(this.session.setup)) > this.cfg.display.ppdChangeTolerance) this.pauseIfRunning('ppd_changed');
    });
    window.addEventListener('beforeunload', (e) => { if (this.active) { e.preventDefault(); e.returnValue = ''; } });
    // iPad: no pinch/double-tap zoom or page scrolling (forms keep their own scrolling).
    for (const g of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(g, (e) => e.preventDefault(), { passive: false });
    document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('touchmove', (e) => { if (!e.target.closest('#setup, #screen')) e.preventDefault(); }, { passive: false });
  }

  onKeyDown(e) {
    const typing = e.target && e.target.closest && e.target.closest('input, textarea, select');
    if (!typing && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].some((k) => e.key === k || e.code === (k === ' ' ? 'Space' : k))) e.preventDefault();   // never scroll
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyS') {
      e.preventDefault(); e.stopPropagation();
      if (!e.repeat) setTimeout(() => this.store.manual(), 0);   // after the current frame; never blocks the loop
      return;
    }
    if (e.repeat) return;
    if (this.runner && this.runner.inTrial) {
      if (this.runner.onKey(e)) e.preventDefault();
      e.stopPropagation();
    }
  }

  pauseIfRunning(reason) {
    if (this.runner && this.runner.inTrial && !this.pauseP) this.pause(reason);
    else this.displayInvalid = reason;
  }

  // Display must be fullscreen at the calibrated ppd before any trial segment starts.
  async ensureDisplay() {
    const lost = this.cfg.display.requireFullscreen && !isFullscreen();
    const moved = ppdChange(this.cal, measureWindow(this.session.setup)) > this.cfg.display.ppdChangeTolerance;
    if (lost || moved || this.displayInvalid === 'hidden') await this.pause(lost ? 'fullscreen_lost' : moved ? 'ppd_changed' : 'hidden');
    this.displayInvalid = null;
  }

  pause(reason) {
    if (this.pauseP) return this.pauseP;
    const flag = { hidden: 'visibility_hidden_during_trial', fullscreen_lost: 'fullscreen_lost_during_trial' }[reason];
    if (flag) this.runner.flag(flag);
    const aborted = this.runner.abort(reason);
    this.logEvent('pause', { reason, aborted_attempt: aborted ? aborted.attempt_index : null });
    if (this.hooks) this.hooks.event({ type: 'pause', reason });
    this.pauseP = new Promise((resolve) => {
      const ui = S.showPause(reason, {
        resume: () => {
          const fs = this.cfg.display.requireFullscreen && !isFullscreen() ? requestFs() : null;  // inside the gesture
          this.tryResume(fs, ui).then((ok) => {
            if (!ok) return;
            this.logEvent('resume', null);
            if (this.hooks) this.hooks.event({ type: 'resume' });
            this.pauseP = null;
            S.setScreen('trials');
            this.runner.resume();
            resolve();
          });
        },
        download: () => this.store.manual(),
        quit: () => { ui.close(); this.finish('aborted', TEXT.endAborted); },
      });
    });
    return this.pauseP;
  }

  async tryResume(fsPromise, ui) {
    if (document.visibilityState === 'hidden') return false;
    if (fsPromise) { await fsPromise; await nextResize(700); }
    if (this.cfg.display.requireFullscreen && !isFullscreen()) { ui.note('Fullscreen could not be entered; press R again.'); return false; }
    if (!isLandscape()) { ui.note('Rotate the screen to landscape, then press R.'); return false; }
    if (ppdChange(this.cal, measureWindow(this.session.setup)) <= this.cfg.display.ppdChangeTolerance) {
      applyCalibration(this);
      ui.close();
      return true;
    }
    ui.close();
    this.logEvent('recalibration_required', null);
    await runCalibration(this);
    return true;
  }
}
