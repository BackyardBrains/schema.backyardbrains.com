(function () {
  const state = {
    records: [],
    hoverIndex: -1,
    participantHitboxes: []
  };

  const els = {
    stats: document.getElementById('stats'),
    recordMetric: document.getElementById('recordMetric'),
    shiftMetric: document.getElementById('shiftMetric'),
    directionMetric: document.getElementById('directionMetric'),
    attemptMetric: document.getElementById('attemptMetric'),
    recordsCount: document.getElementById('recordsCount'),
    recordsBody: document.getElementById('recordsBody'),
    status: document.getElementById('status'),
    meanShiftCanvas: document.getElementById('meanShiftCanvas'),
    participantShiftCanvas: document.getElementById('participantShiftCanvas'),
    attemptsCanvas: document.getElementById('attemptsCanvas'),
    meanShiftNote: document.getElementById('meanShiftNote'),
    participantShiftNote: document.getElementById('participantShiftNote'),
    attemptsNote: document.getElementById('attemptsNote'),
    commentList: document.getElementById('commentList')
  };

  const COLORS = {
    ink: '#151515',
    muted: '#6f6f6f',
    grid: '#d9d9d9',
    before: '#2f7dbb',
    after: '#ff805f',
    line: '#a7aaa8',
    positive: '#7a8a38',
    negative: '#b7574b'
  };

  function setStatus(message, isError) {
    if (!els.status) return;
    els.status.textContent = message || '';
    els.status.classList.toggle('status-line--error', Boolean(isError));
  }

  function fmt(value, digits = 1) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(digits) : '';
  }

  function summarize(values) {
    const clean = values.map(Number).filter(Number.isFinite);
    if (!clean.length) return { n: 0, mean: 0, sd: 0 };
    const mean = clean.reduce((sum, value) => sum + value, 0) / clean.length;
    const variance = clean.length > 1
      ? clean.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / (clean.length - 1)
      : 0;
    return { n: clean.length, mean, sd: Math.sqrt(variance) };
  }

  function hasLoggedAttempt(record) {
    return record.attempts !== null &&
      record.attempts !== undefined &&
      record.attempts !== '' &&
      Number.isFinite(Number(record.attempts));
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function participantLabel(record, index) {
    return record.participant_name || record.participant_id || `P${index + 1}`;
  }

  function subjectId(index) {
    return index + 1;
  }

  function subjectLabel(index) {
    return `S${subjectId(index)}`;
  }

  function sortedRecords() {
    return [...state.records];
  }

  function recordsWithAngles() {
    return sortedRecords().filter(record => (
      Number.isFinite(Number(record.starting_angle)) &&
      Number.isFinite(Number(record.ending_angle)) &&
      Number.isFinite(Number(record.angle_difference))
    ));
  }

  function prepareCanvas(canvas) {
    const rect = canvas.parentElement.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(320, Math.floor(rect.width));
    const height = Math.max(240, Math.floor(rect.height));
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.font = '13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    return { ctx, width, height };
  }

  function drawArrow(ctx, fromX, fromY, toX, toY, color, width) {
    const angle = Math.atan2(toY - fromY, toX - fromX);
    const headLength = Math.max(12, width * 3.2);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - Math.cos(angle - Math.PI / 7) * headLength, toY - Math.sin(angle - Math.PI / 7) * headLength);
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - Math.cos(angle + Math.PI / 7) * headLength, toY - Math.sin(angle + Math.PI / 7) * headLength);
    ctx.stroke();
    ctx.restore();
  }

  function elbowAnglePoint(cx, cy, radius, degrees) {
    const radians = (180 - Number(degrees)) * Math.PI / 180;
    return {
      x: cx + Math.cos(radians) * radius,
      y: cy + Math.sin(radians) * radius
    };
  }

  function drawElbowAngleFrame(ctx, cx, cy, radius, options = {}) {
    const ticks = options.ticks || [40, 60, 90, 120, 150, 180];
    const labelEvery = new Set(options.labelTicks || ticks);
    ctx.save();
    ctx.strokeStyle = COLORS.grid;
    ctx.fillStyle = COLORS.muted;
    ctx.lineWidth = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    [0.35, 0.7, 1].forEach((scale) => {
      ctx.beginPath();
      ctx.arc(cx, cy, radius * scale, 0, Math.PI * 2);
      ctx.stroke();
    });

    ticks.forEach((tick) => {
      const inner = elbowAnglePoint(cx, cy, radius * 0.08, tick);
      const outer = elbowAnglePoint(cx, cy, radius, tick);
      ctx.beginPath();
      ctx.moveTo(inner.x, inner.y);
      ctx.lineTo(outer.x, outer.y);
      ctx.stroke();
      if (labelEvery.has(tick)) {
        const label = elbowAnglePoint(cx, cy, radius + 20, tick);
        ctx.fillText(`${tick}°`, label.x, label.y);
      }
    });

    const straight = elbowAnglePoint(cx, cy, radius + 28, 180);
    ctx.textAlign = 'left';
    ctx.font = '700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('180° straight forward', straight.x - 4, straight.y);
    ctx.restore();
  }

  function drawAngleArrow(ctx, cx, cy, radius, degrees, color, width) {
    const end = elbowAnglePoint(cx, cy, radius, degrees);
    drawArrow(ctx, cx, cy, end.x, end.y, color, width);
  }

  function drawLegend(ctx, items, x, y) {
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    let cursor = x;
    items.forEach((item) => {
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.arc(cursor + 5, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.ink;
      ctx.fillText(item.label, cursor + 16, y);
      cursor += Math.max(88, ctx.measureText(item.label).width + 42);
    });
    ctx.restore();
  }

  function renderSummary() {
    const rows = recordsWithAngles();
    const deltas = rows.map(record => Number(record.angle_difference));
    const starts = rows.map(record => Number(record.starting_angle));
    const ends = rows.map(record => Number(record.ending_angle));
    const attempts = state.records.filter(hasLoggedAttempt).map(record => Number(record.attempts));
    const deltaSummary = summarize(deltas);
    const beforeSummary = summarize(starts);
    const afterSummary = summarize(ends);
    const shiftedUp = deltas.filter(value => value > 0).length;

    els.stats.textContent = [
      `Records: ${state.records.length}`,
      `Mean shift: +${fmt(deltaSummary.mean)}°`,
      `Before mean: ${fmt(beforeSummary.mean)}°`,
      `After mean: ${fmt(afterSummary.mean)}°`
    ].join(' • ');
    els.recordMetric.textContent = String(state.records.length);
    els.shiftMetric.textContent = `+${fmt(deltaSummary.mean)}°`;
    els.directionMetric.textContent = `${shiftedUp}/${rows.length}`;
    els.attemptMetric.textContent = attempts.length ? `${attempts.length}` : '0';

    return { rows, deltas, attempts, deltaSummary, beforeSummary, afterSummary, shiftedUp };
  }

  function drawMeanShift(summary) {
    const { ctx, width, height } = prepareCanvas(els.meanShiftCanvas);
    const before = summary.beforeSummary.mean;
    const after = summary.afterSummary.mean;
    const delta = summary.deltaSummary.mean;
    const cx = width * 0.36;
    const cy = height * 0.47;
    const radius = Math.min(width, height) * 0.28;

    ctx.save();
    drawElbowAngleFrame(ctx, cx, cy, radius, { ticks: [40, 60, 90, 120, 150, 180], labelTicks: [60, 90] });
    drawAngleArrow(ctx, cx, cy, radius * 1.12, before, COLORS.before, 5);
    drawAngleArrow(ctx, cx, cy, radius * 1.28, after, COLORS.after, 5);
    drawLegend(ctx, [
      { color: COLORS.before, label: 'before mean' },
      { color: COLORS.after, label: 'after mean' }
    ], Math.max(24, width * 0.2), 24);
    ctx.fillStyle = COLORS.ink;
    ctx.font = '700 22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`+${fmt(delta)}°`, width * 0.68, height * 0.35);
    ctx.font = '12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(`${fmt(before)}° -> ${fmt(after)}°`, width * 0.68, height * 0.45);
    ctx.restore();

    els.meanShiftNote.textContent = `Angles are elbow-centered: 180° is straight forward toward the face. Mean arrows show the perceived forearm direction before and after vibration.`;
  }

  function drawParticipantShift(summary) {
    const rows = summary.rows;
    const { ctx, width, height } = prepareCanvas(els.participantShiftCanvas);
    const cx = width * 0.5;
    const cy = height * 0.46;
    const radius = Math.min(width * 0.42, height * 0.34);
    state.participantHitboxes = [];

    ctx.save();
    drawElbowAngleFrame(ctx, cx, cy, radius, { ticks: [40, 60, 90, 120, 150, 180], labelTicks: [40, 60, 90, 120, 150] });

    rows.forEach((record, index) => {
      const before = elbowAnglePoint(cx, cy, radius, Number(record.starting_angle));
      const after = elbowAnglePoint(cx, cy, radius, Number(record.ending_angle));
      const isHovered = index === state.hoverIndex;
      ctx.strokeStyle = Number(record.angle_difference) >= 0 ? COLORS.line : COLORS.negative;
      ctx.globalAlpha = isHovered ? 1 : 0.34;
      ctx.lineWidth = isHovered ? 3 : 1.4;
      ctx.beginPath();
      ctx.moveTo(before.x, before.y);
      ctx.lineTo(after.x, after.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = COLORS.before;
      ctx.beginPath();
      ctx.arc(before.x, before.y, isHovered ? 7 : 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.after;
      ctx.beginPath();
      ctx.arc(after.x, after.y, isHovered ? 7 : 4.5, 0, Math.PI * 2);
      ctx.fill();
      if (isHovered) {
        ctx.strokeStyle = COLORS.ink;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(before.x, before.y, 9, 0, Math.PI * 2);
        ctx.arc(after.x, after.y, 9, 0, Math.PI * 2);
        ctx.stroke();
      }
      state.participantHitboxes.push({ x: (before.x + after.x) / 2, y: (before.y + after.y) / 2, radius: 18, record, index });
    });

    drawLegend(ctx, [
      { color: COLORS.before, label: 'before vibration' },
      { color: COLORS.after, label: 'after vibration' }
    ], 24, 22);

    const hovered = state.participantHitboxes[state.hoverIndex];
    if (hovered) {
      const { record } = hovered;
      const lines = [
        `${subjectLabel(hovered.index)}: ${participantLabel(record, hovered.index)}`,
        `${fmt(record.starting_angle)}° -> ${fmt(record.ending_angle)}°`,
        `change ${Number(record.angle_difference) >= 0 ? '+' : ''}${fmt(record.angle_difference)}°`
      ];
      const boxWidth = 170;
      const boxHeight = 70;
      const x = Math.min(width - boxWidth - 12, hovered.x + 14);
      const y = Math.max(12, Math.min(height - boxHeight - 12, hovered.y - boxHeight / 2));
      ctx.fillStyle = 'rgba(255,255,255,0.94)';
      ctx.strokeStyle = '#d0d0d0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x, y, boxWidth, boxHeight, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = COLORS.ink;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = '700 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(lines[0], x + 12, y + 10);
      ctx.font = '12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(lines[1], x + 12, y + 30);
      ctx.fillText(lines[2], x + 12, y + 48);
    }
    ctx.restore();

    els.participantShiftNote.textContent = 'Each linked before/after pair is one subject in source sheet order. Dots are individual observations on the elbow-angle rose.';
  }

  function drawAttempts(summary) {
    const rows = sortedRecords().filter(hasLoggedAttempt);
    const { ctx, width, height } = prepareCanvas(els.attemptsCanvas);
    const plot = { left: 48, right: width - 24, top: 48, bottom: height - 58 };
    const maxAttempt = Math.max(3, ...rows.map(record => Number(record.attempts)));
    const x = value => plot.left + (value / maxAttempt) * (plot.right - plot.left);

    ctx.save();
    ctx.strokeStyle = COLORS.grid;
    ctx.fillStyle = COLORS.muted;
    ctx.lineWidth = 1;
    ctx.textAlign = 'center';
    for (let tick = 0; tick <= maxAttempt; tick += 1) {
      const tx = x(tick);
      ctx.beginPath();
      ctx.moveTo(tx, plot.top);
      ctx.lineTo(tx, plot.bottom);
      ctx.stroke();
      ctx.fillText(String(tick), tx, plot.bottom + 22);
    }

    rows.forEach((record, index) => {
      const y = plot.top + ((index + 0.5) / Math.max(1, rows.length)) * (plot.bottom - plot.top);
      const value = Number(record.attempts);
      ctx.strokeStyle = COLORS.line;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x(0), y);
      ctx.lineTo(x(value), y);
      ctx.stroke();
      ctx.fillStyle = COLORS.after;
      ctx.beginPath();
      ctx.arc(x(value), y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.ink;
      ctx.textAlign = 'right';
      ctx.font = '12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      const sourceIndex = state.records.indexOf(record);
      ctx.fillText(subjectLabel(sourceIndex), plot.left - 8, y);
    });
    ctx.restore();

    els.attemptsNote.textContent = rows.length
      ? `Attempts were logged for ${rows.length} of ${state.records.length} records, so this plot is descriptive rather than a full-sample result.`
      : 'Attempts were not logged in the current dataset.';
  }

  function renderComments() {
    const comments = state.records
      .filter(record => String(record.comments || '').trim())
      .slice(0, 6);
    els.commentList.innerHTML = comments.length
      ? comments.map(record => `
        <blockquote>
          <p>${escapeHtml(record.comments)}</p>
          <cite>${escapeHtml(`${subjectLabel(state.records.indexOf(record))}: ${participantLabel(record, 0)}`)}${record.location ? `, ${escapeHtml(record.location)}` : ''}</cite>
        </blockquote>
      `).join('')
      : '<p class="chart-note">No participant comments were recorded.</p>';
  }

  function renderTable() {
    const rows = sortedRecords();
    els.recordsCount.textContent = `${rows.length} record${rows.length === 1 ? '' : 's'}`;
    els.recordsBody.innerHTML = rows.map((record, index) => `
      <tr>
        <td class="num">${subjectId(index)}</td>
        <td>${escapeHtml(record.participant_name || record.participant_id)}</td>
        <td>${escapeHtml(record.age)}</td>
        <td>${escapeHtml(record.sex)}</td>
        <td class="num">${fmt(record.starting_angle)}</td>
        <td class="num">${fmt(record.ending_angle)}</td>
        <td class="num">${Number(record.angle_difference) >= 0 ? '+' : ''}${fmt(record.angle_difference)}</td>
        <td class="num">${hasLoggedAttempt(record) ? escapeHtml(record.attempts) : ''}</td>
        <td>${escapeHtml(record.location)}</td>
        <td>${escapeHtml(record.comments)}</td>
      </tr>
    `).join('');
  }

  function renderAll() {
    const summary = renderSummary();
    drawMeanShift(summary);
    drawParticipantShift(summary);
    drawAttempts(summary);
    renderComments();
    renderTable();
  }

  function summarizeGrabNose(records) {
    const diffs = records.map(record => Number(record.angle_difference)).filter(Number.isFinite);
    const attempts = records.filter(hasLoggedAttempt).map(record => Number(record.attempts));
    return {
      record_count: records.length,
      participant_count: new Set(records.map(record => record.participant_id).filter(Boolean)).size,
      mean_angle_difference: diffs.length ? diffs.reduce((sum, value) => sum + value, 0) / diffs.length : null,
      mean_attempts: attempts.length ? attempts.reduce((sum, value) => sum + value, 0) / attempts.length : null
    };
  }

  async function loadData() {
    const res = await fetch('/api/research/grab-nose/data', { credentials: 'same-origin' });
    if (!res.ok) throw new Error('Failed to load grab-nose data');
    const data = await res.json();
    state.records = data.records || [];
    if (!state.records.length) {
      setStatus('No grab-nose records are available from the source sheet.', true);
    }
    summarizeGrabNose(state.records);
    renderAll();
  }

  function handleParticipantHover(event) {
    if (!state.participantHitboxes.length) return;
    const rect = els.participantShiftCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hit = state.participantHitboxes.find(box => Math.hypot(box.x - x, box.y - y) <= box.radius);
    const nextIndex = hit ? hit.index : -1;
    if (nextIndex !== state.hoverIndex) {
      state.hoverIndex = nextIndex;
      drawParticipantShift(renderSummary());
    }
  }

  function attach() {
    els.participantShiftCanvas.addEventListener('mousemove', handleParticipantHover);
    els.participantShiftCanvas.addEventListener('mouseleave', () => {
      if (state.hoverIndex !== -1) {
        state.hoverIndex = -1;
        drawParticipantShift(renderSummary());
      }
    });
    window.addEventListener('resize', () => {
      if (state.records.length) renderAll();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    attach();
    loadData().catch((err) => {
      console.error(err);
      if (els.stats) els.stats.textContent = 'Error loading data';
      setStatus('Could not load grab-nose data.', true);
    });
  });
})();
