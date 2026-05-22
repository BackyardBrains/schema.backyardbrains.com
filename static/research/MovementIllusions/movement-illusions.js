(function () {
  const qs = new URLSearchParams(window.location.search);
  const experiment = qs.get('experiment') || 'chair';
  const data = window.RESEARCH_DATA || {};

  const configs = {
    chair: {
      title: 'Chair Rotation Illusion',
      kicker: 'Proprioception',
      lede: 'Perceived chair rotation after biceps or triceps tendon vibration while the chair remained fixed.',
      sheet: data.docs && data.docs.chairSheet,
      records: data.chair || [],
      summary: data.chairSummary || {},
      primaryTitle: 'Mean Signed Perceived Rotation',
      secondaryTitle: 'Feelers vs. Non-Feelers',
      tableTitle: 'Chair Rotation Records'
    },
    floor: {
      title: 'Arm Through Floor Illusion',
      kicker: 'Body Schema',
      lede: 'Perceived arm angle below the floor after participants were lowered back to the ground without vision.',
      sheet: data.docs && data.docs.floorSheet,
      records: data.floor || [],
      primaryTitle: 'Mean Perceived Angle',
      secondaryTitle: 'Individual Perceived Angles',
      tableTitle: 'Arm Through Floor Records'
    },
    cafe: {
      title: 'Cafe Stare Experiment',
      kicker: 'Naturalistic Attention',
      lede: 'Look-back outcomes during direct stare trials compared with no-direct-stare control trials in cafes.',
      sheet: data.docs && data.docs.cafeSheet,
      records: data.cafe || {},
      primaryTitle: 'Paired Look-Back Rates',
      secondaryTitle: 'Discordant Pairs Driving McNemar Test',
      tableTitle: 'Cafe Stare Main Result'
    }
  };

  const cfg = configs[experiment] || configs.chair;
  const els = {
    kicker: document.getElementById('kicker'),
    title: document.getElementById('title'),
    lede: document.getElementById('lede'),
    stats: document.getElementById('stats'),
    sourceSheet: document.getElementById('sourceSheet'),
    primaryTitle: document.getElementById('primaryChartTitle'),
    secondaryTitle: document.getElementById('secondaryChartTitle'),
    chartNote: document.getElementById('chartNote'),
    tableTitle: document.getElementById('tableTitle'),
    recordsCount: document.getElementById('recordsCount'),
    tableHead: document.getElementById('tableHead'),
    tableBody: document.getElementById('tableBody'),
    primaryCanvas: document.getElementById('primaryChart'),
    secondaryCanvas: document.getElementById('secondaryChart'),
    chairExtraPlots: document.getElementById('chairExtraPlots'),
    individualCanvas: document.getElementById('individualChart'),
    bicepFeelCanvas: document.getElementById('bicepFeelChart'),
    tricepFeelCanvas: document.getElementById('tricepFeelChart')
  };

  const state = {
    hoverParticipantKey: '',
    hoverPoint: null,
    chairHoverHitboxes: []
  };

  const COLORS = {
    ink: '#151515',
    muted: '#6f6f6f',
    grid: '#d7d7d7',
    bicep: '#2f7dbb',
    tricep: '#ff805f',
    floor: '#7a8a38',
    cafe: '#2f7dbb',
    control: '#a0a0a0',
    staredOnly: '#7a8a38',
    controlOnly: '#ff805f'
  };

  function fmt(value, digits = 1) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(digits) : '';
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

  function summarize(values) {
    const clean = values.map(Number).filter(Number.isFinite);
    if (!clean.length) return { n: 0, mean: 0, sd: 0 };
    const mean = clean.reduce((sum, value) => sum + value, 0) / clean.length;
    const variance = clean.length > 1
      ? clean.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / (clean.length - 1)
      : 0;
    return { n: clean.length, mean, sd: Math.sqrt(variance) };
  }

  function meanBy(records, key, valueKey) {
    const groups = new Map();
    for (const record of records) {
      const name = record[key] || 'unknown';
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(Number(record[valueKey]));
    }
    return [...groups.entries()].map(([name, values]) => ({ name, ...summarize(values) }));
  }

  function participantKey(name) {
    return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function chairParticipantName(name) {
    return String(name || '')
      .replace(/\s*-\s*(?:bicep|tricep|triceps)\?*\s*$/i, '')
      .replace(/\s+(?:bicep|tricep|triceps)\?*\s*$/i, '')
      .trim();
  }

  function chairParticipantKey(name) {
    return participantKey(chairParticipantName(name));
  }

  function chairParticipants(records) {
    const participants = [];
    const seen = new Set();
    for (const record of records) {
      const key = chairParticipantKey(record.participant_name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      participants.push({ key, name: chairParticipantName(record.participant_name) });
    }
    return participants;
  }

  function prepareCanvas(canvas) {
    const rect = canvas.parentElement.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(320, Math.floor(rect.width));
    const height = Math.max(300, Math.floor(rect.height));
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.font = '13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    return { ctx, width, height };
  }

  function polarPoint(cx, cy, radius, degrees) {
    const radians = (degrees - 90) * Math.PI / 180;
    return {
      x: cx + Math.cos(radians) * radius,
      y: cy + Math.sin(radians) * radius
    };
  }

  function drawRoseAxes(ctx, cx, cy, radius, maxAngle) {
    ctx.save();
    ctx.strokeStyle = COLORS.grid;
    ctx.fillStyle = COLORS.muted;
    ctx.lineWidth = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    [0.25, 0.5, 0.75, 1].forEach((scale) => {
      ctx.beginPath();
      ctx.arc(cx, cy, radius * scale, 0, Math.PI * 2);
      ctx.stroke();
    });

    for (let angle = 0; angle < 360; angle += 30) {
      const outer = polarPoint(cx, cy, radius, angle);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(outer.x, outer.y);
      ctx.stroke();
      if (angle % 90 === 0) {
        const label = polarPoint(cx, cy, radius + 18, angle);
        ctx.fillText(`${angle}°`, label.x, label.y);
      }
    }

    ctx.textAlign = 'right';
    ctx.fillText(`${maxAngle}°`, cx - 6, cy - radius);
    ctx.restore();
  }

  function drawRose(canvas, items, options) {
    const { ctx, width, height } = prepareCanvas(canvas);
    const cx = width * 0.5;
    const cy = height * 0.52;
    const radius = Math.min(width, height) * 0.34;
    const maxAngle = options.maxAngle || 90;
    drawRoseAxes(ctx, cx, cy, radius, maxAngle);

    items.forEach((item, index) => {
      const signedDegrees = Number(item.angle) || 0;
      const degrees = Math.min(maxAngle, Math.abs(signedDegrees));
      const lengthScale = item.lengthScale == null
        ? (options.unitLength ? 1 : degrees / maxAngle)
        : item.lengthScale;
      const length = radius * lengthScale;
      const theta = options.direction ? options.direction(item, index) : signedDegrees;
      const end = polarPoint(cx, cy, length, theta);
      const outer = polarPoint(cx, cy, radius, theta);
      const isHovered = item.participantKey && item.participantKey === state.hoverParticipantKey;
      const color = item.color || COLORS.floor;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.globalAlpha = isHovered ? 1 : (item.alpha == null ? 0.82 : item.alpha);
      ctx.lineWidth = isHovered ? Math.max(item.width || 2, 4) : (item.width || 2);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(end.x, end.y, isHovered ? Math.max(item.pointRadius || 4, 7) : (item.pointRadius || 4), 0, Math.PI * 2);
      ctx.fill();
      if (isHovered) {
        ctx.strokeStyle = COLORS.ink;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (item.markOuter) {
        ctx.globalAlpha = 0.16;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(outer.x, outer.y);
        ctx.stroke();
      }
      ctx.restore();
    });

    if (options.legend) drawLegend(ctx, width, options.legend);
  }

  function drawLegend(ctx, width, items) {
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    let x = 24;
    const y = 24;
    items.forEach((item) => {
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.arc(x + 5, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.ink;
      ctx.fillText(item.label, x + 16, y);
      x += Math.min(170, Math.max(86, ctx.measureText(item.label).width + 40));
    });
    ctx.restore();
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    if (ctx.roundRect) {
      ctx.roundRect(x, y, width, height, radius);
      return;
    }
    const r = Math.min(radius, width / 2, height / 2);
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }

  function drawRateComparison(canvas, cafe) {
    const { ctx, width, height } = prepareCanvas(canvas);
    const plot = { left: 70, right: width - 30, top: 42, bottom: height - 64 };
    const staredRate = cafe.stared_lookbacks / cafe.record_count;
    const controlRate = cafe.control_lookbacks / cafe.record_count;
    const y = rate => plot.bottom - rate * (plot.bottom - plot.top) / 0.5;
    const x1 = plot.left + (plot.right - plot.left) * 0.28;
    const x2 = plot.left + (plot.right - plot.left) * 0.72;

    ctx.strokeStyle = COLORS.grid;
    ctx.fillStyle = COLORS.muted;
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let tick = 0; tick <= 0.5; tick += 0.1) {
      const yy = y(tick);
      ctx.beginPath();
      ctx.moveTo(plot.left, yy);
      ctx.lineTo(plot.right, yy);
      ctx.stroke();
      ctx.fillText(`${Math.round(tick * 100)}%`, plot.left - 8, yy);
    }

    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y(controlRate));
    ctx.lineTo(x2, y(staredRate));
    ctx.stroke();

    [
      { x: x1, value: controlRate, count: cafe.control_lookbacks, label: 'Control', color: COLORS.control },
      { x: x2, value: staredRate, count: cafe.stared_lookbacks, label: 'Stared at', color: COLORS.cafe }
    ].forEach(point => {
      const yy = y(point.value);
      ctx.fillStyle = point.color;
      ctx.beginPath();
      ctx.arc(point.x, yy, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.ink;
      ctx.textAlign = 'center';
      ctx.fillText(point.label, point.x, plot.bottom + 26);
      ctx.font = '700 17px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(`${fmt(point.value * 100, 1)}%`, point.x, yy - 24);
      ctx.font = '13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(`${point.count}/${cafe.record_count}`, point.x, yy - 43);
    });

    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.ink;
    ctx.fillText(`paired difference +${fmt(cafe.absolute_increase_points, 1)} points`, plot.left, height - 28);
    ctx.fillText(`95% CI +${fmt(cafe.ci95_low_points, 1)} to +${fmt(cafe.ci95_high_points, 1)}; McNemar p=${cafe.two_sided_p}`, plot.left, height - 10);
  }

  function drawDiscordantPairs(canvas, cafe) {
    const { ctx, width, height } = prepareCanvas(canvas);
    const total = cafe.discordant_subjects;
    const cols = 11;
    const cell = Math.min(28, (width - 80) / cols);
    const startX = (width - cols * cell) / 2;
    const startY = Math.max(58, height * 0.25);

    for (let i = 0; i < total; i += 1) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const x = startX + col * cell + cell / 2;
      const y = startY + row * cell + cell / 2;
      ctx.fillStyle = i < cafe.stared_only ? COLORS.staredOnly : COLORS.controlOnly;
      ctx.beginPath();
      ctx.arc(x, y, cell * 0.32, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = COLORS.ink;
    ctx.textAlign = 'center';
    ctx.font = '700 18px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('Only subjects who changed behavior enter McNemar test', width / 2, 30);
    ctx.font = '13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(`${cafe.stared_only} looked back only when stared at`, width / 2, startY + cell * 3.3);
    ctx.fillText(`${cafe.control_only} looked back only in control`, width / 2, startY + cell * 4.0);
    drawLegend(ctx, width, [
      { color: COLORS.staredOnly, label: 'stared only' },
      { color: COLORS.controlOnly, label: 'control only' }
    ]);
  }

  function drawChairTooltip(ctx, width, height, participant) {
    if (!state.hoverPoint || !participant) return;
    const bicep = participant.records.bicep;
    const tricep = participant.records.tricep;
    const lines = [
      participant.name,
      `Biceps: ${bicep ? `${fmt(bicep.perceived_angle)}° (${bicep.felt_rotation ? 'felt' : 'non-felt'})` : 'not tested'}`,
      `Triceps: ${tricep ? `${fmt(tricep.perceived_angle)}° (${tricep.felt_rotation ? 'felt' : 'non-felt'})` : 'not tested'}`
    ];
    ctx.save();
    ctx.font = '13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    const padding = 10;
    const lineHeight = 18;
    const boxWidth = Math.max(...lines.map(line => ctx.measureText(line).width)) + padding * 2;
    const boxHeight = lines.length * lineHeight + padding * 2;
    let x = state.hoverPoint.x + 14;
    let y = state.hoverPoint.y - boxHeight - 12;
    if (x + boxWidth > width - 8) x = width - boxWidth - 8;
    if (y < 8) y = state.hoverPoint.y + 16;
    if (y + boxHeight > height - 8) y = height - boxHeight - 8;

    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    roundedRect(ctx, x, y, boxWidth, boxHeight, 8);
    ctx.fill();
    ctx.stroke();
    lines.forEach((line, index) => {
      ctx.fillStyle = index === 0 ? COLORS.ink : COLORS.muted;
      ctx.font = `${index === 0 ? '700 ' : ''}13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(line, x + padding, y + padding + index * lineHeight);
    });
    ctx.restore();
  }

  function drawFeelerCounts(canvas, records) {
    const { ctx, width, height } = prepareCanvas(canvas);
    const participants = chairParticipants(records);
    const byParticipant = new Map();
    for (const record of records) {
      const key = chairParticipantKey(record.participant_name);
      if (!byParticipant.has(key)) byParticipant.set(key, {});
      byParticipant.get(key)[record.tendon] = record;
    }
    const participantRows = participants.map(participant => ({
      ...participant,
      records: byParticipant.get(participant.key) || {}
    }));
    const groups = ['bicep', 'tricep'].map(tendon => ({
      tendon,
      rows: participantRows.map(participant => participant.records[tendon] || null)
    }));
    groups.forEach(group => {
      group.feelers = group.rows.filter(record => record && Math.abs(record.perceived_angle) > 0).length;
      group.nonFeelers = group.rows.filter(record => record && Math.abs(record.perceived_angle) === 0).length;
    });
    const dotRadius = 6;
    const gap = Math.min(28, Math.max(14, (width - 190) / Math.max(1, participants.length - 1)));
    const startX = Math.max(150, width * 0.28);
    const rowGap = Math.max(84, height * 0.26);
    const startY = height * 0.34;
    state.chairHoverHitboxes = [];

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '700 16px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = COLORS.ink;
    ctx.fillText('participant order: P1, P2, P3...', 24, 34);

    groups.forEach((group, rowIndex) => {
      const y = startY + rowIndex * rowGap;
      const color = group.tendon === 'bicep' ? COLORS.bicep : COLORS.tricep;
      ctx.font = '700 15px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = COLORS.ink;
      ctx.textAlign = 'right';
      ctx.fillText(group.tendon === 'bicep' ? 'Biceps' : 'Triceps', startX - 26, y);
      ctx.font = '13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(`${group.feelers} feelers / ${group.nonFeelers} non-feelers`, startX - 26, y + 22);

      group.rows.forEach((record, index) => {
        const x = startX + index * gap;
        const participant = participantRows[index];
        const isParticipantHovered = participant.key === state.hoverParticipantKey;
        if (rowIndex === groups.length - 1) {
          ctx.fillStyle = COLORS.muted;
          ctx.textAlign = 'center';
          ctx.font = '11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
          ctx.fillText(`P${index + 1}`, x, y + 44);
        }
        if (rowIndex === 0 && isParticipantHovered) {
          ctx.strokeStyle = COLORS.ink;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x, startY - 20);
          ctx.lineTo(x, startY + rowGap + 20);
          ctx.stroke();
        }
        if (!record) {
          ctx.strokeStyle = '#c8c8c8';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
          ctx.stroke();
          return;
        }
        const isFeeler = Math.abs(record.perceived_angle) > 0;
        ctx.fillStyle = isFeeler ? color : '#d8d8d8';
        ctx.strokeStyle = isParticipantHovered ? COLORS.ink : (isFeeler ? color : '#9a9a9a');
        ctx.lineWidth = isParticipantHovered ? 2.5 : 1;
        ctx.beginPath();
        ctx.arc(x, y, isParticipantHovered ? dotRadius + 3 : dotRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        state.chairHoverHitboxes.push({
          x,
          y,
          radius: dotRadius + 7,
          key: participant.key,
          participant
        });
      });
    });

    drawLegend(ctx, width, [
      { color: COLORS.bicep, label: 'biceps feeler' },
      { color: COLORS.tricep, label: 'triceps feeler' },
      { color: '#d8d8d8', label: 'non-feeler' }
    ]);
    const hovered = participantRows.find(participant => participant.key === state.hoverParticipantKey);
    drawChairTooltip(ctx, width, height, hovered);
    ctx.restore();
  }

  function drawChairIndividualRose(canvas, records) {
    drawRose(canvas, records.map(record => ({
      angle: record.perceived_angle,
      color: record.tendon === 'bicep' ? COLORS.bicep : COLORS.tricep,
      alpha: Math.abs(record.perceived_angle) > 0 ? 0.72 : 0.28,
      pointRadius: Math.abs(record.perceived_angle) > 0 ? 3.5 : 2,
      lengthScale: 1,
      participantKey: chairParticipantKey(record.participant_name)
    })), {
      maxAngle: 90,
      unitLength: true,
      direction: item => item.angle,
      legend: [
        { color: COLORS.bicep, label: 'biceps' },
        { color: COLORS.tricep, label: 'triceps' }
      ]
    });
  }

  function drawResponseClassRose(canvas, records, isFeelerClass) {
    const rows = records.filter(record => (Math.abs(record.perceived_angle) > 0) === isFeelerClass);
    const bicepRows = rows.filter(record => record.tendon === 'bicep');
    const tricepRows = rows.filter(record => record.tendon === 'tricep');
    const bicepSummary = summarize(bicepRows.map(record => record.perceived_angle));
    const tricepSummary = summarize(tricepRows.map(record => record.perceived_angle));
    const classLabel = isFeelerClass ? 'feeler' : 'non-feeler';

    drawRose(canvas, [
      ...rows.map(record => ({
        angle: record.perceived_angle,
        color: record.tendon === 'bicep' ? COLORS.bicep : COLORS.tricep,
        alpha: 0.48,
        pointRadius: 3,
        width: 1.4,
        lengthScale: 1,
        participantKey: chairParticipantKey(record.participant_name)
      })),
      {
        angle: bicepSummary.mean,
        color: COLORS.bicep,
        alpha: 1,
        width: 5,
        pointRadius: 7,
        markOuter: true,
        lengthScale: 1.5
      },
      {
        angle: tricepSummary.mean,
        color: COLORS.tricep,
        alpha: 1,
        width: 5,
        pointRadius: 7,
        markOuter: true,
        lengthScale: 1.5
      }
    ], {
      maxAngle: 90,
      unitLength: true,
      direction: item => item.angle,
      legend: [
        { color: COLORS.bicep, label: `biceps ${classLabel} mean ${fmt(bicepSummary.mean, 1)}°` },
        { color: COLORS.tricep, label: `triceps ${classLabel} mean ${fmt(tricepSummary.mean, 1)}°` }
      ]
    });
  }

  function table(headers, rows) {
    els.tableHead.innerHTML = `<tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join('')}</tr>`;
    els.tableBody.innerHTML = rows.map(row => (
      `<tr>${row.map(value => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`
    )).join('');
  }

  function renderChair() {
    const records = cfg.records;
    const byTendon = meanBy(records, 'tendon', 'perceived_angle');
    const bicep = byTendon.find(row => row.name === 'bicep') || { mean: 0 };
    const tricep = byTendon.find(row => row.name === 'tricep') || { mean: 0 };
    const bicepMean = Number.isFinite(Number(cfg.summary.bicep_mean)) ? Number(cfg.summary.bicep_mean) : bicep.mean;
    const tricepMean = Number.isFinite(Number(cfg.summary.tricep_mean)) ? Number(cfg.summary.tricep_mean) : tricep.mean;
    const felt = records.filter(record => Math.abs(record.perceived_angle) > 0).length;

    els.stats.textContent = `Records: ${records.length} • Felt rotation: ${felt} • Biceps mean: ${fmt(bicepMean, 2)}° • Triceps mean: ${fmt(tricepMean, 2)}°`;
    els.chartNote.textContent = 'Signed angles and mean values come from the Bicep Data and Tricep Data tabs. In rose plots, individual rays use unit length; mean arrows use 1.5x length.';

    drawRose(els.primaryCanvas, [
      { angle: bicepMean, color: COLORS.bicep, width: 5, pointRadius: 6, markOuter: true, lengthScale: 1.5 },
      { angle: tricepMean, color: COLORS.tricep, width: 5, pointRadius: 6, markOuter: true, lengthScale: 1.5 }
    ], {
      maxAngle: 90,
      unitLength: true,
      direction: item => item.angle,
      legend: [
        { color: COLORS.bicep, label: 'biceps mean' },
        { color: COLORS.tricep, label: 'triceps mean' }
      ]
    });

    drawFeelerCounts(els.secondaryCanvas, records);
    drawChairIndividualRose(els.individualCanvas, records);
    drawResponseClassRose(els.bicepFeelCanvas, records, true);
    drawResponseClassRose(els.tricepFeelCanvas, records, false);

    table(['Participant', 'Tendon', 'Signed perceived angle', 'Felt rotation'], records.map(record => [
      record.participant_name,
      record.tendon,
      `${fmt(record.perceived_angle)}°`,
      record.felt_rotation ? 'Y' : 'N'
    ]));
    els.recordsCount.textContent = `${records.length} records`;
  }

  function renderFloor() {
    const records = cfg.records;
    const values = records.map(record => record.perceived_angle);
    const summary = summarize(values);
    els.stats.textContent = `Records: ${records.length} • Mean perceived angle: ${fmt(summary.mean, 2)}° • SD: ${fmt(summary.sd, 2)}°`;
    els.chartNote.textContent = 'The rose view preserves angle as angle; the table keeps the exact participant values visible.';

    drawRose(els.primaryCanvas, [
      { angle: summary.mean, color: COLORS.floor, width: 5, pointRadius: 7, markOuter: true }
    ], {
      maxAngle: 60,
      direction: item => item.angle,
      legend: [{ color: COLORS.floor, label: 'mean angle' }]
    });
    drawRose(els.secondaryCanvas, records.map(record => ({
      angle: record.perceived_angle,
      color: COLORS.floor,
      alpha: 0.75,
      pointRadius: 4
    })), {
      maxAngle: 60,
      direction: item => item.angle,
      legend: [{ color: COLORS.floor, label: 'participant' }]
    });

    table(['Participant', 'Age', 'Sex', 'Perceived angle', 'Prior knowledge'], records.map(record => [
      record.participant_name,
      record.age,
      record.sex,
      `${fmt(record.perceived_angle)}°`,
      record.prior_knowledge
    ]));
    els.recordsCount.textContent = `${records.length} records`;
  }

  function renderCafe() {
    const cafe = cfg.records;
    els.stats.textContent = `N=${cafe.record_count} • Staring: ${fmt(cafe.stared_lookbacks / cafe.record_count * 100, 1)}% • Control: ${fmt(cafe.control_lookbacks / cafe.record_count * 100, 1)}% • McNemar p=${cafe.two_sided_p}`;
    els.chartNote.textContent = `${cafe.conclusion} The figure shows the paired change rather than two independent bars.`;
    drawRateComparison(els.primaryCanvas, cafe);
    drawDiscordantPairs(els.secondaryCanvas, cafe);
    table(['Measure', 'Value'], [
      ['Looked back only when stared at', cafe.stared_only],
      ['Looked back only in control', cafe.control_only],
      ['Discordant subjects', cafe.discordant_subjects],
      ['Two-sided McNemar p-value', cafe.two_sided_p],
      ['One-sided p-value', cafe.one_sided_p],
      ['Absolute increase', `+${fmt(cafe.absolute_increase_points, 1)} percentage points`],
      ['Approx. 95% CI', `+${fmt(cafe.ci95_low_points, 1)} to +${fmt(cafe.ci95_high_points, 1)} percentage points`],
      ['Paired odds ratio', fmt(cafe.paired_odds_ratio, 1)],
      ['Careful conclusion', cafe.conclusion]
    ]);
    els.recordsCount.textContent = `${cafe.record_count} paired subjects`;
  }

  function render() {
    if (els.chairExtraPlots) els.chairExtraPlots.style.display = experiment === 'chair' ? '' : 'none';
    if (experiment === 'floor') renderFloor();
    else if (experiment === 'cafe') renderCafe();
    else renderChair();
  }

  function canvasPoint(event, canvas) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  function attachChairHover() {
    if (experiment !== 'chair' || !els.secondaryCanvas) return;
    els.secondaryCanvas.addEventListener('mousemove', (event) => {
      const point = canvasPoint(event, els.secondaryCanvas);
      const hit = state.chairHoverHitboxes.find(box => {
        const dx = point.x - box.x;
        const dy = point.y - box.y;
        return Math.sqrt(dx * dx + dy * dy) <= box.radius;
      });
      const nextKey = hit ? hit.key : '';
      const moved = !state.hoverPoint || Math.abs(state.hoverPoint.x - point.x) > 2 || Math.abs(state.hoverPoint.y - point.y) > 2;
      if (nextKey !== state.hoverParticipantKey || moved) {
        state.hoverParticipantKey = nextKey;
        state.hoverPoint = hit ? point : null;
        els.secondaryCanvas.style.cursor = hit ? 'pointer' : 'default';
        window.requestAnimationFrame(render);
      }
    });
    els.secondaryCanvas.addEventListener('mouseleave', () => {
      if (!state.hoverParticipantKey && !state.hoverPoint) return;
      state.hoverParticipantKey = '';
      state.hoverPoint = null;
      els.secondaryCanvas.style.cursor = 'default';
      window.requestAnimationFrame(render);
    });
  }

  function init() {
    els.kicker.textContent = cfg.kicker;
    els.title.textContent = cfg.title;
    els.lede.textContent = cfg.lede;
    els.primaryTitle.textContent = cfg.primaryTitle;
    els.secondaryTitle.textContent = cfg.secondaryTitle;
    els.tableTitle.textContent = cfg.tableTitle;
    els.sourceSheet.href = cfg.sheet || '#';
    render();
    attachChairHover();
    window.addEventListener('resize', () => window.requestAnimationFrame(render));
  }

  document.addEventListener('DOMContentLoaded', init);
})();
