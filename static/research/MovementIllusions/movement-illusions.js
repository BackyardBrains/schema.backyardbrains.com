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
      secondaryTitle: 'Feeler / Non-Feeler',
      tableTitle: 'Chair Rotation Records'
    },
    floor: {
      title: 'Arm Through Floor Illusion',
      kicker: 'Body Schema',
      lede: 'Prone participants received false floor cues while their arms were lowered without vision.',
      sheet: data.docs && data.docs.floorSheet,
      records: data.floor || [],
      primaryTitle: 'Arm Through Floor Protocol',
      secondaryTitle: 'Participant Reported Floor Angles',
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
    secondaryChartNote: document.getElementById('secondaryChartNote'),
    individualChartNote: document.getElementById('individualChartNote'),
    bicepFeelChartNote: document.getElementById('bicepFeelChartNote'),
    tricepFeelChartNote: document.getElementById('tricepFeelChartNote'),
    tableTitle: document.getElementById('tableTitle'),
    recordsCount: document.getElementById('recordsCount'),
    tableHead: document.getElementById('tableHead'),
    tableBody: document.getElementById('tableBody'),
    primaryCanvas: document.getElementById('primaryChart'),
    secondaryCanvas: document.getElementById('secondaryChart'),
    chairExtraPlots: document.getElementById('chairExtraPlots'),
    individualTitle: document.getElementById('individualChartTitle'),
    bicepFeelTitle: document.getElementById('bicepFeelChartTitle'),
    tricepFeelTitle: document.getElementById('tricepFeelChartTitle'),
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

  function drawRoseAxes(ctx, cx, cy, radius, maxAngle, angleTransform = angle => angle) {
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
      const outer = polarPoint(cx, cy, radius, angleTransform(angle));
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(outer.x, outer.y);
      ctx.stroke();
      if (angle % 90 === 0) {
        const label = polarPoint(cx, cy, radius + 18, angleTransform(angle));
        ctx.fillText(`${angle}°`, label.x, label.y);
      }
    }

    const maxAngleLabel = polarPoint(cx, cy, radius + 32, angleTransform(maxAngle));
    ctx.fillText(`${maxAngle}°`, maxAngleLabel.x, maxAngleLabel.y);
    ctx.restore();
  }

  function drawRose(canvas, items, options) {
    const { ctx, width, height } = prepareCanvas(canvas);
    const cx = width * 0.5;
    const cy = height * 0.52;
    const radius = Math.min(width, height) * 0.34;
    const maxAngle = options.maxAngle || 90;
    const angleTransform = options.angleTransform || (angle => angle);
    drawRoseAxes(ctx, cx, cy, radius, maxAngle, angleTransform);

    items.forEach((item, index) => {
      const signedDegrees = Number(item.angle) || 0;
      const degrees = Math.min(maxAngle, Math.abs(signedDegrees));
      const lengthScale = item.lengthScale == null
        ? (options.unitLength ? 1 : degrees / maxAngle)
        : item.lengthScale;
      const length = radius * lengthScale;
      const rawTheta = options.direction ? options.direction(item, index) : signedDegrees;
      const theta = angleTransform(rawTheta);
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
      if (item.arrow) {
        const headLength = Math.max(12, ctx.lineWidth * 3.2);
        const radians = (theta - 90) * Math.PI / 180;
        const left = radians + Math.PI - Math.PI / 7;
        const right = radians + Math.PI + Math.PI / 7;
        ctx.beginPath();
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x + Math.cos(left) * headLength, end.y + Math.sin(left) * headLength);
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x + Math.cos(right) * headLength, end.y + Math.sin(right) * headLength);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(end.x, end.y, isHovered ? Math.max(item.pointRadius || 4, 7) : (item.pointRadius || 4), 0, Math.PI * 2);
        ctx.fill();
        if (isHovered) {
          ctx.strokeStyle = COLORS.ink;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
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

  function drawFloorProtocol(canvas, mode) {
    const items = [
      { angle: 0, color: COLORS.control, alpha: 0.36, width: 2, arrow: true, lengthScale: 1 },
      { angle: 90, color: COLORS.control, alpha: 0.36, width: 2, arrow: true, lengthScale: 1 }
    ];
    let legend = [
      { color: COLORS.control, label: '0° overhead / 90° front' }
    ];

    if (mode === 'halfway') {
      items.push({ angle: 45, color: COLORS.floor, width: 5, arrow: true, markOuter: true, lengthScale: 1.18 });
      legend = [
        { color: COLORS.floor, label: 'false floor cue at halfway' },
        { color: COLORS.control, label: '0° to 90° lowering frame' }
      ];
    } else if (mode === 'pullback') {
      items.push(
        { angle: -20, color: COLORS.bicep, width: 4, arrow: true, markOuter: true, lengthScale: 1.05 },
        { angle: -10, color: COLORS.floor, width: 5, arrow: true, markOuter: true, lengthScale: 1.25 }
      );
      legend = [
        { color: COLORS.bicep, label: 'pulled back to -20°' },
        { color: COLORS.floor, label: 'false floor cue at -10°' }
      ];
    }

    drawRose(canvas, items, {
      maxAngle: 90,
      unitLength: true,
      angleTransform: angle => angle + 90,
      direction: item => item.angle,
      legend
    });
  }

  function hasFalseInformation(record) {
    return String(record.false_information_added || '').trim().toLowerCase().startsWith('y');
  }

  function drawFloorInformationAverages(canvas, records) {
    const falseInfoRows = records.filter(hasFalseInformation);
    const noInfoRows = records.filter(record => !hasFalseInformation(record));
    const falseInfoSummary = summarize(falseInfoRows.map(record => record.perceived_angle));
    const noInfoSummary = summarize(noInfoRows.map(record => record.perceived_angle));

    drawRose(canvas, [
      ...falseInfoRows.map(record => ({
        angle: record.perceived_angle,
        color: COLORS.floor,
        alpha: 0.35,
        pointRadius: 3,
        lengthScale: 1
      })),
      ...noInfoRows.map(record => ({
        angle: record.perceived_angle,
        color: COLORS.tricep,
        alpha: 0.35,
        pointRadius: 3,
        lengthScale: 1
      })),
      {
        angle: falseInfoSummary.mean,
        color: COLORS.floor,
        width: 5,
        arrow: true,
        markOuter: true,
        lengthScale: 1.35
      },
      {
        angle: noInfoSummary.mean,
        color: COLORS.tricep,
        width: 5,
        arrow: true,
        markOuter: true,
        lengthScale: 1.35
      }
    ], {
      maxAngle: 90,
      unitLength: true,
      angleTransform: angle => angle + 90,
      direction: item => item.angle,
      legend: [
        { color: COLORS.floor, label: `false info mean ${fmt(falseInfoSummary.mean, 1)}° (n=${falseInfoSummary.n})` },
        { color: COLORS.tricep, label: `no info mean ${fmt(noInfoSummary.mean, 1)}° (n=${noInfoSummary.n})` }
      ]
    });
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
    const plot = { left: 70, right: width - 26, top: 62, bottom: height - 70 };
    const staredRate = cafe.stared_lookbacks / cafe.record_count;
    const controlRate = cafe.control_lookbacks / cafe.record_count;
    const maxRate = 0.5;
    const y = rate => plot.bottom - rate * (plot.bottom - plot.top) / maxRate;
    const x1 = plot.left + (plot.right - plot.left) * 0.32;
    const x2 = plot.left + (plot.right - plot.left) * 0.68;
    const barWidth = Math.min(74, (plot.right - plot.left) * 0.22);

    ctx.strokeStyle = COLORS.grid;
    ctx.fillStyle = COLORS.muted;
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let tick = 0; tick <= maxRate + 0.001; tick += 0.1) {
      const yy = y(tick);
      ctx.beginPath();
      ctx.moveTo(plot.left, yy);
      ctx.lineTo(plot.right, yy);
      ctx.stroke();
      ctx.fillText(`${Math.round(tick * 100)}%`, plot.left - 8, yy);
    }

    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(plot.left, plot.top);
    ctx.lineTo(plot.left, plot.bottom);
    ctx.lineTo(plot.right, plot.bottom);
    ctx.stroke();

    [
      { x: x1, value: controlRate, count: cafe.control_lookbacks, label: 'Control', color: COLORS.control },
      { x: x2, value: staredRate, count: cafe.stared_lookbacks, label: 'Stared at', color: COLORS.cafe }
    ].forEach(point => {
      const yy = y(point.value);
      ctx.fillStyle = point.color;
      ctx.globalAlpha = 0.88;
      ctx.fillRect(point.x - barWidth / 2, yy, barWidth, plot.bottom - yy);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(point.x - barWidth / 2, yy, barWidth, plot.bottom - yy);
      ctx.fillStyle = point.color;
      ctx.beginPath();
      ctx.arc(point.x, yy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.ink;
      ctx.textAlign = 'center';
      ctx.fillText(point.label, point.x, plot.bottom + 24);
      ctx.font = '700 17px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(`${fmt(point.value * 100, 1)}%`, point.x, Math.max(plot.top + 22, yy - 10));
      ctx.font = '13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(`${point.count}/${cafe.record_count}`, point.x, Math.max(plot.top + 40, yy + 12));
    });

    const bracketY = plot.top + 20;
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x1, bracketY + 12);
    ctx.lineTo(x1, bracketY);
    ctx.lineTo(x2, bracketY);
    ctx.lineTo(x2, bracketY + 12);
    ctx.stroke();
    ctx.fillStyle = COLORS.ink;
    ctx.textAlign = 'center';
    ctx.font = '700 18px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('**', (x1 + x2) / 2, bracketY - 10);
    ctx.font = '12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(`McNemar p=${cafe.two_sided_p}`, (x1 + x2) / 2, bracketY - 27);

    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.ink;
    ctx.font = '13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(`Paired difference +${fmt(cafe.absolute_increase_points, 1)} percentage points`, plot.left, height - 28);
    ctx.fillText(`95% CI +${fmt(cafe.ci95_low_points, 1)} to +${fmt(cafe.ci95_high_points, 1)}; McNemar p=${cafe.two_sided_p}`, plot.left, height - 10);
  }

  function drawDiscordantPairs(canvas, cafe) {
    const { ctx, width, height } = prepareCanvas(canvas);
    const both = cafe.stared_lookbacks - cafe.stared_only;
    const neither = cafe.record_count - both - cafe.stared_only - cafe.control_only;
    const cellSize = Math.min(108, Math.max(80, (Math.min(width - 210, height - 240)) / 2));
    const grid = {
      left: Math.max(128, (width - cellSize * 2) / 2),
      top: 150,
      cell: cellSize
    };
    const cells = [
      { row: 0, col: 0, value: neither, label: 'Neither looked back', color: '#f2f2f0' },
      { row: 0, col: 1, value: cafe.stared_only, label: 'Stared only', color: COLORS.staredOnly, highlight: true },
      { row: 1, col: 0, value: cafe.control_only, label: 'Control only', color: COLORS.controlOnly, highlight: true },
      { row: 1, col: 1, value: both, label: 'Both trials', color: '#d9e7f2' }
    ];

    ctx.save();
    ctx.fillStyle = COLORS.ink;
    ctx.textAlign = 'center';
    ctx.font = '700 16px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('Paired outcomes for McNemar test', width / 2, 28);
    ctx.font = '12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = COLORS.muted;
    ctx.fillText('Each subject contributes one looked-at trial and one looked-away trial.', width / 2, 50);

    ctx.fillStyle = COLORS.ink;
    ctx.font = '700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('Experimenter', grid.left + grid.cell, grid.top - 72);
    ctx.fillText('Looked at Subject', grid.left + grid.cell, grid.top - 56);
    ctx.font = '12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = COLORS.muted;
    ctx.fillText('Subject Ignored', grid.left + grid.cell * 0.5, grid.top - 24);
    ctx.fillText('Subject Looked Back', grid.left + grid.cell * 1.5, grid.top - 24);
    ctx.save();
    ctx.translate(grid.left - 98, grid.top + grid.cell);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = COLORS.ink;
    ctx.font = '700 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('Experimenter Looked Away', 0, 0);
    ctx.fillText('from Subject', 0, 16);
    ctx.restore();
    ctx.textAlign = 'right';
    ctx.font = '12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = COLORS.muted;
    ctx.fillText('Subject', grid.left - 10, grid.top + grid.cell * 0.40);
    ctx.fillText('Ignored', grid.left - 10, grid.top + grid.cell * 0.58);
    ctx.fillText('Subject', grid.left - 10, grid.top + grid.cell * 1.40);
    ctx.fillText('Looked Back', grid.left - 10, grid.top + grid.cell * 1.58);

    cells.forEach(cell => {
      const x = grid.left + cell.col * grid.cell;
      const y = grid.top + cell.row * grid.cell;
      ctx.fillStyle = cell.color;
      ctx.globalAlpha = cell.highlight ? 0.88 : 0.8;
      ctx.fillRect(x, y, grid.cell, grid.cell);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = cell.highlight ? COLORS.ink : COLORS.grid;
      ctx.lineWidth = cell.highlight ? 2 : 1;
      ctx.strokeRect(x, y, grid.cell, grid.cell);
      ctx.textAlign = 'center';
      ctx.fillStyle = cell.highlight ? '#ffffff' : COLORS.ink;
      ctx.font = '700 25px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(String(cell.value), x + grid.cell / 2, y + grid.cell * 0.48);
    });

    const noteY = grid.top + grid.cell * 2 + 22;
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.ink;
    ctx.font = '13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('McNemar compares only discordant pairs:', width / 2, noteY);
    ctx.font = '700 16px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(`${cafe.stared_only} stared-only vs ${cafe.control_only} control-only`, width / 2, noteY + 22);
    ctx.font = '13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(`odds ratio ${fmt(cafe.paired_odds_ratio, 1)}x; two-sided p=${cafe.two_sided_p}`, width / 2, noteY + 42);
    ctx.restore();
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
    const rowGap = Math.max(126, height * 0.38);
    const startY = height * 0.26;
    state.chairHoverHitboxes = [];

    ctx.save();
    groups.forEach((group, rowIndex) => {
      const y = startY + rowIndex * rowGap;
      const color = group.tendon === 'bicep' ? COLORS.bicep : COLORS.tricep;
      ctx.font = '700 15px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = COLORS.ink;
      ctx.textAlign = 'right';
      ctx.fillText(group.tendon === 'bicep' ? 'Biceps' : 'Triceps', startX - 26, y);
      ctx.font = '13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(`${group.feelers} Feeler / ${group.nonFeelers} Non-Feeler`, startX - 26, y + 22);

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
      { color: COLORS.bicep, label: 'biceps Feeler' },
      { color: COLORS.tricep, label: 'triceps Feeler' },
      { color: '#d8d8d8', label: 'Non-Feeler' }
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
        arrow: true,
        markOuter: true,
        lengthScale: 1.5
      },
      {
        angle: tricepSummary.mean,
        color: COLORS.tricep,
        alpha: 1,
        width: 5,
        arrow: true,
        markOuter: true,
        lengthScale: 1.5
      }
    ], {
      maxAngle: 90,
      unitLength: true,
      angleTransform: angle => angle + 90,
      direction: item => item.angle,
      legend: [
        { color: COLORS.bicep, label: `biceps mean ${fmt(bicepSummary.mean, 1)}°` },
        { color: COLORS.tricep, label: `triceps mean ${fmt(tricepSummary.mean, 1)}°` }
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
    const bicepRows = records.filter(record => record.tendon === 'bicep');
    const tricepRows = records.filter(record => record.tendon === 'tricep');
    const feelerRows = records.filter(record => Math.abs(record.perceived_angle) > 0);
    const nonFeelerRows = records.filter(record => Math.abs(record.perceived_angle) === 0);
    const felt = records.filter(record => Math.abs(record.perceived_angle) > 0).length;

    els.stats.textContent = `Records: ${records.length} • Felt Rotation in Body: ${felt}/${records.length} True • Biceps mean: ${fmt(bicepMean, 2)}° • Triceps mean: ${fmt(tricepMean, 2)}°`;
    els.chartNote.textContent = 'Signed angles and mean values come from the Bicep Data and Tricep Data tabs. In rose plots, individual rays use unit length; mean arrows use 1.5x length.';
    els.primaryTitle.textContent = `Mean Signed Perceived Rotation (biceps n=${bicepRows.length}, triceps n=${tricepRows.length})`;
    els.secondaryTitle.textContent = `Feeler / Non-Feeler (n=${chairParticipants(records).length} paired participants)`;
    if (els.individualTitle) els.individualTitle.textContent = `Individual Signed Rotation Reports (n=${records.length})`;
    if (els.bicepFeelTitle) els.bicepFeelTitle.textContent = `Bicep vs Tricep (Feeler, n=${feelerRows.length})`;
    if (els.tricepFeelTitle) els.tricepFeelTitle.textContent = `Bicep vs Tricep (Non-Feeler, n=${nonFeelerRows.length})`;
    if (els.secondaryChartNote) {
      els.secondaryChartNote.textContent = 'Each column is a paired participant. Hover any circle to highlight the participant pair here and in Plots 3-5.';
    }
    if (els.individualChartNote) {
      els.individualChartNote.textContent = 'All signed participant reports, with biceps and triceps overlaid on the same rose plot.';
    }
    if (els.bicepFeelChartNote) {
      els.bicepFeelChartNote.textContent = 'Only participants with nonzero perceived rotation; mean arrows compare biceps and triceps among Feelers.';
    }
    if (els.tricepFeelChartNote) {
      els.tricepFeelChartNote.textContent = 'Only participants with zero perceived rotation; both tendon means sit at zero.';
    }
    if (els.individualCanvas) els.individualCanvas.closest('article').style.display = '';
    if (els.bicepFeelCanvas) els.bicepFeelCanvas.closest('article').style.display = '';
    if (els.tricepFeelCanvas) els.tricepFeelCanvas.closest('article').style.display = '';

    drawRose(els.primaryCanvas, [
      { angle: bicepMean, color: COLORS.bicep, width: 5, arrow: true, markOuter: true, lengthScale: 1.5 },
      { angle: tricepMean, color: COLORS.tricep, width: 5, arrow: true, markOuter: true, lengthScale: 1.5 }
    ], {
      maxAngle: 90,
      unitLength: true,
      angleTransform: angle => angle + 90,
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

    table(['Participant', 'Tendon', 'Signed perceived angle', 'Felt Rotation in Body'], records.map(record => [
      record.participant_name,
      record.tendon,
      `${fmt(record.perceived_angle)}°`,
      record.felt_rotation ? 'True' : 'False'
    ]));
    els.recordsCount.textContent = `${records.length} records`;
  }

  function renderFloor() {
    const records = cfg.records;
    const values = records.map(record => record.perceived_angle);
    const summary = summarize(values);
    els.stats.textContent = `Records: ${records.length} • Mean perceived angle: ${fmt(summary.mean, 2)}° • SD: ${fmt(summary.sd, 2)}°`;
    els.primaryTitle.textContent = 'Arm Through Floor Protocol Angles';
    els.secondaryTitle.textContent = `Participant Reported Floor Angles (n=${records.length})`;
    if (els.individualTitle) els.individualTitle.textContent = 'Halfway False-Floor Cue';
    if (els.bicepFeelTitle) els.bicepFeelTitle.textContent = 'False Information vs No Information';
    if (els.tricepFeelCanvas) els.tricepFeelCanvas.closest('article').style.display = 'none';
    if (els.individualCanvas) els.individualCanvas.closest('article').style.display = '';
    if (els.bicepFeelCanvas) els.bicepFeelCanvas.closest('article').style.display = '';
    els.chartNote.textContent = 'Body-frame convention: 0° is arms overhead, 90° is arms forward like a zombie. In this rose frame, 0° points east and 90° points down.';
    if (els.secondaryChartNote) {
      els.secondaryChartNote.textContent = 'Dots are participant-reported floor angles in the same body frame; this is separate from the protocol cue angles.';
    }
    if (els.individualChartNote) {
      els.individualChartNote.textContent = 'The experimenter falsely tells the participant that the arms have reached the floor halfway through lowering.';
    }
    if (els.bicepFeelChartNote) {
      els.bicepFeelChartNote.textContent = 'Mean arrows compare reported floor angle for participants who received false information versus participants who did not. Dots show individual reports.';
    }

    drawRose(els.primaryCanvas, [
      { angle: 0, color: COLORS.control, alpha: 0.34, width: 2, arrow: true, lengthScale: 1 },
      { angle: 90, color: COLORS.control, alpha: 0.34, width: 2, arrow: true, lengthScale: 1 },
      { angle: summary.mean, color: COLORS.floor, width: 5, arrow: true, markOuter: true, lengthScale: 1.25 }
    ], {
      maxAngle: 90,
      unitLength: true,
      angleTransform: angle => angle + 90,
      direction: item => item.angle,
      legend: [
        { color: COLORS.floor, label: `mean report ${fmt(summary.mean, 1)}°` },
        { color: COLORS.control, label: '0° overhead / 90° front' }
      ]
    });
    drawRose(els.secondaryCanvas, records.map(record => ({
      angle: record.perceived_angle,
      color: COLORS.floor,
      alpha: 0.75,
      pointRadius: 4,
      lengthScale: 1
    })), {
      maxAngle: 90,
      unitLength: true,
      angleTransform: angle => angle + 90,
      direction: item => item.angle,
      legend: [{ color: COLORS.floor, label: 'participant' }]
    });
    drawFloorProtocol(els.individualCanvas, 'halfway');
    drawFloorInformationAverages(els.bicepFeelCanvas, records);

    table(['Participant', 'Age', 'Sex', 'Reported floor angle', 'False information added'], records.map(record => [
      record.participant_name,
      record.age,
      record.sex,
      `${fmt(record.perceived_angle)}°`,
      record.false_information_added
    ]));
    els.recordsCount.textContent = `${records.length} records`;
  }

  function renderCafe() {
    const cafe = cfg.records;
    els.stats.textContent = `N=${cafe.record_count} • Staring: ${fmt(cafe.stared_lookbacks / cafe.record_count * 100, 1)}% • Control: ${fmt(cafe.control_lookbacks / cafe.record_count * 100, 1)}% • McNemar p=${cafe.two_sided_p}`;
    els.primaryTitle.textContent = 'Look-Back Rate by Condition';
    els.secondaryTitle.textContent = 'Paired Outcomes for McNemar Test';
    els.chartNote.textContent = `${cafe.conclusion} Bars show the observed condition rates; the significance bracket uses the paired McNemar test.`;
    if (els.secondaryChartNote) {
      els.secondaryChartNote.textContent = 'Rows show the trial where the experimenter looked away from the subject. Columns show the trial where the experimenter looked at the subject. McNemar uses the two highlighted discordant cells.';
    }
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
    if (els.chairExtraPlots) els.chairExtraPlots.style.display = (experiment === 'chair' || experiment === 'floor') ? '' : 'none';
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
    document.body.classList.add(`movement-${experiment}-page`);
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
