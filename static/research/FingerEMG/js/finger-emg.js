(function () {
  const state = {
    summary: null,
    charts: {},
  };

  const els = {
    stats: document.getElementById('stats'),
    status: document.getElementById('status'),
    syncDrive: document.getElementById('syncDrive'),
    groupPowerChart: document.getElementById('groupPowerChart'),
    perieventChart: document.getElementById('perieventChart'),
    sessionTraceChart: document.getElementById('sessionTraceChart'),
    sessionDeltaChart: document.getElementById('sessionDeltaChart'),
    sessionSelect: document.getElementById('sessionSelect'),
    sessionsCount: document.getElementById('sessionsCount'),
    sessionsBody: document.getElementById('sessionsBody'),
  };

  function setStatus(message, isError) {
    if (!els.status) return;
    els.status.textContent = message || '';
    els.status.classList.toggle('status-line--error', Boolean(isError));
  }

  function fmt(value, digits) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(digits == null ? 3 : digits) : '';
  }

  function alphaLabel(prefix, index) {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const safe = Math.max(0, Number(index) || 0);
    const first = letters[safe % letters.length];
    const round = Math.floor(safe / letters.length);
    return round > 0 ? `${prefix} ${first}${round}` : `${prefix} ${first}`;
  }

  function qualitativeDelta(deltaValue) {
    const delta = Number(deltaValue);
    if (!Number.isFinite(delta)) return 'unclear';
    if (delta > 0) return 'higher in gross';
    if (delta < 0) return 'higher in control';
    return 'no clear change';
  }

  function destroyChart(name) {
    if (state.charts[name]) {
      state.charts[name].destroy();
      state.charts[name] = null;
    }
  }

  function upsertChart(name, canvas, config) {
    if (!canvas || typeof Chart === 'undefined') return;
    destroyChart(name);
    state.charts[name] = new Chart(canvas, config);
  }

  function renderStats(summary) {
    els.stats.textContent = 'Session and group views loaded.';
  }

  function renderSessionSelect(summary) {
    const sessions = (summary && summary.sessions) || [];
    const current = els.sessionSelect.value;
    els.sessionSelect.innerHTML = '';
    sessions.forEach((row, index) => {
      const option = document.createElement('option');
      option.value = row.session_id;
      option.textContent = `${alphaLabel('Session', index)} • ${alphaLabel('Participant', index)}`;
      els.sessionSelect.appendChild(option);
    });
    if (sessions.some((row) => row.session_id === current)) {
      els.sessionSelect.value = current;
    }
  }

  function renderGroupPower(summary) {
    const group = (summary && summary.group) || {};
    upsertChart('groupPower', els.groupPowerChart, {
      type: 'bar',
      data: {
        labels: ['Channel A', 'Channel B'],
        datasets: [
          {
            label: 'Control',
            data: [group.mean_control_power_ch1, group.mean_control_power_ch2],
            backgroundColor: '#2f7dbb',
          },
          {
            label: 'Gross video',
            data: [group.mean_experiment_power_ch1, group.mean_experiment_power_ch2],
            backgroundColor: '#ff805f',
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'top' },
          tooltip: { enabled: false }
        },
        scales: {
          y: {
            title: { display: true, text: 'Relative power' },
            ticks: { display: false },
            grid: { color: 'rgba(0,0,0,0.08)' }
          },
          x: {
            ticks: { display: false }
          }
        }
      }
    });
  }

  function renderPerievent(summary) {
    const group = (summary && summary.group) || {};
    const control1 = group.perievent_control_ch1 || [];
    const control2 = group.perievent_control_ch2 || [];
    const exp1 = group.perievent_experiment_ch1 || [];
    const exp2 = group.perievent_experiment_ch2 || [];
    const labels = control1.map((row) => row.t);
    upsertChart('perievent', els.perieventChart, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Control start Channel A', data: control1.map((row) => row.p), borderColor: '#2f7dbb', pointRadius: 0, borderWidth: 2 },
          { label: 'Gross start Channel A', data: exp1.map((row) => row.p), borderColor: '#ff805f', pointRadius: 0, borderWidth: 2 },
          { label: 'Control start Channel B', data: control2.map((row) => row.p), borderColor: '#7a8a38', pointRadius: 0, borderWidth: 2, borderDash: [6, 4] },
          { label: 'Gross start Channel B', data: exp2.map((row) => row.p), borderColor: '#7f6eb3', pointRadius: 0, borderWidth: 2, borderDash: [6, 4] }
        ]
      },
      options: {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        plugins: { tooltip: { enabled: false } },
        scales: {
          x: { title: { display: true, text: 'Time from condition onset' }, ticks: { display: false } },
          y: { title: { display: true, text: 'Relative power' }, ticks: { display: false }, grid: { color: 'rgba(0,0,0,0.08)' } }
        }
      }
    });
  }

  function selectedSession(summary) {
    const sessions = (summary && summary.sessions) || [];
    if (!sessions.length) return null;
    const id = els.sessionSelect.value || sessions[0].session_id;
    return sessions.find((row) => row.session_id === id) || sessions[0];
  }

  function renderSessionTrace(summary) {
    const session = selectedSession(summary);
    if (!session) {
      destroyChart('sessionTrace');
      return;
    }
    const control = session.control_trace_ch1 || [];
    const experiment = session.experiment_trace_ch1 || [];
    upsertChart('sessionTrace', els.sessionTraceChart, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Control trace Ch1',
            data: control.map((row) => ({ x: row.t, y: row.p })),
            borderColor: '#2f7dbb',
            pointRadius: 0,
            borderWidth: 2
          },
          {
            label: 'Gross trace Ch1',
            data: experiment.map((row) => ({ x: row.t, y: row.p })),
            borderColor: '#ff805f',
            pointRadius: 0,
            borderWidth: 2
          }
        ]
      },
      options: {
        responsive: true,
        parsing: false,
        plugins: { tooltip: { enabled: false } },
        scales: {
          x: { type: 'linear', title: { display: true, text: 'Progress through condition window' }, ticks: { display: false } },
          y: { title: { display: true, text: 'Relative power' }, ticks: { display: false }, grid: { color: 'rgba(0,0,0,0.08)' } }
        }
      }
    });
  }

  function renderSessionDeltas(summary) {
    const sessions = (summary && summary.sessions) || [];
    upsertChart('sessionDelta', els.sessionDeltaChart, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: 'Channel A gross-control',
            data: sessions.map((row, i) => ({
              x: i,
              y: Number(row.experiment_mean_power_ch1) - Number(row.control_mean_power_ch1),
              participant: alphaLabel('Participant', i)
            })),
            pointBackgroundColor: '#ff805f',
            pointBorderColor: '#000000',
            pointRadius: 5
          },
          {
            label: 'Channel B gross-control',
            data: sessions.map((row, i) => ({
              x: i,
              y: Number(row.experiment_mean_power_ch2) - Number(row.control_mean_power_ch2),
              participant: alphaLabel('Participant', i)
            })),
            pointBackgroundColor: '#7f6eb3',
            pointBorderColor: '#000000',
            pointRadius: 5
          }
        ]
      },
      options: {
        responsive: true,
        scales: {
          x: {
            title: { display: true, text: 'Sessions' },
            ticks: {
              display: false
            }
          },
          y: { title: { display: true, text: 'Relative shift direction' }, ticks: { display: false }, grid: { color: 'rgba(0,0,0,0.08)' } }
        },
        plugins: {
          tooltip: {
            callbacks: {
              label(context) {
                const raw = context.raw || {};
                return `${raw.participant || 'session'}: ${qualitativeDelta(raw.y)}`;
              }
            }
          }
        }
      }
    });
  }

  function renderSessionsTable(summary) {
    const sessions = (summary && summary.sessions) || [];
    els.sessionsCount.textContent = 'Session list loaded';
    els.sessionsBody.innerHTML = sessions.map((row, i) => {
      const delta1 = Number(row.experiment_mean_power_ch1) - Number(row.control_mean_power_ch1);
      const delta2 = Number(row.experiment_mean_power_ch2) - Number(row.control_mean_power_ch2);
      return `
        <tr>
          <td>${alphaLabel('Participant', i)}</td>
          <td>${alphaLabel('Session', i)}</td>
          <td>${qualitativeDelta(delta1)}</td>
          <td>${qualitativeDelta(delta2)}</td>
        </tr>
      `;
    }).join('');
  }

  function renderAll() {
    try {
      const summary = state.summary || { sessions: [], group: {} };
      renderStats(summary);
      renderSessionSelect(summary);
      renderGroupPower(summary);
      renderPerievent(summary);
      renderSessionTrace(summary);
      renderSessionDeltas(summary);
      renderSessionsTable(summary);
      setStatus('');
    } catch (err) {
      console.error(err);
      setStatus('Could not render this report view. Please refresh and try sync again.', true);
    }
  }

  async function fetchData() {
    const res = await fetch('/api/research/finger-emg/data', { credentials: 'same-origin' });
    if (!res.ok) throw new Error('Failed to load finger-emg data');
    state.summary = await res.json();
    renderAll();
  }

  async function syncDrive() {
    setStatus('Syncing Google Drive and recomputing analysis...');
    els.syncDrive.disabled = true;
    const originalLabel = els.syncDrive.textContent;
    els.syncDrive.textContent = 'Syncing...';
    try {
      const res = await fetch('/api/research/finger-emg/sync-drive', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || 'Sync failed');
      }
      state.summary = payload.summary || (payload && payload.summary) || state.summary;
      renderAll();
      setStatus('Drive sync complete and analysis refreshed.');
    } catch (err) {
      console.error(err);
      setStatus(String(err.message || err), true);
    } finally {
      els.syncDrive.disabled = false;
      els.syncDrive.textContent = originalLabel;
    }
  }

  function attach() {
    if (els.syncDrive) {
      els.syncDrive.addEventListener('click', syncDrive);
    }
    if (els.sessionSelect) {
      els.sessionSelect.addEventListener('change', () => renderSessionTrace(state.summary));
    }
  }

  attach();
  const authReady = window.researchAuth && window.researchAuth.checkSession
    ? window.researchAuth.checkSession()
    : Promise.resolve(true);
  authReady.then((ok) => {
    if (!ok) return;
    fetchData().catch((err) => {
      console.error(err);
      els.stats.textContent = 'Error loading data';
      setStatus('Could not load Finger EMG data.', true);
    });
  });
})();
