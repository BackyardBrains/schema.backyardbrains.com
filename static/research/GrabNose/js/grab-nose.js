(function () {
  const state = {
    records: [],
    summary: null,
    angleChart: null,
    differenceChart: null,
    attemptChart: null
  };

  const els = {
    stats: document.getElementById('stats'),
    clearData: document.getElementById('clearData'),
    recordsCount: document.getElementById('recordsCount'),
    recordsBody: document.getElementById('recordsBody'),
    status: document.getElementById('status'),
    sheetImportForm: document.getElementById('sheetImportForm'),
    sheetUrl: document.getElementById('sheetUrl'),
    sheetStatus: document.getElementById('sheetStatus'),
    viewSheet: document.getElementById('viewSheet'),
    entryForm: document.getElementById('entryForm'),
    angleCanvas: document.getElementById('angleChart'),
    differenceCanvas: document.getElementById('differenceChart'),
    attemptCanvas: document.getElementById('attemptChart'),
    deltaSummary: document.getElementById('deltaSummary')
  };

  const tCriticalTwoTailed05 = [
    null, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262,
    2.228, 2.201, 2.179, 2.160, 2.145, 2.131, 2.120, 2.110, 2.101, 2.093,
    2.086, 2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045, 2.042
  ];

  const meanDeltaOverlay = {
    id: 'meanDeltaOverlay',
    afterDatasetsDraw(chart) {
      const stats = chart.options.plugins.meanDeltaOverlay;
      if (!stats || stats.mean == null || stats.sd == null) return;
      const meta = chart.getDatasetMeta(0);
      const element = meta && meta.data && meta.data[0];
      const yScale = chart.scales.y;
      if (!element || !yScale) return;
      const { ctx } = chart;
      const x = element.x;
      const highY = yScale.getPixelForValue(stats.mean + stats.sd);
      const lowY = yScale.getPixelForValue(stats.mean - stats.sd);
      ctx.save();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.moveTo(x - 9, highY);
      ctx.lineTo(x + 9, highY);
      ctx.moveTo(x - 9, lowY);
      ctx.lineTo(x + 9, lowY);
      ctx.stroke();
      if (stats.significant) {
        ctx.fillStyle = '#000000';
        ctx.font = '700 22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('*', x, highY - 8);
      }
      ctx.restore();
    }
  };

  function setStatus(message, isError) {
    if (!els.status) return;
    els.status.textContent = message || '';
    els.status.classList.toggle('status-line--error', Boolean(isError));
  }

  function setSheetStatus(message, isError) {
    if (!els.sheetStatus) return;
    els.sheetStatus.textContent = message || '';
    els.sheetStatus.classList.toggle('status-line--error', Boolean(isError));
  }

  function fmt(value, digits = 1) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(digits) : '';
  }

  function summarizeValues(values) {
    const clean = values.map(Number).filter(Number.isFinite);
    if (!clean.length) return null;
    const mean = clean.reduce((sum, value) => sum + value, 0) / clean.length;
    const variance = clean.length > 1
      ? clean.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / (clean.length - 1)
      : 0;
    const sd = Math.sqrt(variance);
    const df = clean.length - 1;
    const t = clean.length > 1 && sd > 0 ? mean / (sd / Math.sqrt(clean.length)) : 0;
    const critical = df > 30 ? 1.96 : tCriticalTwoTailed05[df];
    return {
      mean,
      sd,
      n: clean.length,
      t,
      significant: Boolean(critical && Math.abs(t) > critical)
    };
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

  function sortedRecords() {
    return [...state.records].sort((a, b) => {
      const created = String(a.created_at || '').localeCompare(String(b.created_at || ''));
      return created || String(a.participant_name || '').localeCompare(String(b.participant_name || ''));
    });
  }

  function destroy(chartName) {
    if (state[chartName]) state[chartName].destroy();
  }

  function renderStats() {
    const summary = state.summary || {};
    const meanDiff = summary.mean_angle_difference == null ? 'n/a' : `${fmt(summary.mean_angle_difference)} deg`;
    const meanAttempts = summary.mean_attempts == null ? 'n/a' : fmt(summary.mean_attempts, 2);
    els.stats.textContent = [
      `Records: ${summary.record_count || 0}`,
      `Participants: ${summary.participant_count || 0}`,
      `Mean change: ${meanDiff}`,
      `Mean attempts: ${meanAttempts}`
    ].join(' • ');
  }

  function renderAngleChart() {
    const rows = sortedRecords();
    const labels = rows.map(participantLabel);
    destroy('angleChart');
    state.angleChart = new Chart(els.angleCanvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Before vibration',
            data: rows.map(record => Number(record.starting_angle)),
            backgroundColor: '#2f7dbb'
          },
          {
            label: 'After vibration',
            data: rows.map(record => Number(record.ending_angle)),
            backgroundColor: '#ff805f'
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          tooltip: {
            callbacks: {
              afterLabel(context) {
                const record = rows[context.dataIndex];
                return record ? `Change: ${fmt(record.angle_difference)} deg` : '';
              }
            }
          }
        },
        scales: {
          y: {
            title: { display: true, text: 'Forearm angle (degrees)' },
            grid: { color: 'rgba(0,0,0,0.08)' }
          },
          x: { grid: { display: false } }
        }
      }
    });
  }

  function renderDifferenceChart() {
    const rows = sortedRecords();
    const summary = summarizeValues(rows.map(record => record.angle_difference));
    if (els.deltaSummary) {
      els.deltaSummary.textContent = summary
        ? `Mean delta = ${fmt(summary.mean)} +/- ${fmt(summary.sd)} deg SD, n=${summary.n}${summary.significant ? ' * p < .05 vs 0' : ''}.`
        : 'Positive values mean the arm angle increased after vibration.';
    }
    destroy('differenceChart');
    state.differenceChart = new Chart(els.differenceCanvas, {
      type: 'bar',
      data: {
        labels: ['Mean delta'],
        datasets: [
          {
            label: 'Mean delta',
            data: [summary ? summary.mean : 0],
            backgroundColor: '#ff805f',
            borderColor: '#000000',
            borderWidth: 1
          },
          {
            type: 'scatter',
            label: 'Participant delta',
            data: rows.map((record, index) => ({
              x: 'Mean delta',
              y: Number(record.angle_difference),
              participant: participantLabel(record, index)
            })),
            pointRadius: 5,
            pointHoverRadius: 7,
            pointBackgroundColor: '#ffffff',
            pointBorderColor: '#000000',
            pointBorderWidth: 1.3
          }
        ]
      },
      plugins: [meanDeltaOverlay],
      options: {
        responsive: true,
        plugins: {
          meanDeltaOverlay: summary || {},
          tooltip: {
            callbacks: {
              label(context) {
                const point = context.raw || {};
                if (context.dataset.type === 'scatter') {
                  return `${point.participant || 'participant'}: ${fmt(context.parsed.y)} deg`;
                }
                return `${context.dataset.label}: ${fmt(context.parsed.y)} deg`;
              },
              afterLabel(context) {
                if (context.dataset.type === 'scatter' || !summary) return '';
                return [`SD = ${fmt(summary.sd)} deg`, `n = ${summary.n}`, summary.significant ? '* p < .05 vs 0' : 'n.s. vs 0'];
              }
            }
          }
        },
        scales: {
          y: {
            title: { display: true, text: 'Angle change (degrees)' },
            grid: { color: 'rgba(0,0,0,0.08)' }
          },
          x: { grid: { display: false } }
        }
      }
    });
  }

  function renderAttemptChart() {
    const rows = sortedRecords().filter(record => record.attempts !== null && record.attempts !== undefined && record.attempts !== '');
    destroy('attemptChart');
    state.attemptChart = new Chart(els.attemptCanvas, {
      type: 'scatter',
      data: {
        datasets: [{
          label: 'Participant',
          data: rows.map(record => ({
            x: Number(record.angle_difference),
            y: Number(record.attempts),
            participant: record.participant_name || record.participant_id,
            location: record.location
          })),
          pointRadius: 6,
          pointHoverRadius: 8,
          pointBackgroundColor: '#ffffff',
          pointBorderColor: '#000000',
          pointBorderWidth: 1.5
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label(context) {
                const point = context.raw || {};
                const location = point.location ? ` (${point.location})` : '';
                return `${point.participant || 'participant'}${location}: ${fmt(context.parsed.x)} deg, ${context.parsed.y} attempt(s)`;
              }
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: 'Angle change (degrees)' },
            grid: { color: 'rgba(0,0,0,0.08)' }
          },
          y: {
            title: { display: true, text: 'Attempts to grab nose' },
            ticks: { stepSize: 1 },
            grid: { color: 'rgba(0,0,0,0.08)' }
          }
        }
      }
    });
  }

  function renderTable() {
    const rows = sortedRecords();
    els.recordsCount.textContent = `${rows.length} record${rows.length === 1 ? '' : 's'}`;
    els.recordsBody.innerHTML = rows.map(record => `
      <tr>
        <td>${escapeHtml(record.participant_name || record.participant_id)}</td>
        <td>${escapeHtml(record.age)}</td>
        <td>${escapeHtml(record.sex)}</td>
        <td class="num">${fmt(record.starting_angle)}</td>
        <td class="num">${fmt(record.ending_angle)}</td>
        <td class="num">${fmt(record.angle_difference)}</td>
        <td class="num">${escapeHtml(record.attempts)}</td>
        <td>${escapeHtml(record.location)}</td>
        <td>${escapeHtml(record.comments)}</td>
      </tr>
    `).join('');
  }

  function renderAll() {
    renderStats();
    renderAngleChart();
    renderDifferenceChart();
    renderAttemptChart();
    renderTable();
  }

  async function loadData() {
    const res = await fetch('/api/research/grab-nose/data', { credentials: 'same-origin' });
    if (!res.ok) throw new Error('Failed to load grab-nose data');
    const data = await res.json();
    state.records = data.records || [];
    state.summary = data.summary || {};
    renderAll();
  }

  async function importSheet(event) {
    event.preventDefault();
    const url = (els.sheetUrl && els.sheetUrl.value || '').trim();
    if (!url) {
      setStatus('Enter a Google Sheet URL first.', true);
      setSheetStatus('Enter a Google Sheet URL first.', true);
      return;
    }
    setStatus('Importing Google Sheet...');
    setSheetStatus('Importing Google Sheet...');
    const res = await fetch('/api/research/grab-nose/import-sheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ url })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const account = data.service_account_email ? ` Share the sheet with: ${data.service_account_email}` : '';
      const upstream = data.upstream_status ? ` Google returned ${data.upstream_status}.` : '';
      const detail = data.upstream_error ? ` ${data.upstream_error}` : '';
      const message = (data.error || 'Google Sheets API import failed') + upstream + detail + account;
      setStatus(message, true);
      setSheetStatus(message, true);
      console.error('Grab-nose sheet import failed', data);
      return;
    }
    state.records = data.records || [];
    state.summary = data.summary || {};
    renderAll();
    const tab = data.sheet_title ? ` from "${data.sheet_title}"` : '';
    const message = `Imported ${data.imported || 0} grab-nose record(s)${tab}.`;
    setStatus(message);
    setSheetStatus(message);
  }

  async function submitEntry(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = Object.fromEntries(data.entries());
    setStatus('Saving entry...');
    const res = await fetch('/api/research/grab-nose/entry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(body.error || 'Entry save failed', true);
      return;
    }
    state.records = body.records || [];
    state.summary = body.summary || {};
    form.reset();
    renderAll();
    setStatus('Saved grab-nose record.');
  }

  async function clearData() {
    const ok = window.confirm('Clear all locally stored grab-nose records? This cannot be undone.');
    if (!ok) return;
    setStatus('Clearing data...');
    const res = await fetch('/api/research/grab-nose/clear', {
      method: 'POST',
      credentials: 'same-origin'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(data.error || 'Clear data failed', true);
      return;
    }
    state.records = data.records || [];
    state.summary = data.summary || {};
    renderAll();
    setStatus('Cleared local grab-nose data. You can reimport from Google Sheets now.');
  }

  function syncSheetLink() {
    if (!els.viewSheet || !els.sheetUrl) return;
    const url = (els.sheetUrl.value || '').trim();
    if (url) els.viewSheet.href = url;
  }

  function attach() {
    if (els.sheetImportForm) els.sheetImportForm.addEventListener('submit', importSheet);
    if (els.sheetUrl) els.sheetUrl.addEventListener('input', syncSheetLink);
    if (els.viewSheet) els.viewSheet.addEventListener('click', syncSheetLink);
    if (els.entryForm) els.entryForm.addEventListener('submit', submitEntry);
    if (els.clearData) els.clearData.addEventListener('click', clearData);
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
