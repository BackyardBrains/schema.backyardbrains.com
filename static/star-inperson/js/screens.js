// screens.js — every DOM screen: setup, calibration panel, text screens, questionnaire, pause, end, error.
// Screens never appear inside a trial (the trial loop only draws on the canvas). body[data-screen] names the
// current screen (used by the cursor CSS and by the test hooks).
import { TEXT } from './text.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let screenListener = null;
export function onScreenChange(f) { screenListener = f; }
export function setScreen(name) {
  document.body.dataset.screen = name;
  if (screenListener) screenListener(name);
}

function show(html, cls = '', name = 'message') {
  const el = $('screen');
  el.className = cls;
  el.innerHTML = html;
  el.hidden = false;
  setScreen(name);
  return el;
}
export function hide() { $('screen').hidden = true; $('screen').innerHTML = ''; }

// KeyboardEvent.code for a key value (' ' -> Space, 'f' -> KeyF): keys match by .key OR .code (Safari BT keyboards).
const codeOf = (k) => (k === ' ' ? 'Space' : /^[a-z]$/i.test(k) ? `Key${k.toUpperCase()}` : k);
export const keyMatches = (e, keys) => keys.includes(e.key) || keys.some((k) => codeOf(k) === e.code);

// Resolve when one of `keys` (KeyboardEvent.key values) is pressed; ignores auto-repeat.
export function waitKey(keys, handler = null) {
  return new Promise((resolve) => {
    const on = (e) => {
      if (e.repeat || !keyMatches(e, keys)) return;
      e.preventDefault();
      window.removeEventListener('keydown', on);
      if (handler) handler(e);
      resolve(e.key);
    };
    window.addEventListener('keydown', on);
  });
}

// Text screen; resolves on one of `keys` (or, with tap: true, on a click/tap — experimenter screens only).
export function message(html, { name = 'message', keys = [' '], tap = false } = {}) {
  const el = show(html, 'center', name);
  return new Promise((resolve) => {
    const done = (k) => { window.removeEventListener('keydown', on); el.onclick = null; hide(); resolve(k); };
    const on = (e) => { if (!e.repeat && keyMatches(e, keys)) { e.preventDefault(); done(e.key); } };
    window.addEventListener('keydown', on);
    if (tap) el.onclick = () => done('tap');
  });
}

export function showRotate(on) {
  let el = $('rotate');
  if (!el) { el = document.createElement('div'); el.id = 'rotate'; el.textContent = 'Please rotate the screen to landscape.'; document.body.appendChild(el); }
  el.hidden = !on;
  if (on) setScreen('rotate');
}

export function setRefreshReadout(html) { $('refresh-readout').innerHTML = html; }
export function expectedRefresh() { return Number($('expected_refresh_hz').value); }

export function showError(msg) {
  document.getElementById('setup').hidden = true;
  show(`<h1>Error — the experiment cannot run</h1><pre>${esc(msg)}</pre>`, 'error', 'error');
}

export function setBanner(items) {
  $('banner').innerHTML = items.map((b) => `<div class="${b.cls}">${esc(b.text)}</div>`).join('');
}

// Setup form (SPEC §2.1 + iPad rig fields). onGesture() runs synchronously inside the submit click (so
// requestFullscreen has a user gesture). The width is empty unless a preset is picked. Resolves with the values.
export function showSetup({ metaHtml, defaults, presets, devices, onExpectedChange, backups, onBackups, onGesture }) {
  const form = $('setup');
  $('setup-meta').innerHTML = metaHtml;
  $('participant_id').value = defaults.participant_id || '';
  $('monitor_width_cm').value = '';
  $('viewing_distance_cm').value = defaults.viewing_distance_cm;
  const pre = $('monitor_preset');
  presets.forEach((p, i) => pre.add(new Option(p.label, String(i))));
  pre.onchange = () => { if (pre.value !== '') $('monitor_width_cm').value = presets[+pre.value].widthCm; };
  devices.forEach(([v, l]) => $('input_device').add(new Option(l, v)));
  $('expected_refresh_hz').value = String(defaults.expected_refresh_hz);
  $('expected_refresh_hz').onchange = onExpectedChange;
  $('backups').innerHTML = backups > 0 ? `<button type="button" id="dl-backups">Download ${backups} stored backups</button>` : '';
  if (backups > 0) $('dl-backups').onclick = onBackups;
  form.hidden = false;
  setScreen('setup');
  return new Promise((resolve) => {
    form.onsubmit = (e) => {
      e.preventDefault();
      const v = {
        participant_id: $('participant_id').value.trim(),
        experimenter: $('experimenter').value.trim(),
        monitor_preset: pre.value === '' ? null : presets[+pre.value].label,
        monitor_width_cm: Number($('monitor_width_cm').value),
        viewing_distance_cm: Number($('viewing_distance_cm').value),
        expected_refresh_hz: Number($('expected_refresh_hz').value),
        input_device: $('input_device').value,
        chinrest_used: $('chinrest_used').checked,
        room_dark: $('room_dark').checked,
        monitor_model: $('monitor_model').value.trim(),
      };
      const err = [];
      if (!/^[A-Za-z0-9_-]{1,32}$/.test(v.participant_id)) err.push('Participant ID: 1-32 letters, digits, _ or -');
      if (v.experimenter.length > 8) err.push('Experimenter initials: at most 8 characters');
      if (!(v.monitor_width_cm >= 10 && v.monitor_width_cm <= 200) || Math.abs(v.monitor_width_cm * 10 - Math.round(v.monitor_width_cm * 10)) > 1e-6) err.push('Screen width: 10-200 cm, 0.1 cm resolution');
      if (!(v.viewing_distance_cm >= 20 && v.viewing_distance_cm <= 200)) err.push('Viewing distance: 20-200 cm');
      if (v.monitor_model.length > 200) err.push('Monitor model: at most 200 characters');
      if (!v.input_device) err.push('Response keyboard: choose one');
      $('setup-errors').textContent = err.join(' · ');
      if (err.length) return;
      onGesture();
      form.hidden = true;
      setBanner([]);
      resolve(v);
    };
  });
}

// Calibration panel (SPEC §2.3). h = {recompute(mm), confirm(rulerBox, refreshOverride)}; returns an updater for
// status text. If the refresh check failed, "Calibration OK" stays disabled until the override box is ticked.
export function showCalibrationPanel({ requireRulerCheck, rulerMm, warnings }, h) {
  const el = show(`
    <div>${warnings.map((w) => `<div class="warn">${esc(w)}</div>`).join('')}</div>
    <div id="cal-status">Measuring refresh rate…</div>
    <label>Measured ruler length (mm): <input id="cal-mm" type="number" step="0.5" min="1"></label>
    <button id="cal-recompute" type="button">Recompute from measurement</button><br>
    <label><input id="cal-ok-box" type="checkbox"> Ruler reads ${rulerMm} ± 1 mm</label>
    <label id="cal-override-row" class="warn" hidden><input id="cal-override-box" type="checkbox"> Override refresh warning (logged in the data; not for real participants unless the rig was checked)</label>
    <button id="cal-ok" type="button" disabled>Calibration OK – continue</button>`, 'calib', 'calibration');
  const ok = el.querySelector('#cal-ok'), box = el.querySelector('#cal-ok-box'), ovr = el.querySelector('#cal-override-box');
  el.dataset.refresh = 'pending';
  let ready = false, refreshFailed = false;
  const refreshOk = () => { ok.disabled = !ready || (requireRulerCheck && !box.checked) || (refreshFailed && !ovr.checked); };
  box.onchange = refreshOk; ovr.onchange = refreshOk;
  el.querySelector('#cal-recompute').onclick = () => {
    const mm = Number(el.querySelector('#cal-mm').value);
    if (mm > 0) h.recompute(mm);
  };
  ok.onclick = () => { if (!ok.disabled) h.confirm(box.checked, refreshFailed && ovr.checked); };
  return {
    status(html, isReady, failed = false) {
      el.querySelector('#cal-status').innerHTML = html; ready = isReady; refreshFailed = failed;
      el.querySelector('#cal-override-row').hidden = !failed; el.dataset.refresh = !isReady ? 'pending' : failed ? 'fail' : 'ok';
      refreshOk();
    },
  };
}

// Awareness questionnaire + experimenter section (SPEC §6.5). Resolves with the answers.
export function showQuestionnaire(mode) {
  const Q = TEXT.questionnaire;
  const radio = (name, opts) => `<div class="radios">${opts.map(([v, l]) =>
    `<label><input type="radio" name="${name}" value="${v}"> ${l}</label>`).join('')}</div>`;
  const el = show(`
    <form id="qform">
      <label for="q_purpose">${Q.q_purpose}</label><textarea id="q_purpose"></textarea>
      <label>${mode === 'grating' ? Q.q_influence_grating : Q.q_influence}</label>
      ${radio('q_influence', [['yes', 'Yes'], ['no', 'No'], ['not_sure', 'Not sure']])}
      <label for="q_influence_how">${Q.q_influence_how}</label><textarea id="q_influence_how"></textarea>
      <label for="q_comments">${Q.q_comments}</label><textarea id="q_comments"></textarea>
      <h2>${Q.experimenterHeading}</h2>
      <label>${Q.fixationRating}</label>
      ${radio('experimenter_fixation_rating', [['good', 'Good'], ['some_lapses', 'Some lapses'], ['poor', 'Poor']])}
      <label for="experimenter_notes">${Q.experimenterNotes}</label><textarea id="experimenter_notes"></textarea>
      <div id="q-err" class="errors"></div>
      <button type="submit" id="q-submit">${Q.submit}</button>
    </form>`, 'form', 'questionnaire');
  return new Promise((resolve) => {
    el.querySelector('#qform').onsubmit = (e) => {
      e.preventDefault();
      const pick = (n) => (el.querySelector(`input[name=${n}]:checked`) || {}).value || null;
      const a = {
        q_purpose: el.querySelector('#q_purpose').value,
        q_influence: pick('q_influence'),
        q_influence_how: el.querySelector('#q_influence_how').value,
        q_comments: el.querySelector('#q_comments').value,
        experimenter_fixation_rating: pick('experimenter_fixation_rating'),
        experimenter_notes: el.querySelector('#experimenter_notes').value,
      };
      if (!a.q_influence) { el.querySelector('#q-err').textContent = 'Please answer the yes / no / not sure question.'; return; }
      hide();
      resolve(a);
    };
  });
}

// Pause overlay (SPEC §5.8). h = {resume(), download(), quit()} — called inside the key/click handler
// (user gesture: resume may re-enter fullscreen).
export function showPause(reason, h) {
  const el = show(`
    <h1>Paused</h1><p>Reason: ${esc(reason)}. The interrupted trial will be repeated later.</p>
    <button id="p-r" type="button">[R] Resume</button>
    <button id="p-d" type="button">[D] Download data now</button>
    <button id="p-q" type="button">[Q] Quit and save</button>
    <div id="p-msg" class="warn"></div>`, 'pause', 'pause');
  const act = { r: h.resume, d: h.download, q: h.quit };
  const on = (e) => {
    const k = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3).toLowerCase() : String(e.key).toLowerCase();
    if (e.repeat || !act[k] || e.ctrlKey || e.metaKey) return;
    e.preventDefault(); act[k]();
  };
  window.addEventListener('keydown', on);
  el.querySelector('#p-r').onclick = () => act.r();
  el.querySelector('#p-d').onclick = () => act.d();
  el.querySelector('#p-q').onclick = () => act.q();
  return {
    close() { window.removeEventListener('keydown', on); hide(); },
    note(t) { const m = el.querySelector('#p-msg'); if (m) m.textContent = t; },
  };
}

export function showEnd(text, saveStatusHtml) {
  show(`<p>${esc(text)}</p><p id="end-save">${saveStatusHtml}</p>`, 'center', 'end');
}
export function updateEndSave(html) { const e = $('end-save'); if (e) e.innerHTML = html; }
