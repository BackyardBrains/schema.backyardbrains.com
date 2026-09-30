// trialRunner.js — ONE continuous requestAnimationFrame state machine (SPEC §5.2-5.6).
// States: IDLE | ITI -> FIXATION -> ADAPTOR -> DOTS -> (response) -> ITI of the next trial,
//                                              DOTS -> (timeout) -> TOO_SLOW -> ITI of the next trial.
// No DOM changes, no awaits and no new canvases between fixation, adaptor and dots. Trials are pulled
// synchronously from a provider {next(): spec|null, done(record)} so the next ITI starts on the same frame.
import { makeEngine } from './rdk.js';
import { mulberry32, makeStream, dotsSeed, uniform } from './rng.js';
import { drawFaceTree, drawGrating } from './adaptors.js';
import { TEXT } from './text.js';

export const IDLE = 'idle', ITI = 'iti', FIXATION = 'fixation', ADAPTOR = 'adaptor', DOTS = 'dots', TOO_SLOW = 'too_slow';
const IN_TRIAL = [ITI, FIXATION, ADAPTOR, DOTS, TOO_SLOW];
const NO_IMAGES = [];
const r1 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// KeyboardEvent.timeStamp is used only if it is verifiably on the performance.now() timebase: it must not be in
// the future and at most 50 ms before handler entry; otherwise fall back to performance.now() at handler entry.
// (iPad rig amendment; Safari also coarsens both clocks to ~1 ms.)
export function keyTime(evTs, handlerNow) {
  const d = handlerNow - evTs;
  return Number.isFinite(evTs) && d >= 0 && d <= 50 ? { t: evTs, timebase: 'event' } : { t: handlerNow, timebase: 'handler' };
}

// Map a keydown to 'left' | 'right' | null. Accepts KeyboardEvent.key or .code (BT keyboards on Safari).
export function keyDirection(e, keys) {
  if (e.key === keys.keyLeft || e.code === keys.keyLeft) return 'left';
  if (e.key === keys.keyRight || e.code === keys.keyRight) return 'right';
  return null;
}

// Canonical key name for a recognised direction ('ArrowLeft' / 'ArrowRight'), whatever .key/.code reported.
export const canonicalKey = (dir, keys) => (dir === 'left' ? keys.keyLeft : dir === 'right' ? keys.keyRight : null);

export class TrialRunner {
  constructor({ stage, cfg, seed, display, hooks = null, session = {} }) {
    this.stage = stage; this.cfg = cfg; this.seed = seed; this.hooks = hooks; this.session = session;
    this.frameMs = display.refresh_median_interval_ms;
    this.refreshHz = display.refresh_hz_est;
    this.itiRng = makeStream(seed, 'iti');
    this.state = IDLE; this.T = null; this.provider = null; this.resolveSegment = null;
    this.pullOnNextFrame = false; this.looping = false;
    this._frame = this._frame.bind(this);
  }

  get inTrial() { return IN_TRIAL.includes(this.state); }

  // Run trials from `provider` until provider.next() returns null. Resolves then (state IDLE).
  runSegment(provider) {
    this.provider = provider;
    this.pullOnNextFrame = true;
    if (!this.looping) { this.looping = true; requestAnimationFrame(this._frame); }
    return new Promise((resolve) => { this.resolveSegment = resolve; });
  }

  resume() { if (this.provider) this.pullOnNextFrame = true; }
  stop() { this.looping = false; }

  // Keyboard input (the experiment's capture-phase keydown listener forwards here). Returns true if consumed.
  onKey(e) {
    const handlerNow = performance.now();
    const T = this.T;
    if (!T || !this.inTrial) return false;
    const dir = keyDirection(e, this.cfg.keys), kt = keyTime(e.timeStamp, handlerNow);
    if (this.state === DOTS) {
      if (dir && !T.response) {
        T.response = { keyRaw: e.key, codeRaw: e.code, dir, evTs: e.timeStamp, handlerNow, t: kt.t, timebase: kt.timebase };
      }
      return !!dir;
    }
    (this.state === TOO_SLOW ? T.lateKeys : T.anticipatoryKeys).push({ key: e.key, t: kt.t });
    return !!dir;
  }

  flag(name) { if (this.T && this.inTrial) this.T.flags[name] = true; }

  // Abort the running trial now (pause). Its record goes to provider.done(); the loop idles until resume().
  abort(reason) {
    if (!this.T || !this.inTrial) return null;
    const rec = this._record(this.T, { aborted: true, abortReason: reason, endTs: performance.now() });
    this.T = null;
    this._enterIdle();
    this.provider.done(rec);
    return rec;
  }

  _enterIdle() { this.state = IDLE; this.stage.clear(); }

  _frame(ts) {
    if (!this.looping) return;
    requestAnimationFrame(this._frame);
    if (this.pullOnNextFrame) { this.pullOnNextFrame = false; this._pull(ts); }
    if (this.state === IDLE) return;
    this.T.frameTs.push(ts);
    this._advance(ts);
    if (this.state === IDLE) return;
    this._draw(ts);
  }

  _pull(ts) {
    const spec = this.provider.next();
    if (spec) { this._startTrial(spec, ts); return; }
    this._enterIdle();
    const r = this.resolveSegment; this.resolveSegment = null; this.provider = null;
    if (r) r();
  }

  _startTrial(spec, ts) {
    const cfg = this.cfg, c = spec.config;
    const seed = dotsSeed(this.seed, spec.phase, spec.attempt_index);
    const hooks = this.hooks;
    const log = hooks && hooks.logDots ? (entry) => hooks.logDots(spec.attempt_index, spec.phase, entry) : null;
    const aperture = { widthDeg: cfg.rdk.apertureWidthDeg, heightDeg: cfg.rdk.apertureHeightDeg, refreshHz: this.refreshHz };
    this.T = {
      spec, dotsSeed: seed,
      engine: makeEngine(cfg.rdk.engine, cfg.rdk, aperture, c.test_direction === 'right' ? 1 : -1, mulberry32(seed), log),
      itiPlanned: uniform(this.itiRng, cfg.timing.itiMinMs, cfg.timing.itiMaxMs),
      onset: { iti: ts }, phaseOnset: ts, frameTs: [ts], response: null,
      anticipatoryKeys: [], lateKeys: [], imagesDrawn: new Set(), adaptorFrames: 0,
      dotsFrames: 0, dotsWorkMax: 0, flags: {}, timedOut: false,
    };
    this.state = ITI;
    this._phaseEvent(ITI, ts);
  }

  _enter(state, ts) {
    this.state = state;
    this.T.phaseOnset = ts;
    this.T.onset[state] = ts;
    this._phaseEvent(state, ts);
  }

  _phaseEvent(phase, ts) {
    if (!this.hooks) return;
    const s = this.T.spec;
    this.hooks.onPhase({ type: 'phase', phase, ts, attempt_index: s.attempt_index, trial_phase: s.phase, test_direction: s.config.test_direction });
  }

  _advance(ts) {
    const T = this.T, t = this.cfg.timing, half = this.frameMs / 2, el = ts - T.phaseOnset;
    switch (this.state) {
      case ITI: if (el >= T.itiPlanned - half) this._enter(FIXATION, ts); break;
      case FIXATION: if (el >= t.fixationMs - half) this._enter(ADAPTOR, ts); break;
      case ADAPTOR: if (el >= t.adaptorMs - half) this._enter(DOTS, ts); break;
      case DOTS:
        if (T.response) this._finish(ts, ts);
        else if (ts - T.onset.dots >= t.responseWindowMs - half) { T.timedOut = true; T.onset.dots_offset = ts; this._enter(TOO_SLOW, ts); }
        break;
      case TOO_SLOW: if (el >= t.tooSlowMs - half) this._finish(ts, T.onset.dots_offset); break;
      default: break;
    }
  }

  _finish(ts, dotsOffsetTs) {
    const rec = this._record(this.T, { dotsOffsetTs, endTs: ts });
    this.T = null;
    this.provider.done(rec);
    this._pull(ts);   // next trial's ITI starts on this very frame
  }

  _draw(ts) {
    const st = this.stage, T = this.T;
    let nDots = 0, images = NO_IMAGES, fixationDrawn = false;
    st.clear();
    if (this.state === FIXATION) { st.drawFixation(); fixationDrawn = true; }
    else if (this.state === ADAPTOR) {
      const c = T.spec.config;
      if (c.adaptor_type === 'face_tree') images = drawFaceTree(st, c);
      else if (c.adaptor_type === 'grating') images = drawGrating(st, c, (ts - T.onset.adaptor) / 1000);
      for (let i = 0; i < images.length; i++) T.imagesDrawn.add(images[i]);
      T.adaptorFrames++;
    } else if (this.state === DOTS) {
      const t0 = performance.now();
      const f = T.engine.frame(ts);
      st.drawDots(f);
      T.dotsWorkMax = Math.max(T.dotsWorkMax, performance.now() - t0);
      T.dotsFrames++; nDots = f.n;
    } else if (this.state === TOO_SLOW) st.drawText(TEXT.tooSlow, 1, 0);
    if (this.hooks) {
      this.hooks.onFrame({ ts, phase: this.state, attempt_index: T.spec.attempt_index, trial_phase: T.spec.phase, nDots, imagesDrawn: images, fixationDrawn }, st.ctx);
    }
  }

  // Build the per-trial record (SPEC §7.2).
  _record(T, { dotsOffsetTs = null, endTs, aborted = false, abortReason = null }) {
    const s = T.spec, c = s.config, o = T.onset, cfg = this.cfg;
    const dotsOn = o.dots ?? null;
    const offset = aborted ? (dotsOn !== null ? endTs : null) : dotsOffsetTs;
    const resp = !aborted && T.response ? T.response : null;
    const rel = (arr) => arr.map((k) => ({ key: k.key, t_rel_dots_onset_ms: dotsOn !== null ? r1(k.t - dotsOn) : null }));
    // frame intervals from fixation onset to dots offset (or last frame) and within the dots phase
    const hi = offset ?? T.frameTs[T.frameTs.length - 1];
    const trialIv = [], dotsIv = [];
    for (let i = 1; i < T.frameTs.length; i++) {
      const a = T.frameTs[i - 1], b = T.frameTs[i];
      if (o.fixation !== undefined && a >= o.fixation && b <= hi) trialIv.push(b - a);
      if (dotsOn !== null && a >= dotsOn && b <= hi) dotsIv.push(b - a);
    }
    const thr = cfg.timing.droppedFrameFactor * this.frameMs;
    const dropped = trialIv.filter((x) => x > thr).length;
    const es = dotsOn !== null ? T.engine.stats() : null;
    const congruent = c.congruent;
    const rec = {
      session_uuid: this.session.session_uuid, participant_id: this.session.participant_id,
      phase: s.phase, practice_attempt: s.practice_attempt ?? null, attempt_index: s.attempt_index,
      trial_id: c.trial_id, requeue_count: s.requeue_count, requeued_from: s.requeued_from,
      block: s.block ?? null, trial_in_block: null,
      adaptor_type: c.adaptor_type, eyes_condition: c.eyes_condition,
      face_direction: c.adaptor_type === 'face_tree' ? 'towards' : null,
      face_side: c.face_side, tree_side: c.tree_side, gaze_direction: c.gaze_direction,
      implied_direction: c.implied_direction, test_direction: c.test_direction,
      congruent, congruent_gaze: c.gaze_direction ? c.test_direction === c.gaze_direction : null,
      grating_direction: c.grating_direction, grating_phase0: c.grating_phase0,
      face_img: c.adaptor_type === 'face_tree' ? `face_${c.eyes_condition}_${c.face_side === 'left' ? 'R' : 'L'}.png` : null,
      tree_img: c.adaptor_type === 'face_tree' ? 'tree.png' : null,
      tree_mirrored: c.adaptor_type === 'face_tree' ? c.face_side === 'right' && cfg.geometry.mirrorTreeWithSide : null,
      adaptor_images_drawn: [...T.imagesDrawn], adaptor_frames_drawn: T.adaptorFrames,
      // response_key is the canonical recognised key; the raw .key/.code are kept separately (Safari BT keyboards
      // may report key 'Unidentified'). Invariant: rt_ms = (rt_timebase === 'event' ? key_event_ts : key_handler_ts)
      // - dots_onset_ts; key_event_ts is null when KeyboardEvent.timeStamp failed the timebase check (raw kept).
      response: resp ? resp.dir : null, response_key: resp ? canonicalKey(resp.dir, cfg.keys) : null,
      response_key_raw: resp ? resp.keyRaw ?? null : null, response_code_raw: resp ? resp.codeRaw ?? null : null,
      correct: resp ? resp.dir === c.test_direction : null,
      timed_out: !aborted && T.timedOut, aborted, abort_reason: abortReason,
      rt_ms: resp ? r1(r1(resp.t) - r1(dotsOn)) : null,
      rt_timebase: resp ? resp.timebase : null,
      rt_handler_ms: resp ? r1(r1(resp.handlerNow) - r1(dotsOn)) : null,
      key_event_ts: resp && resp.timebase === 'event' ? r1(resp.evTs) : null,
      key_event_ts_raw: resp ? r1(resp.evTs) : null, key_handler_ts: resp ? r1(resp.handlerNow) : null,
      anticipatory_keys: rel(T.anticipatoryKeys), late_keys: rel(T.lateKeys),
      iti_planned_ms: r1(T.itiPlanned),
      iti_actual_ms: o.fixation !== undefined ? r1(o.fixation - o.iti) : null,
      fixation_actual_ms: o.adaptor !== undefined ? r1(o.adaptor - o.fixation) : null,
      adaptor_actual_ms: dotsOn !== null ? r1(dotsOn - o.adaptor) : null,
      trial_start_ts: r1(o.iti), fixation_onset_ts: r1(o.fixation), adaptor_onset_ts: r1(o.adaptor),
      dots_onset_ts: r1(dotsOn), dots_offset_ts: r1(offset),
      onset_latency_ms: dotsOn !== null ? r1(dotsOn - (o.adaptor + cfg.timing.adaptorMs)) : null,
      dots_frames_drawn: T.dotsFrames,
      dots_frame_interval_median_ms: r1(median(dotsIv)),
      dots_frame_interval_max_ms: dotsIv.length ? r1(Math.max(...dotsIv)) : null,
      dropped_frames_n: dropped, has_dropped_frame: dropped > 0,
      max_frame_interval_ms: trialIv.length ? r1(Math.max(...trialIv)) : null,
      rdk_engine: cfg.rdk.engine,
      n_dots_per_frame_mean: es ? es.nPerFrameMean : null, n_dots_per_frame_min: es ? es.nPerFrameMin : null,
      n_dots_per_frame_max: es ? es.nPerFrameMax : null, n_coherent_per_frame_mean: es ? es.coherentPerFrameMean : null,
      measured_speed_deg_s: es && es.measuredSpeedDegPerSec !== null ? Math.round(es.measuredSpeedDegPerSec * 1e4) / 1e4 : null,
      dot_size_device_px: this.stage.dotSizePx(),
      dots_seed: T.dotsSeed,
      dots_frame_work_ms_max: r1(T.dotsWorkMax),
      visibility_hidden_during_trial: !!T.flags.visibility_hidden_during_trial,
      fullscreen_lost_during_trial: !!T.flags.fullscreen_lost_during_trial,
    };
    if (cfg.data.saveFrameIntervals) rec.dots_frame_intervals_ms = dotsIv.map(r1);
    return rec;
  }
}
