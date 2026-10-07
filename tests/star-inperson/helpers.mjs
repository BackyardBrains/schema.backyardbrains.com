// helpers.mjs — shared browser-test utilities: launch Chromium (global Playwright), open the experiment with
// URL params, drive the DOM screens, auto-respond to dots with real key presses, and pixel helpers.
// NOTE: ESM ignores NODE_PATH, so Playwright is loaded with createRequire (run tests with NODE_PATH=$(npm root -g)).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
export const { chromium } = require('playwright');

export const SHORT = 'itiMinMs=20&itiMaxMs=40&fixationMs=100&adaptorMs=150&tooSlowMs=200';
// SHORT timings with some values replaced (a key may appear only once in the URL).
export const shortWith = (o = {}) => Object.entries({ itiMinMs: 20, itiMaxMs: 40, fixationMs: 100, adaptorMs: 150, tooSlowMs: 200, ...o })
  .map(([k, v]) => `${k}=${v}`).join('&');
export const BASE = 'test=1&requireFullscreen=false&requireRulerCheck=false';

export async function launch() {
  return chromium.launch({
    args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  });
}

// Open /star-inperson/?<query> in a fresh context. Returns {page, context, downloads[], errors[]}.
export async function openPage(browser, server, query, { dpr = 1, width = 1600, height = 1200 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, acceptDownloads: true });
  const page = await context.newPage();
  const downloads = [], errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('download', async (d) => {
    const file = path.join(os.tmpdir(), `star-inperson-dl-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await d.saveAs(file);
    const text = fs.readFileSync(file, 'utf8');
    fs.unlinkSync(file);
    downloads.push({ name: d.suggestedFilename(), text, json: JSON.parse(text) });
  });
  const state = { policy: () => 'correct', responses: [] };
  await page.exposeFunction('__onPhase', (ev) => {
    if (ev.phase !== 'dots') return;
    const action = state.policy(ev);
    state.responses.push({ ...ev, action });
    if (action === 'none') return;
    const dir = action === 'correct' ? ev.test_direction : action === 'wrong' ? (ev.test_direction === 'left' ? 'right' : 'left') : action;
    const delay = state.delayMs ?? 0;
    setTimeout(() => page.keyboard.press(dir === 'left' ? 'ArrowLeft' : 'ArrowRight').catch(() => {}), delay);
  });
  await page.goto(`${server.url}/star-inperson/?${query}`);
  return { page, context, downloads, errors, state };
}

export const G = (page, fn, arg) => page.evaluate(fn, arg);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function waitFor(page, fn, arg, timeout = 30000) {
  return page.waitForFunction(fn, arg, { timeout, polling: 20 });
}

export async function fillSetup(page, { pid = 'TEST01', width = 38, distance = 54, preset = null, expectedHz = 60, device = 'usb_keyboard' } = {}) {
  await waitFor(page, () => window.__starInPerson && window.__starInPerson.ready);
  await page.fill('#participant_id', pid);
  if (preset !== null) await page.selectOption('#monitor_preset', String(preset));
  else await page.fill('#monitor_width_cm', String(width));
  await page.selectOption('#expected_refresh_hz', String(expectedHz));
  await page.selectOption('#input_device', device);
  await page.fill('#viewing_distance_cm', String(distance));
  await page.click('#setup-go');
}

// Calibration screen: wait for the refresh check; if it failed (e.g. expected 120 Hz on headless 60 Hz), tick the
// explicit override box (without it "Calibration OK" stays disabled, see ipad.test.mjs iPad-1). Returns 'ok'|'fail'.
export async function passCalibration(page) {
  await waitFor(page, () => document.body.dataset.screen === 'calibration');
  await waitFor(page, () => ['ok', 'fail'].includes(document.getElementById('screen').dataset.refresh), null, 20000);
  const refresh = await page.evaluate(() => document.getElementById('screen').dataset.refresh);
  if (refresh === 'fail') await page.check('#cal-override-box');
  await waitFor(page, () => !document.querySelector('#cal-ok').disabled, null, 20000);
  await page.click('#cal-ok');
  return refresh;
}

// Drive a whole session. opts.policy(ev) -> 'correct'|'wrong'|'none'|'left'|'right' per dots phase.
// opts.onScreen(name, page) may return true to take over (driver skips its default action).
// Stops at 'end' / 'error' or when opts.until(name) is true. Returns the list of screens seen.
export async function drive(ctx, opts = {}) {
  const { page, state } = ctx;
  if (opts.policy) state.policy = opts.policy;
  const seen = [];
  let handled = 0;
  const deadline = Date.now() + (opts.timeoutMs || 240000);
  for (;;) {
    if (Date.now() > deadline) throw new Error(`drive timeout; screens seen: ${seen.join(',')}`);
    const [evs, err] = await page.evaluate(() => window.__starInPerson
      ? [window.__starInPerson.events.filter((e) => e.type === 'screen').map((e) => e.name), window.__starInPerson.error] : [[], null]);
    if (err && !opts.allowError) throw new Error(`experiment error screen: ${err}`);
    if (evs.length <= handled) { await sleep(25); continue; }
    const name = evs[handled++];
    seen.push(name);
    if (opts.until && opts.until(name, seen)) return seen;
    if (opts.onScreen && (await opts.onScreen(name, page, seen))) continue;
    if (name === 'setup') await fillSetup(page, opts.setup || {});
    else if (name === 'calibration') await passCalibration(page);
    else if (['handover', 'instructions1', 'instructions2', 'practice_feedback', 'break'].includes(name)) {
      await waitFor(page, (n) => document.body.dataset.screen === n, name);
      await page.keyboard.press('Space');
    } else if (name === 'questionnaire') await fillQuestionnaire(page);
    else if (name === 'end' || name === 'error') return seen;
  }
}

export async function fillQuestionnaire(page) {
  await page.fill('#q_purpose', 'test purpose');
  await page.fill('#q_vision', 'light enters the eye');
  await page.check('input[name=q_influence][value=no]');
  await page.check('input[name=q_age][value="25_34"]');
  await page.check('input[name=experimenter_fixation_rating][value=good]');
  await page.click('#q-submit');
}

// Wait until the end screen shows a save status (terminal POST finished).
export async function waitSaved(page) {
  await waitFor(page, () => { const e = document.getElementById('end-save'); return e && !/Saving/.test(e.textContent); }, null, 60000);
}

// Luminance helper for RGBA arrays.
export const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

// Minimal PNG decoder (8-bit RGBA/RGB/GA/G, non-interlaced) using zlib — for T17 (no third-party code).
import zlib from 'node:zlib';
export function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let off = 8, width = 0, height = 0, depth = 0, ctype = 0, interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8), data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; interlace = data[12]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8 || interlace !== 0) throw new Error(`unsupported PNG depth=${depth} interlace=${interlace}`);
  const ch = { 6: 4, 2: 3, 4: 2, 0: 1 }[ctype];
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * ch, out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = out.subarray(y * stride, (y + 1) * stride), prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? row[i - ch] : 0, b = prev ? prev[i] : 0, c = prev && i >= ch ? prev[i - ch] : 0;
      let v = src[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      row[i] = v & 255;
    }
  }
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) alpha[i] = ch === 4 ? out[i * 4 + 3] : ch === 2 ? out[i * 2 + 1] : 255;
  return { width, height, channels: ch, pixels: out, alpha };
}
