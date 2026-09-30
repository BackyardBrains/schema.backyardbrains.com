// testHooks.js — window.__starInPerson, installed ONLY with ?test=1 (SPEC §10). Nothing here runs in real sessions.
// Tests read events/frames/payloads, register frameListeners (info, ctx) called synchronously after each
// frame is drawn, and convert degrees to device px with the same math the stage uses.
import { probeDeg, faceTreeLayout } from './adaptors.js';

export function installTestHooks({ logDots }) {
  const G = {
    ready: false,
    error: null,
    config: null,
    events: [],
    frames: [],
    payloads: [],
    frameListeners: [],
    dotLog: logDots ? [] : null,
    _trials: null,
    _stage: null,
    _calibLayout: null,
    trials() { return G._trials ? JSON.parse(JSON.stringify(G._trials())) : []; },
    screen() { return document.body.dataset.screen; },
    degToDevice(x, y) { const s = G._stage; return [s.X(x), s.Y(y)]; },
    stageInfo() {
      const s = G._stage;
      if (!s || !s.cal) return null;
      return { ppdCss: s.cal.ppdCss, ppdDevice: s.cal.ppdDevice, dprEffective: s.cal.dprEff, canvasW: s.canvas.width, canvasH: s.canvas.height, dotSizePx: s.dotSizePx() };
    },
    calibrationLayout() { return G._calibLayout; },
    probeDeg(side) { return probeDeg(G.config, side); },
    layout(side, eyes) { return faceTreeLayout(G.config, side, eyes); },
  };
  window.__starInPerson = G;

  // Hooks handed to the experiment / trial runner.
  return {
    G,
    onFrame(info, ctx) {
      G.frames.push(info);
      for (const f of G.frameListeners) {
        try { f(info, ctx); } catch (e) { G.events.push({ t: performance.now(), type: 'listener_error', detail: String(e) }); }
      }
    },
    onPhase(ev) {
      G.events.push(ev);
      if (typeof window.__onPhase === 'function') window.__onPhase(ev);   // Playwright exposeFunction responder
    },
    logDots: logDots ? (attemptIndex, phase, entry) => G.dotLog.push({ attempt_index: attemptIndex, phase, ...entry }) : null,
    event(ev) { G.events.push({ t: performance.now(), ...ev }); },
    payload(env) { G.payloads.push(env); },
    screen(name) { G.events.push({ t: performance.now(), type: 'screen', name }); if (typeof window.__onScreen === 'function') window.__onScreen(name); },
  };
}
