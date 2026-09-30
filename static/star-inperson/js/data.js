// data.js — payload building, serialised POSTs with retries, local downloads, localStorage backups,
// and the runtime code fingerprint (SPEC §3.5, §7).
import { sha256Hex } from './stage.js';

// Every file the page loads (relative to static/star-inperson/). Keep in sync with the file tree (test T30 checks).
export const CODE_FILES = [
  'index.html', 'manifest.webmanifest', 'css/star-inperson.css',
  'js/adaptors.js', 'js/calibration.js', 'js/config.js', 'js/data.js', 'js/design.js', 'js/diag.js', 'js/experiment.js',
  'js/keytest.js', 'js/main.js', 'js/params.js', 'js/rdk.js', 'js/rng.js', 'js/screens.js', 'js/setupFlow.js', 'js/stage.js',
  'js/testHooks.js', 'js/text.js', 'js/trialRunner.js',
  'img/face_blindfold_L.png', 'img/face_blindfold_R.png', 'img/face_open_L.png', 'img/face_open_R.png', 'img/tree.png',
];

export async function computeFingerprint() {
  if (!(globalThis.crypto && crypto.subtle)) return { code_fingerprint: 'unavailable', file_hashes: {} };
  const file_hashes = {};
  for (const f of CODE_FILES) {
    const res = await fetch(f, { cache: 'no-store' });
    if (!res.ok) throw new Error(`fingerprint: cannot fetch ${f} (HTTP ${res.status})`);
    file_hashes[f] = await sha256Hex(await res.arrayBuffer());
  }
  const lines = Object.keys(file_hashes).sort().map((p) => `${p}:${file_hashes[p]}\n`).join('');
  return { code_fingerprint: await sha256Hex(new TextEncoder().encode(lines)), file_hashes };
}

const BACKUP_PREFIX = 'star-inperson:backup:';
const BACKUP_KEEP = 20;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Flags per save_reason (SPEC §7.4 table).
function flagsFor(reason, current) {
  if (reason === 'final') return { partial: false, complete: true, status: 'complete' };
  if (reason === 'practice_failed') return { partial: false, complete: true, status: 'practice_failed' };
  if (reason === 'aborted') return { partial: false, complete: true, status: 'aborted' };
  return { partial: true, complete: false, status: current || 'in_progress' };
}
export const TERMINAL = ['final', 'practice_failed', 'aborted'];

export class DataStore {
  // getState() -> {session, trials}: the live objects (serialised at save time).
  constructor({ cfg, experiment, uuid, getState, hooks = null, logEvent }) {
    this.cfg = cfg; this.experiment = experiment; this.uuid = uuid;
    this.getState = getState; this.hooks = hooks; this.logEvent = logEvent;
    this.chain = Promise.resolve();
    this.seq = 0;
    this.lastOk = null;
  }

  // Build an envelope string for `reason` (increments save_seq). Returns {text, bytes, trimmedText}.
  build(reason) {
    const { session, trials } = this.getState();
    Object.assign(session, flagsFor(reason, session.status));
    session.save_seq = ++this.seq;
    session.save_reason = reason;
    session.saved_at_iso = new Date().toISOString();
    const env = { experiment: this.experiment, UUID: this.uuid, data: { session, trials } };
    let text = JSON.stringify(env);
    let bytes = new TextEncoder().encode(text).length;
    let postText = text;
    if (bytes > this.cfg.data.maxPayloadBytes) {
      this.logEvent('payload_trimmed', { bytes, max: this.cfg.data.maxPayloadBytes });
      text = JSON.stringify(env);          // includes the event
      const slim = trials.map(({ dots_frame_intervals_ms, ...rest }) => rest);
      postText = JSON.stringify({ experiment: this.experiment, UUID: this.uuid, data: { session, trials: slim } });
      bytes = new TextEncoder().encode(postText).length;
    }
    if (this.hooks) this.hooks.payload(JSON.parse(text));
    return { text, postText, bytes, seq: session.save_seq };
  }

  // Serialised save: POST (unless manual) + download on terminal saves + localStorage backup.
  save(reason) {
    const p = this.chain.then(() => this._save(reason));
    this.chain = p.catch(() => {});
    return p;
  }

  async _save(reason) {
    const env = this.build(reason);
    const terminal = TERMINAL.includes(reason);
    if (terminal && this.cfg.data.autoDownloadAtEnd) this._download(reason, env.text);
    const out = await this._post(env.postText);
    const rec = { seq: env.seq, reason, t_iso: new Date().toISOString(), ok: out.ok, http_status: out.status, bytes: env.bytes, error: out.error };
    this.getState().session.saves.push(rec);
    this.logEvent('save', { reason, seq: env.seq, ok: out.ok });
    if (this.hooks) this.hooks.event({ type: 'save', reason, seq: env.seq, ok: out.ok });
    this.lastOk = out.ok;
    this._backup(env.text);
    return rec;
  }

  // Experimenter download (Ctrl+Shift+S or pause [D]): no POST; serialised after pending saves.
  manual() {
    const p = this.chain.then(() => {
      const env = this.build('manual');
      this._download('manual', env.text);
      this.getState().session.saves.push({ seq: env.seq, reason: 'manual', t_iso: new Date().toISOString(), ok: true, http_status: null, bytes: env.bytes, error: null, download_only: true });
      this._backup(env.text);
    });
    this.chain = p.catch(() => {});
    return p;
  }

  async _post(body) {
    const d = this.cfg.data;
    let last = { ok: false, status: null, error: 'not attempted' };
    for (let attempt = 0; attempt <= d.postRetries; attempt++) {
      if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1));
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), d.postTimeoutMs);
      try {
        const res = await fetch(d.dataUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: ac.signal });
        let json = null;
        try { json = await res.json(); } catch (e) { json = null; }
        if (res.ok && json && json.status === 'ok') return { ok: true, status: res.status, error: null };
        last = { ok: false, status: res.status, error: (json && json.error) || `HTTP ${res.status}` };
      } catch (e) {
        last = { ok: false, status: null, error: String(e && e.name === 'AbortError' ? 'timeout' : e) };
      } finally { clearTimeout(timer); }
    }
    return last;
  }

  fileName(reason) {
    const pid = this.getState().session.setup.participant_id || 'noid';
    return `${this.experiment}_${pid}_${this.uuid}_${reason}.json`;
  }

  _download(reason, text) {
    const name = this.fileName(reason);
    downloadText(name, text);
    this.logEvent('download', { reason, name });
    if (this.hooks) this.hooks.event({ type: 'download', reason, name });
  }

  _backup(text) {
    try {
      const key = BACKUP_PREFIX + this.uuid;
      const order = listBackupKeys().filter((k) => k !== key);
      for (;;) {
        try { localStorage.setItem(key, text); break; } catch (e) {
          if (!order.length) throw e;
          localStorage.removeItem(order.shift());     // quota exceeded: drop the oldest backup and retry
        }
      }
      order.push(key);
      while (order.length > BACKUP_KEEP) localStorage.removeItem(order.shift());
      localStorage.setItem(BACKUP_PREFIX + 'order', JSON.stringify(order));
    } catch (e) { /* backup is best-effort */ }
  }
}

function listBackupKeys() {
  try {
    const order = JSON.parse(localStorage.getItem(BACKUP_PREFIX + 'order') || '[]');
    return order.filter((k) => localStorage.getItem(k) !== null);
  } catch (e) { return []; }
}
export function countBackups() { return listBackupKeys().length; }
export function downloadBackups() {
  for (const k of listBackupKeys()) downloadText(`${k.replace(/:/g, '_')}.json`, localStorage.getItem(k));
}

export function downloadText(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Environment block (SPEC §7.3).
export function environmentInfo() {
  let gpu = null;
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
  } catch (e) { gpu = null; }
  const ua = navigator.userAgentData;
  return {
    user_agent: navigator.userAgent,
    ua_data: ua ? { brands: ua.brands, platform: ua.platform, mobile: ua.mobile } : null,
    platform: navigator.platform, language: navigator.language,
    hardware_concurrency: navigator.hardwareConcurrency ?? null, device_memory: navigator.deviceMemory ?? null,
    gpu_renderer: gpu, color_depth: screen.colorDepth,
  };
}
