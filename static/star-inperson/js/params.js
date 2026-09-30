// params.js — effective parameters = CONFIG (+ PILOT_PRESET if ?pilot=1) + URL overrides; validated; frozen.
// Pure: no DOM access. Any problem is returned in `errors` and the caller shows a fatal screen (SPEC §3.5).
import { CONFIG, PILOT_PRESET, ENUMS, RANGES, NOT_OVERRIDABLE } from './config.js';

const RESERVED = ['pid', 'seed', 'pilot', 'test', 'logDots', 'diag', 'keytest'];

// [{group, key, value}] for every leaf (a direct child of a group).
export function leafEntries(cfg = CONFIG) {
  const out = [];
  for (const [group, obj] of Object.entries(cfg)) {
    for (const [key, value] of Object.entries(obj)) out.push({ group, key, value });
  }
  return out;
}

export function findLeaf(cfg, key) {
  for (const [group, obj] of Object.entries(cfg)) if (Object.hasOwn(obj, key)) return group;
  return null;
}

export function deepCopy(x) { return JSON.parse(JSON.stringify(x)); }

export function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

const isTrue = (s) => s === '1' || s === 'true';

// Parse a string override using the type of the default value. Returns {value} or {error}.
function parseValue(key, raw, def) {
  if (typeof def === 'number') {
    if (raw.trim() === '') return { error: `${key}: empty number` };
    const v = Number(raw);
    return Number.isFinite(v) ? { value: v } : { error: `${key}: "${raw}" is not a finite number` };
  }
  if (typeof def === 'boolean') {
    if (['true', '1'].includes(raw)) return { value: true };
    if (['false', '0'].includes(raw)) return { value: false };
    return { error: `${key}: "${raw}" is not a boolean (true|false|1|0)` };
  }
  if (Array.isArray(def)) {
    const parts = raw.split(',').map((s) => Number(s.trim()));
    if (parts.length !== def.length || parts.some((v) => !Number.isFinite(v))) {
      return { error: `${key}: "${raw}" must be ${def.length} comma-separated numbers` };
    }
    return { value: parts };
  }
  if (typeof def === 'string') {
    if (ENUMS[key] && !ENUMS[key].includes(raw)) return { error: `${key}: "${raw}" not in ${ENUMS[key].join('|')}` };
    return { value: raw };
  }
  return { error: `${key}: not overridable` };
}

// Validation of the whole effective config (fatal errors).
export function validate(cfg) {
  const errors = [];
  for (const { key, value } of leafEntries(cfg)) {
    const r = RANGES[key];
    if (!r) continue;
    const vals = Array.isArray(value) ? value : [value];
    for (const v of vals) {
      if (typeof v !== 'number' || !Number.isFinite(v) || v < r[0] || v > r[1]) {
        errors.push(`${key}: ${JSON.stringify(value)} out of range [${r[0]}, ${r[1]}]`);
        break;
      }
    }
  }
  const t = cfg.timing, d = cfg.design, p = cfg.practice, k = cfg.rdk;
  if (!Number.isInteger(d.trialsPerCell) || d.trialsPerCell < 2 || d.trialsPerCell % 2 !== 0) {
    errors.push(`trialsPerCell: ${d.trialsPerCell} must be an even integer >= 2`);
  }
  for (const key of ['itiMinMs', 'itiMaxMs', 'fixationMs', 'adaptorMs', 'responseWindowMs', 'tooSlowMs']) {
    if (!(t[key] > 0)) errors.push(`${key}: duration must be > 0`);
  }
  if (t.itiMinMs > t.itiMaxMs) errors.push('itiMinMs must be <= itiMaxMs');
  if (!Number.isInteger(d.blockSize) || d.blockSize < 1) errors.push('blockSize must be an integer >= 1');
  if (!Number.isInteger(p.practiceTrials) || p.practiceTrials < 1) errors.push('practiceTrials must be an integer >= 1');
  if (!(p.practicePassAccuracy > 0 && p.practicePassAccuracy <= 1)) errors.push('practicePassAccuracy must be in (0, 1]');
  if (!(k.coherence >= 0 && k.coherence <= 1)) errors.push('coherence must be in [0, 1]');
  if (!ENUMS.engine.includes(k.engine)) errors.push(`engine: ${k.engine} not allowed`);
  if (!ENUMS.adaptor.includes(d.adaptor)) errors.push(`adaptor: ${d.adaptor} not allowed`);
  return errors;
}

export function experimentName(cfg, { pilot, test }) {
  return cfg.meta.experimentName + (cfg.design.adaptor === 'grating' ? '-grating' : '')
    + (pilot ? '-pilot' : '') + (test ? '-test' : '');
}

// search: a URL query string ("?a=1&b=2" or URLSearchParams). Returns the resolved parameter bundle.
export function resolveParams(search, base = CONFIG, preset = PILOT_PRESET) {
  const sp = search instanceof URLSearchParams ? search : new URLSearchParams(search || '');
  const errors = [];
  const cfg = deepCopy(base);
  const pilot = isTrue(sp.get('pilot'));
  const test = isTrue(sp.get('test'));
  const logDots = test && isTrue(sp.get('logDots'));
  const diag = isTrue(sp.get('diag'));
  const keytest = isTrue(sp.get('keytest'));
  if (pilot) for (const [key, v] of Object.entries(preset)) cfg[findLeaf(cfg, key)][key] = v;

  let seed = null;
  if (sp.has('seed')) {
    const s = Number(sp.get('seed'));
    if (Number.isInteger(s) && s >= 0 && s <= 0xffffffff) seed = s;
    else errors.push(`seed: "${sp.get('seed')}" must be an integer 0..4294967295`);
  }

  const overrides = {};
  const seen = new Set();
  for (const [key, raw] of sp.entries()) {
    if (RESERVED.includes(key)) continue;
    if (seen.has(key)) { errors.push(`${key}: given twice`); continue; }
    seen.add(key);
    const group = findLeaf(cfg, key);
    if (!group) { errors.push(`unknown parameter "${key}"`); continue; }
    if (NOT_OVERRIDABLE.includes(key)) { errors.push(`${key}: not overridable`); continue; }
    const r = parseValue(key, raw, base[group][key]);
    if (r.error) { errors.push(r.error); continue; }
    overrides[key] = { default: base[group][key], value: r.value };
    cfg[group][key] = r.value;
  }
  errors.push(...validate(cfg));
  const overridden = Object.keys(overrides).some((k) => k !== 'adaptor');
  return {
    config: deepFreeze(cfg),
    overrides,
    overridden,
    pilot, test, logDots, seed, diag, keytest,
    pid: sp.get('pid') || '',
    errors,
    experimentName: experimentName(cfg, { pilot, test }),
  };
}

// Planned participant time in minutes (SPEC §5.9), from the effective config.
export function estimateMinutes(cfg) {
  const t = cfg.timing;
  const nMain = cfg.design.trialsPerCell * (cfg.design.adaptor === 'grating' ? 2 : 4);
  const trialS = ((t.itiMinMs + t.itiMaxMs) / 2 + t.fixationMs + t.adaptorMs + 750) / 1000;
  const blocks = Math.ceil(nMain / cfg.design.blockSize);
  const mainS = nMain * trialS * 1.03 + (blocks - 1) * 30;
  const practiceS = cfg.practice.practiceTrials * trialS;
  return { low: (mainS + practiceS + 180) / 60, high: (mainS + 2 * practiceS + 300) / 60, nMain, blocks };
}
