(function () {
  const SITES = ['wrist', 'index', 'pinky'];
  const CONDITIONS = ['control', 'rhi'];
  const state = {
    records: [],
    summary: null,
    differenceChart: null,
    scatterChart: null
  };

  const els = {
    stats: document.getElementById('stats'),
    clearData: document.getElementById('clearData'),
    recordsBody: document.getElementById('recordsBody'),
    status: document.getElementById('status'),
    showIndividualDifference: document.getElementById('showIndividualDifference'),
    differenceSite: document.getElementById('differenceSite'),
    showAllValues: document.getElementById('showAllValues'),
    scatterSite: document.getElementById('scatterSite'),
    scatterTime: document.getElementById('scatterTime'),
    differenceCanvas: document.getElementById('differenceChart'),
    scatterCanvas: document.getElementById('scatterChart'),
    entryForm: document.getElementById('entryForm'),
    sheetImportForm: document.getElementById('sheetImportForm'),
    sheetUrl: document.getElementById('sheetUrl'),
    importForm: document.getElementById('importForm'),
    csvFile: document.getElementById('csvFile'),
    csvText: document.getElementById('csvText')
  };

  const siteColors = {
    wrist: '#ff805f',
    index: '#2f7dbb',
    pinky: '#7a8a38'
  };

  const plotBackground = {
    id: 'plotBackground',
    beforeDraw(chart) {
      const { ctx, chartArea } = chart;
      if (!chartArea) return;
      ctx.save();
      ctx.fillStyle = '#d8d8d8';
      ctx.fillRect(chartArea.left, chartArea.top, chartArea.right - chartArea.left, chartArea.bottom - chartArea.top);
      ctx.restore();
    }
  };

  function setStatus(message, isError) {
    if (!els.status) return;
    els.status.textContent = message || '';
    els.status.classList.toggle('status-line--error', Boolean(isError));
  }

  function formatSite(site) {
    return site ? site.charAt(0).toUpperCase() + site.slice(1) : 'Unknown';
  }

  function timeRank(value) {
    const text = String(value || '');
    const minutes = text.match(/^(\d+(?:\.\d+)?)m$/);
    if (minutes) return Number(minutes[1]) * 60;
    const clock = text.match(/^(\d+):([0-5]\d)$/);
    if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
    const seconds = text.match(/^(\d+(?:\.\d+)?)s$/);
    if (seconds) return Number(seconds[1]);
    return Number.MAX_SAFE_INTEGER;
  }

  function sortedTimepoints(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) => {
      const rankDiff = timeRank(a) - timeRank(b);
      return rankDiff || String(a).localeCompare(String(b));
    });
  }

  function summarizeValues(values) {
    const clean = values.map(Number).filter(value => Number.isFinite(value));
    if (!clean.length) return null;
    const mean = clean.reduce((sum, value) => sum + value, 0) / clean.length;
    const variance = clean.length > 1
      ? clean.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / (clean.length - 1)
      : 0;
    const sd = Math.sqrt(variance);
    return { mean, sd, n: clean.length, low: mean - sd, high: mean + sd };
  }

  function individualDifferences(selectedSite) {
    const grouped = new Map();
    for (const record of state.records) {
      if (selectedSite !== 'all' && record.site !== selectedSite) continue;
      if (!CONDITIONS.includes(record.condition)) continue;
      const key = [record.participant_id, record.site, record.timepoint, record.condition].join('|');
      if (!grouped.has(key)) {
        grouped.set(key, {
          participant_id: record.participant_id,
          site: record.site,
          timepoint: record.timepoint,
          condition: record.condition,
          values: []
        });
      }
      grouped.get(key).values.push(Number(record.temperature));
    }

    const means = new Map();
    for (const [key, group] of grouped.entries()) {
      const summary = summarizeValues(group.values);
      if (summary) means.set(key, { ...group, temperature: summary.mean });
    }

    const rows = [];
    const participants = [...new Set(state.records.map(record => record.participant_id).filter(Boolean))].sort();
    const sites = selectedSite === 'all'
      ? [...new Set(state.records.map(record => record.site).filter(Boolean))].sort()
      : [selectedSite];
    const timepoints = sortedTimepoints(state.records.map(record => record.timepoint));
    for (const participant of participants) {
      for (const site of sites) {
        for (const timepoint of timepoints) {
          const base = [participant, site, timepoint];
          const control = means.get([...base, 'control'].join('|'));
          const rhi = means.get([...base, 'rhi'].join('|'));
          if (!control || !rhi) continue;
          const label = selectedSite === 'all' ? `${formatSite(site)} ${timepoint || 'time ?'}` : timepoint || 'time ?';
          rows.push({
            participant_id: participant,
            site,
            timepoint,
            label,
            difference: rhi.temperature - control.temperature
          });
        }
      }
    }
    return rows;
  }

  function updateStats() {
    const summary = state.summary || {};
    els.stats.textContent = [
      `Records: ${summary.record_count || 0}`,
      `Participants: ${summary.participant_count || 0}`,
      `Sites: ${(summary.sites || []).length || 0}`
    ].join(' • ');
  }

  function setSelectOptions(select, values, fallbackLabel) {
    if (!select) return;
    const current = select.value;
    select.innerHTML = '';
    const fallback = document.createElement('option');
    fallback.value = 'all';
    fallback.textContent = fallbackLabel;
    select.appendChild(fallback);
    for (const value of values) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = formatSite(value);
      select.appendChild(option);
    }
    if ([...select.options].some(option => option.value === current)) {
      select.value = current;
    }
  }

  function populateFilters() {
    const summary = state.summary || {};
    const sites = summary.sites && summary.sites.length ? summary.sites : SITES;
    const timepoints = sortedTimepoints(summary.timepoints || []);
    setSelectOptions(els.differenceSite, sites, 'All sites');
    setSelectOptions(els.scatterSite, sites, 'All sites');
    if (els.scatterTime) {
      const current = els.scatterTime.value;
      els.scatterTime.innerHTML = '<option value="all">All times</option>';
      for (const timepoint of timepoints) {
        const option = document.createElement('option');
        option.value = timepoint;
        option.textContent = timepoint || 'Unlabeled';
        els.scatterTime.appendChild(option);
      }
      if ([...els.scatterTime.options].some(option => option.value === current)) {
        els.scatterTime.value = current;
      }
    }
  }

  function renderDifferenceChart() {
    const selectedSite = els.differenceSite ? els.differenceSite.value : 'all';
    const showIndividuals = Boolean(els.showIndividualDifference && els.showIndividualDifference.checked);
    const rows = ((state.summary && state.summary.mean_difference) || [])
      .filter(row => selectedSite === 'all' || row.site === selectedSite)
      .sort((a, b) => (timeRank(a.timepoint) - timeRank(b.timepoint)) || a.site.localeCompare(b.site));
    const labels = rows.map(row => selectedSite === 'all' ? `${formatSite(row.site)} ${row.timepoint || 'time ?'}` : row.timepoint || 'time ?');
    const values = rows.map(row => row.mean_difference);
    const colors = rows.map(row => siteColors[row.site] || '#ff805f');
    const datasets = [{
      label: 'Group mean RHI - Control',
      data: values,
      backgroundColor: colors,
      borderColor: '#000000',
      borderWidth: 1
    }];

    if (showIndividuals) {
      datasets.push({
        type: 'scatter',
        label: 'Individual RHI - Control',
        data: individualDifferences(selectedSite).map(row => ({
          x: row.label,
          y: row.difference,
          participant: row.participant_id,
          site: row.site,
          timepoint: row.timepoint
        })),
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: '#ffffff',
        pointBorderColor: '#000000',
        pointBorderWidth: 1.2
      });
    }

    if (state.differenceChart) state.differenceChart.destroy();
    state.differenceChart = new Chart(els.differenceCanvas, {
      type: 'bar',
      data: {
        labels,
        datasets
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: showIndividuals },
          tooltip: {
            callbacks: {
              label(context) {
                if (context.dataset.type === 'scatter') {
                  const point = context.raw || {};
                  return `${point.participant || 'participant ?'}: ${context.parsed.y.toFixed(2)}`;
                }
                return `${context.dataset.label}: ${context.parsed.y.toFixed(2)}`;
              },
              afterLabel(context) {
                if (context.dataset.type === 'scatter') return '';
                const row = rows[context.dataIndex];
                return row ? `n = ${row.n}` : '';
              }
            }
          }
        },
        scales: {
          y: {
            title: { display: true, text: 'Temperature difference' },
            grid: { color: 'rgba(0,0,0,0.08)' }
          },
          x: {
            grid: { display: false }
          }
        }
      }
    });
  }

  function scatterRecords() {
    const site = els.scatterSite ? els.scatterSite.value : 'all';
    const timepoint = els.scatterTime ? els.scatterTime.value : 'all';
    const showAllValues = Boolean(els.showAllValues && els.showAllValues.checked);
    const groups = new Map();
    state.records.forEach((record, index) => {
      if (site !== 'all' && record.site !== site) return;
      if (timepoint !== 'all' && record.timepoint !== timepoint) return;
      if (!CONDITIONS.includes(record.condition)) return;
      const key = showAllValues
        ? [record.id || index, record.participant_id, record.condition, record.site, record.timepoint].join('|')
        : [record.participant_id, record.condition].join('|');
      if (!groups.has(key)) groups.set(key, { ...record, values: [] });
      groups.get(key).values.push(Number(record.temperature));
    });
    return [...groups.values()].map(group => ({
      ...group,
      temperature: group.values.reduce((sum, value) => sum + value, 0) / group.values.length
    }));
  }

  function renderScatterChart() {
    const rows = scatterRecords();
    const showAllValues = Boolean(els.showAllValues && els.showAllValues.checked);
    const participants = [...new Set(rows.map(row => row.participant_id).filter(Boolean))].sort();
    const participantIndex = new Map(participants.map((participant, index) => [participant, index + 1]));
    const siteOffset = showAllValues ? { wrist: -0.16, index: 0, pinky: 0.16 } : {};
    const summaryX = {
      control: participants.length + 1,
      rhi: participants.length + 2
    };
    const datasets = CONDITIONS.map(condition => ({
      label: condition === 'control' ? 'Control' : 'RHI',
      data: rows
        .filter(row => row.condition === condition)
        .map(row => ({
          x: (participantIndex.get(row.participant_id) || 0) + (siteOffset[row.site] || 0) + (condition === 'control' ? -0.08 : 0.08),
          y: Number(row.temperature),
          participant: row.participant_id,
          site: showAllValues ? row.site : 'average',
          timepoint: showAllValues ? row.timepoint : 'average'
        })),
      pointRadius: 6,
      pointHoverRadius: 8,
      pointBackgroundColor: condition === 'control' ? '#000000' : '#ffffff',
      pointBorderColor: '#000000',
      pointBorderWidth: 1.5,
      showLine: false
    }));

    for (const condition of CONDITIONS) {
      const summary = summarizeValues(rows
        .filter(row => row.condition === condition)
        .map(row => row.temperature));
      if (!summary) continue;
      const label = condition === 'control' ? 'Control mean +/- SD' : 'RHI mean +/- SD';
      const x = summaryX[condition];
      datasets.push({
        label,
        data: [{ x, y: summary.low }, { x, y: summary.high }],
        borderColor: '#000000',
        borderWidth: 1.5,
        pointRadius: 0,
        showLine: true,
        type: 'line',
        summary
      });
      datasets.push({
        label: condition === 'control' ? 'Control average' : 'RHI average',
        data: [{ x, y: summary.mean, summary: true, condition, n: summary.n, sd: summary.sd }],
        pointRadius: 9,
        pointHoverRadius: 11,
        pointStyle: 'rectRounded',
        pointBackgroundColor: condition === 'control' ? '#000000' : '#ffffff',
        pointBorderColor: '#000000',
        pointBorderWidth: 1.5,
        showLine: false
      });
    }

    if (state.scatterChart) state.scatterChart.destroy();
    state.scatterChart = new Chart(els.scatterCanvas, {
      type: 'scatter',
      data: { datasets },
      plugins: [plotBackground],
      options: {
        responsive: true,
        plugins: {
          legend: { labels: { usePointStyle: true } },
          tooltip: {
            callbacks: {
              label(context) {
                const point = context.raw || {};
                if (point.summary) {
                  const name = point.condition === 'control' ? 'Control average' : 'RHI average';
                  return `${name}: ${context.parsed.y.toFixed(2)} (SD ${point.sd.toFixed(2)}, n=${point.n})`;
                }
                if (context.dataset.summary) {
                  const summary = context.dataset.summary;
                  return `${context.dataset.label}: ${summary.mean.toFixed(2)} +/- ${summary.sd.toFixed(2)}`;
                }
                const detail = showAllValues ? `${formatSite(point.site)} ${point.timepoint || ''}` : 'average';
                return `${context.dataset.label}: ${point.participant || 'participant ?'} ${detail} ${context.parsed.y.toFixed(2)}`;
              }
            }
          }
        },
        scales: {
          x: {
            min: 0,
            max: Math.max(participants.length + 3, 3),
            ticks: {
              stepSize: 1,
              callback(value) {
                if (value === participants.length + 1) return 'Avg C';
                if (value === participants.length + 2) return 'Avg R';
                return participants[value - 1] || '';
              }
            },
            title: { display: true, text: 'Participant' },
            grid: { color: 'rgba(0,0,0,0.08)' }
          },
          y: {
            title: { display: true, text: 'Temperature' },
            grid: { color: 'rgba(0,0,0,0.12)' }
          }
        }
      }
    });
  }

  function renderRecordsTable() {
    if (!els.recordsBody) return;
    els.recordsBody.innerHTML = '';
    const recent = [...state.records].slice(-60).reverse();
    for (const record of recent) {
      const tr = document.createElement('tr');
      const participant = document.createElement('td');
      const condition = document.createElement('td');
      const site = document.createElement('td');
      const timepoint = document.createElement('td');
      const temperature = document.createElement('td');
      const source = document.createElement('td');
      participant.textContent = record.participant_id || '';
      condition.textContent = record.condition || '';
      site.textContent = record.site || '';
      timepoint.textContent = record.timepoint || '';
      temperature.textContent = Number(record.temperature).toFixed(2);
      temperature.className = 'num';
      source.textContent = record.source || '';
      tr.append(participant, condition, site, timepoint, temperature, source);
      els.recordsBody.appendChild(tr);
    }
  }

  function renderAll() {
    updateStats();
    populateFilters();
    renderDifferenceChart();
    renderScatterChart();
    renderRecordsTable();
  }

  async function loadData() {
    const res = await fetch('/api/research/rhi-temp/data', { credentials: 'same-origin' });
    if (!res.ok) throw new Error('Failed to load RHI temperature data');
    const data = await res.json();
    state.records = data.records || [];
    state.summary = data.summary || {};
    renderAll();
  }

  function collectEntryPayload(form) {
    const data = new FormData(form);
    const readings = {};
    for (const condition of CONDITIONS) {
      readings[condition] = {};
      for (const site of SITES) {
        readings[condition][site] = data.get(`${condition}_${site}`);
      }
    }
    return {
      participant_id: data.get('participant_id'),
      timepoint: data.get('timepoint'),
      notes: data.get('notes'),
      readings
    };
  }

  async function submitEntry(event) {
    event.preventDefault();
    setStatus('Saving entry...');
    const payload = collectEntryPayload(event.currentTarget);
    const res = await fetch('/api/research/rhi-temp/entry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(data.error || 'Entry save failed', true);
      return;
    }
    state.records = data.records || [];
    state.summary = data.summary || {};
    event.currentTarget.reset();
    renderAll();
    setStatus(`Saved ${data.added || 0} temperature readings.`);
  }

  async function importCsv(event) {
    event.preventDefault();
    setStatus('Importing CSV...');
    const file = els.csvFile && els.csvFile.files && els.csvFile.files[0];
    const csvText = (els.csvText && els.csvText.value || '').trim();
    let res;
    if (file) {
      const formData = new FormData();
      formData.append('file', file);
      res = await fetch('/api/research/rhi-temp/import-csv', {
        method: 'POST',
        credentials: 'same-origin',
        body: formData
      });
    } else {
      res = await fetch('/api/research/rhi-temp/import-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ csv: csvText })
      });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(data.error || 'CSV import failed', true);
      return;
    }
    state.records = data.records || [];
    state.summary = data.summary || {};
    if (els.csvFile) els.csvFile.value = '';
    if (els.csvText) els.csvText.value = '';
    renderAll();
    setStatus(`Imported ${data.imported || 0} temperature readings.`);
  }

  async function importSheet(event) {
    event.preventDefault();
    const url = (els.sheetUrl && els.sheetUrl.value || '').trim();
    if (!url) {
      setStatus('Enter a Google Sheet URL first.', true);
      return;
    }
    setStatus('Importing Google Sheet...');
    const res = await fetch('/api/research/rhi-temp/import-sheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ url })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const account = data.service_account_email ? ` Share the sheet with: ${data.service_account_email}` : '';
      setStatus((data.error || 'Google Sheets API import failed') + account, true);
      return;
    }
    state.records = data.records || [];
    state.summary = data.summary || {};
    renderAll();
    const tab = data.sheet_title ? ` from "${data.sheet_title}"` : '';
    setStatus(`Imported ${data.imported || 0} temperature readings${tab} through the Google Sheets API.`);
  }

  async function clearData() {
    const ok = window.confirm('Clear all locally stored RHI temperature records? This cannot be undone.');
    if (!ok) return;
    setStatus('Clearing data...');
    const res = await fetch('/api/research/rhi-temp/clear', {
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
    setStatus('Cleared local RHI temperature data. You can reimport from Google Sheets now.');
  }

  function attach() {
    if (els.clearData) els.clearData.addEventListener('click', clearData);
    if (els.entryForm) els.entryForm.addEventListener('submit', submitEntry);
    if (els.sheetImportForm) els.sheetImportForm.addEventListener('submit', importSheet);
    if (els.importForm) els.importForm.addEventListener('submit', importCsv);
    if (els.differenceSite) els.differenceSite.addEventListener('change', renderDifferenceChart);
    if (els.showIndividualDifference) els.showIndividualDifference.addEventListener('change', renderDifferenceChart);
    if (els.showAllValues) els.showAllValues.addEventListener('change', renderScatterChart);
    if (els.scatterSite) els.scatterSite.addEventListener('change', renderScatterChart);
    if (els.scatterTime) els.scatterTime.addEventListener('change', renderScatterChart);
  }

  attach();
  const authReady = window.researchAuth && window.researchAuth.checkSession
    ? window.researchAuth.checkSession()
    : Promise.resolve(true);
  authReady.then((ok) => {
    if (!ok) return;
    loadData().catch((err) => {
      console.error(err);
      if (els.stats) els.stats.textContent = 'Error loading data';
      setStatus('Could not load RHI temperature data.', true);
    });
  });
})();
