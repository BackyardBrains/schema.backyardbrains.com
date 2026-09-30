// screenshots.mjs — regenerate docs/star-inperson/screenshots/*.png (not a test; run manually):
//   NODE_PATH=$(npm root -g) node tests/star-inperson/screenshots.mjs
// Trial frames are captured from the stimulus canvas itself (toDataURL inside a frame listener), so each image
// is exactly one drawn frame at 1600x1200, DPR 1, 38-cm screen at 54 cm (ppd 39.68).
import fs from 'node:fs';
import path from 'node:path';
import { startServer, REPO } from './server.mjs';
import { launch, openPage, drive, fillSetup, waitFor, BASE, shortWith } from './helpers.mjs';

const OUT = path.join(REPO, 'docs/star-inperson/screenshots');
fs.mkdirSync(OUT, { recursive: true });
const save = (name, dataUrl) => fs.writeFileSync(path.join(OUT, name), Buffer.from(dataUrl.split(',')[1], 'base64'));

const srv = await startServer();
const browser = await launch();
try {
  // 1. calibration screen (canvas + DOM panel)
  let ctx = await openPage(browser, srv, `${BASE}&seed=1`);
  await fillSetup(ctx.page);
  await waitFor(ctx.page, () => document.body.dataset.screen === 'calibration' && ['ok', 'fail'].includes(document.getElementById('screen').dataset.refresh), null, 20000);
  await ctx.page.screenshot({ path: path.join(OUT, 'calibration.png') });
  await ctx.context.close();

  // iPad emulation calibration screen (1366x1024 CSS px @2x, preset 26.3 cm)
  ctx = await openPage(browser, srv, `${BASE}&seed=1`, { dpr: 2, width: 1366, height: 1024 });
  await fillSetup(ctx.page, { preset: 0, expectedHz: 120, device: 'bt_keyboard' });
  await waitFor(ctx.page, () => document.body.dataset.screen === 'calibration' && ['ok', 'fail'].includes(document.getElementById('screen').dataset.refresh), null, 20000);
  await ctx.page.screenshot({ path: path.join(OUT, 'calibration_ipad.png') });
  await ctx.context.close();

  // 2-5. fixation, open adaptor, blindfold adaptor, dots (face-tree session, main trials)
  ctx = await openPage(browser, srv, `${BASE}&${shortWith({ adaptorMs: 300 })}&pilot=1&seed=3`);
  await ctx.page.evaluate(() => {
    const G = window.__starInPerson, S = (window.__shots = {}), dotsN = {};
    G.frameListeners.push((info, ctx) => {
      if (info.trial_phase !== 'main') return;
      const img = info.imagesDrawn.join(',');
      let key = null;
      if (info.phase === 'fixation') key = 'fixation';
      if (info.phase === 'adaptor' && img.startsWith('face_open_R')) key = 'adaptor_open_face_left';
      if (info.phase === 'adaptor' && img.startsWith('face_open_L')) key = 'adaptor_open_face_right';
      if (info.phase === 'adaptor' && img.startsWith('face_blindfold_R')) key = 'adaptor_blindfold_face_left';
      if (info.phase === 'adaptor' && img.startsWith('face_blindfold_L')) key = 'adaptor_blindfold_face_right';
      if (info.phase === 'dots') { dotsN[info.attempt_index] = (dotsN[info.attempt_index] || 0) + 1; if (dotsN[info.attempt_index] === 10) key = 'dots'; }
      if (key && !S[key]) S[key] = ctx.canvas.toDataURL('image/png');
    });
  });
  ctx.state.delayMs = 400;
  await drive(ctx, { policy: () => 'correct' });
  const shots = await ctx.page.evaluate(() => window.__shots);
  for (const [k, v] of Object.entries(shots)) save(`${k}.png`, v);
  await ctx.context.close();

  // 6. grating adaptor frame
  ctx = await openPage(browser, srv, `${BASE}&${shortWith({ adaptorMs: 600 })}&adaptor=grating&pilot=1&seed=4`);
  await ctx.page.evaluate(() => {
    const G = window.__starInPerson, n = {};
    G.frameListeners.push((info, ctx) => {
      if (info.phase !== 'adaptor' || info.trial_phase !== 'main') return;
      n[info.attempt_index] = (n[info.attempt_index] || 0) + 1;
      if (n[info.attempt_index] === 10 && !window.__grating) window.__grating = ctx.canvas.toDataURL('image/png');
    });
  });
  await drive(ctx, { policy: () => 'correct' });
  save('grating.png', await ctx.page.evaluate(() => window.__grating));
  await ctx.context.close();
  console.log('wrote', fs.readdirSync(OUT).join(', '));
} finally { await browser.close(); await srv.close(); }
