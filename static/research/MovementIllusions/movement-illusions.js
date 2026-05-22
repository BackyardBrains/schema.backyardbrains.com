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
      primaryTitle: 'Mean Perceived Rotation by Tendon',
      secondaryTitle: 'Participant Perceived Rotation',
      tableTitle: 'Chair Rotation Records'
    },
    floor: {
      title: 'Arm Through Floor Illusion',
      kicker: 'Body Schema',
      lede: 'Perceived arm angle below the floor after participants were lowered back to the ground without vision.',
      sheet: data.docs && data.docs.floorSheet,
      records: data.floor || [],
      primaryTitle: 'Mean Perceived Angle',
      secondaryTitle: 'Participant Perceived Angle',
      tableTitle: 'Arm Through Floor Records'
    },
    cafe: {
      title: 'Cafe Stare Experiment',
      kicker: 'Naturalistic Attention',
      lede: 'Look-back outcomes during direct stare trials compared with no-direct-stare control trials in cafes.',
      sheet: data.docs && data.docs.cafeSheet,
      records: data.cafe || {},
      primaryTitle: 'Look-Back Outcome Counts',
      secondaryTitle: 'Sample Trial Outcomes',
      tableTitle: 'Cafe Stare Sample Records'
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
    secondaryCanvas: document.getElementById('secondaryChart')
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

  function chartBar(canvas, labels, values, label, color) {
    return new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label,
          data: values,
          backgroundColor: color || '#2f7dbb',
          borderColor: '#000',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { grid: { color: 'rgba(0,0,0,0.08)' } },
          x: { grid: { display: false } }
        }
      }
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
    const felt = records.filter(record => record.perceived_angle > 0).length;
    els.stats.textContent = `Records: ${records.length} • Felt rotation: ${felt} • Biceps mean: ${fmt(byTendon.find(r => r.name === 'bicep').mean, 2)} deg • Triceps mean: ${fmt(byTendon.find(r => r.name === 'tricep').mean, 2)} deg`;
    els.chartNote.textContent = 'Means include participants who reported zero perceived rotation.';
    chartBar(els.primaryCanvas, byTendon.map(row => row.name), byTendon.map(row => row.mean), 'Mean perceived rotation', '#ff805f');
    chartBar(els.secondaryCanvas, records.map(record => `${record.participant_name} (${record.tendon[0]})`), records.map(record => record.perceived_angle), 'Perceived rotation', '#2f7dbb');
    table(['Participant', 'Tendon', 'Perceived angle', 'Felt rotation'], records.map(record => [
      record.participant_name,
      record.tendon,
      fmt(record.perceived_angle),
      record.felt_rotation ? 'Y' : 'N'
    ]));
    els.recordsCount.textContent = `${records.length} records`;
  }

  function renderFloor() {
    const records = cfg.records;
    const values = records.map(record => record.perceived_angle);
    const summary = summarize(values);
    els.stats.textContent = `Records: ${records.length} • Mean perceived angle: ${fmt(summary.mean, 2)} deg • SD: ${fmt(summary.sd, 2)} deg`;
    els.chartNote.textContent = 'Zero is included for the subject whose sheet value was recorded as 0.';
    chartBar(els.primaryCanvas, ['Mean'], [summary.mean], 'Mean perceived angle', '#ff805f');
    chartBar(els.secondaryCanvas, records.map(record => record.participant_name), values, 'Perceived angle', '#2f7dbb');
    table(['Participant', 'Age', 'Sex', 'Perceived angle', 'Prior knowledge'], records.map(record => [
      record.participant_name,
      record.age,
      record.sex,
      fmt(record.perceived_angle),
      record.prior_knowledge
    ]));
    els.recordsCount.textContent = `${records.length} records`;
  }

  function renderCafe() {
    const cafe = cfg.records;
    const sampleRows = cafe.sample_rows || [];
    const labels = ['Stared only', 'Control only', 'Looked in both', 'Looked in neither'];
    const values = [
      cafe.stared_only,
      cafe.control_only,
      cafe.stared_lookbacks - cafe.stared_only,
      cafe.record_count - cafe.stared_only - cafe.control_only - (cafe.stared_lookbacks - cafe.stared_only)
    ];
    els.stats.textContent = `N=${cafe.record_count} • Staring: ${fmt(cafe.stared_lookbacks / cafe.record_count * 100, 1)}% • Control: ${fmt(cafe.control_lookbacks / cafe.record_count * 100, 1)}% • McNemar p=${cafe.two_sided_p}`;
    els.chartNote.textContent = `${cafe.conclusion} Exact McNemar/binomial test: two-sided p=${cafe.two_sided_p}; paired odds ratio=${fmt(cafe.paired_odds_ratio, 1)}; paired difference +${fmt(cafe.absolute_increase_points, 1)} percentage points, 95% CI +${fmt(cafe.ci95_low_points, 1)} to +${fmt(cafe.ci95_high_points, 1)}.`;
    chartBar(els.primaryCanvas, labels, values, 'Outcome count', '#7a8a38');
    chartBar(els.secondaryCanvas, ['Staring condition', 'Control condition'], [cafe.stared_lookbacks, cafe.control_lookbacks], 'Look-back count', '#2f7dbb');
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

  function init() {
    els.kicker.textContent = cfg.kicker;
    els.title.textContent = cfg.title;
    els.lede.textContent = cfg.lede;
    els.primaryTitle.textContent = cfg.primaryTitle;
    els.secondaryTitle.textContent = cfg.secondaryTitle;
    els.tableTitle.textContent = cfg.tableTitle;
    els.sourceSheet.href = cfg.sheet || '#';

    if (experiment === 'floor') renderFloor();
    else if (experiment === 'cafe') renderCafe();
    else renderChair();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
