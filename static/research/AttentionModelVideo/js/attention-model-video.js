(function () {
  const state = {
    summary: null,
    charts: {}
  };

  const els = {
    stats: document.getElementById('stats'),
    metricN: document.getElementById('metricN'),
    metricP1: document.getElementById('metricP1'),
    metricP2: document.getElementById('metricP2'),
    metricOverall: document.getElementById('metricOverall'),
    participantSelect: document.getElementById('participantSelect'),
    sessionsCount: document.getElementById('sessionsCount'),
    sessionsBody: document.getElementById('sessionsBody'),

    // Scientific Statistical elements
    statsP1Chance: document.getElementById('statsP1Chance'),
    statsP2Chance: document.getElementById('statsP2Chance'),
    statsP1P2Diff: document.getElementById('statsP1P2Diff'),
    statsConfidenceCorr: document.getElementById('statsConfidenceCorr'),
    statsMeanConfidence: document.getElementById('statsMeanConfidence')
  };

  function destroyChart(name) {
    if (state.charts[name]) {
      state.charts[name].destroy();
      state.charts[name] = null;
    }
  }

  function upsertChart(name, canvas, config) {
    if (!canvas || typeof Chart === 'undefined') return;
    destroyChart(name);
    
    // Inject global font family configuration for Chart.js
    if (Chart.defaults) {
      Chart.defaults.font.family = '"Roboto", sans-serif';
    }
    
    state.charts[name] = new Chart(canvas, config);
  }

  function fmtPct(val) {
    if (val == null) return '--';
    return (Number(val) * 100).toFixed(1) + '%';
  }

  function fmtVal(val, decimals = 2) {
    if (val == null) return '--';
    return Number(val).toFixed(decimals);
  }

  function fmtPValue(p) {
    if (p == null) return '';
    if (p < 0.001) return 'p < 0.001';
    return 'p = ' + p.toFixed(3);
  }

  function fmtTestResult(stats, type = 'z') {
    if (!stats || (type === 'z' && stats.z == null) || (type === 'r' && stats.r == null)) {
      return '<span class="byb-text-grey">Insufficient data</span>';
    }
    
    const sigClass = stats.significant ? 'byb-text-green' : 'byb-text-grey';
    const sigText = stats.significant ? 'Significant' : 'Not Significant';
    
    if (type === 'z') {
      return `Z = ${stats.z.toFixed(2)}, ${fmtPValue(stats.p_value)} <span class="badge ${sigClass}">(${sigText})</span>`;
    } else {
      return `r = ${stats.r.toFixed(2)}, ${fmtPValue(stats.p_value)} <span class="badge ${sigClass}">(${sigText})</span>`;
    }
  }

  function renderMetrics(summary) {
    const group = summary.group || {};
    els.metricN.textContent = group.n_sessions || 0;
    els.metricP1.textContent = fmtPct(group.mean_accuracy_p1);
    els.metricP2.textContent = fmtPct(group.mean_accuracy_p2);
    els.metricOverall.textContent = fmtPct(group.mean_accuracy_overall);
    
    if (group.n_sessions > 0) {
      els.stats.textContent = `Analysis dashboard loaded successfully with ${group.n_sessions} participant records.`;
    } else {
      els.stats.textContent = 'No participant data records found.';
    }
  }

  function renderStats(summary) {
    const group = summary.group || {};
    const stats = group.stats || {};
    
    els.statsP1Chance.innerHTML = fmtTestResult(stats.phase1_chance_test, 'z');
    els.statsP2Chance.innerHTML = fmtTestResult(stats.phase2_chance_test, 'z');
    els.statsP1P2Diff.innerHTML = fmtTestResult(stats.phase1_vs_phase2_test, 'z');
    els.statsConfidenceCorr.innerHTML = fmtTestResult(stats.confidence_accuracy_correlation, 'r');
    
    if (stats.mean_confidence_correct != null && stats.mean_confidence_incorrect != null) {
      els.statsMeanConfidence.innerHTML = `Correct Choice: <strong class="byb-text-green">${stats.mean_confidence_correct.toFixed(2)}</strong> vs. Incorrect Choice: <strong class="byb-text-orange">${stats.mean_confidence_incorrect.toFixed(2)}</strong>`;
    } else {
      els.statsMeanConfidence.innerHTML = '<span class="byb-text-grey">Insufficient data</span>';
    }
  }

  function renderSessionsTable(summary) {
    const sessions = summary.sessions || [];
    els.sessionsCount.textContent = `${sessions.length} sessions`;
    els.sessionsBody.innerHTML = sessions.map((s) => {
      return `
        <tr>
          <td><strong>${s.participant_name}</strong></td>
          <td class="num">${s.participant_age || 'N/A'}</td>
          <td class="num">${fmtPct(s.phase1_accuracy)}</td>
          <td class="num">${fmtPct(s.phase2_accuracy)}</td>
          <td class="num">${fmtPct(s.overall_accuracy)}</td>
          <td class="num">${fmtVal(s.phase1_mean_confidence || s.overall_mean_confidence, 2)}</td>
          <td><span class="status-badge status-badge--success">✓ v2.0</span></td>
        </tr>
      `;
    }).join('');
  }

  function populateSelect(summary) {
    const sessions = summary.sessions || [];
    const current = els.participantSelect.value;
    els.participantSelect.innerHTML = '';
    sessions.forEach((s) => {
      const option = document.createElement('option');
      option.value = s.uuid;
      option.textContent = `${s.participant_name} (${s.participant_age || '?'} yrs)`;
      els.participantSelect.appendChild(option);
    });
    if (sessions.some(s => s.uuid === current)) {
      els.participantSelect.value = current;
    }
  }

  function renderGroupAccuracy(summary) {
    const group = summary.group || {};
    const canvas = document.getElementById('accuracyComparisonChart');
    
    // Chance line plugin
    const chanceLinePlugin = {
      id: 'chanceLine',
      afterDraw(chart) {
        const { ctx, chartArea: { left, right }, scales: { y } } = chart;
        ctx.save();
        ctx.strokeStyle = '#d01ba4'; // Purple brand color for chance level line
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        const yVal = y.getPixelForValue(0.5);
        ctx.beginPath();
        ctx.moveTo(left, yVal);
        ctx.lineTo(right, yVal);
        ctx.stroke();
        
        ctx.fillStyle = '#d01ba4';
        ctx.font = '700 11px "Roboto", sans-serif';
        ctx.fillText('Chance Level (50%)', left + 8, yVal - 6);
        ctx.restore();
      }
    };

    upsertChart('accuracyComparison', canvas, {
      type: 'bar',
      data: {
        labels: ['Phase 1: Correct vs Scrambled', 'Phase 2: Correct vs Mismatched'],
        datasets: [{
          label: 'Group Mean Accuracy',
          data: [group.mean_accuracy_p1 || 0, group.mean_accuracy_p2 || 0],
          backgroundColor: ['#fd8164', '#1996fc'], // Orange, Blue
          borderColor: ['#fd8164', '#1996fc'],
          borderWidth: 1,
          barThickness: 60
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            min: 0,
            max: 1.0,
            ticks: {
              callback: (val) => (val * 100) + '%',
              color: '#707070',
              font: { weight: '500' }
            },
            grid: { color: '#e9e9e9' }
          },
          x: {
            ticks: {
              color: '#707070',
              font: { weight: '700' }
            },
            grid: { display: false }
          }
        }
      },
      plugins: [chanceLinePlugin]
    });
  }

  function renderConfidenceAccuracy(summary) {
    const group = summary.group || {};
    const rel = group.confidence_accuracy_relation || {};
    const canvas = document.getElementById('confidenceAccuracyChart');

    const labels = ['1 (Low)', '2', '3', '4 (High)'];
    const data = [1, 2, 3, 4].map(c => rel[c] ? rel[c].accuracy : null);

    upsertChart('confidenceAccuracy', canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Accuracy',
          data,
          borderColor: '#18a953', // Green accent
          backgroundColor: 'rgba(24, 169, 83, 0.08)',
          fill: true,
          tension: 0.15,
          pointRadius: 6,
          pointHoverRadius: 8,
          pointBackgroundColor: '#18a953',
          borderWidth: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            min: 0,
            max: 1.0,
            ticks: {
              callback: (val) => (val * 100) + '%',
              color: '#707070',
              font: { weight: '500' }
            },
            grid: { color: '#e9e9e9' }
          },
          x: {
            title: { display: true, text: 'Confidence Rating', color: '#707070', font: { weight: '700' } },
            ticks: { color: '#707070' },
            grid: { display: false }
          }
        }
      }
    });
  }

  function renderStimulusDifficulty(summary, phase, canvasId, chartName, barColor) {
    const group = summary.group || {};
    const pairData = phase === 1 ? group.accuracy_by_pair_p1 : group.accuracy_by_pair_p2;
    if (!pairData) return;

    // Filter and sort by accuracy descending
    const sortedPairs = [...pairData]
      .filter(p => p.total > 0)
      .sort((a, b) => (b.accuracy || 0) - (a.accuracy || 0));

    const labels = sortedPairs.map(p => `Pair ${p.pair_index}`);
    const data = sortedPairs.map(p => p.accuracy);

    const canvas = document.getElementById(canvasId);
    upsertChart(chartName, canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Accuracy',
          data,
          backgroundColor: barColor,
          borderWidth: 0,
          categoryPercentage: 0.8,
          barPercentage: 0.9
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            min: 0,
            max: 1.0,
            ticks: {
              callback: (val) => (val * 100) + '%',
              color: '#707070',
              font: { size: 9 }
            },
            grid: { color: '#e9e9e9' }
          },
          x: {
            ticks: {
              color: '#707070',
              font: { size: 8 },
              autoSkip: false,
              maxRotation: 90,
              minRotation: 90
            },
            grid: { display: false }
          }
        }
      }
    });
  }

  function renderLearningCurve(summary) {
    const group = summary.group || {};
    const curve = group.learning_curve || [];
    const canvas = document.getElementById('learningCurveChart');

    const labels = [
      'Block 1', 'Block 2', 'Block 3', 'Block 4',
      'Block 5', 'Block 6', 'Block 7', 'Block 8'
    ];
    const data = [1, 2, 3, 4, 5, 6, 7, 8].map(b => {
      const entry = curve.find(e => e.block === b);
      return entry ? entry.accuracy : null;
    });

    const phaseSeparatorPlugin = {
      id: 'phaseSeparator',
      afterDraw(chart) {
        const { ctx, chartArea: { top, bottom }, scales: { x } } = chart;
        const xVal = (x.getPixelForTick(3) + x.getPixelForTick(4)) / 2; // Separator between block 4 and 5
        ctx.save();
        ctx.strokeStyle = '#707070';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(xVal, top);
        ctx.lineTo(xVal, bottom);
        ctx.stroke();

        ctx.fillStyle = '#707070';
        ctx.font = '700 9px "Roboto", sans-serif';
        ctx.fillText('PHASE 1 (SCRAMBLED)', xVal - 115, top + 15);
        ctx.fillText('PHASE 2 (MISMATCHED)', xVal + 15, top + 15);
        ctx.restore();
      }
    };

    upsertChart('learningCurve', canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Block Accuracy',
          data,
          borderColor: '#d01ba4', // Purple line
          backgroundColor: 'transparent',
          tension: 0.15,
          pointRadius: 5,
          pointBackgroundColor: '#d01ba4',
          borderWidth: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            min: 0,
            max: 1.0,
            ticks: {
              callback: (val) => (val * 100) + '%',
              color: '#707070'
            },
            grid: { color: '#e9e9e9' }
          },
          x: {
            ticks: { color: '#707070' },
            grid: { display: false }
          }
        }
      },
      plugins: [phaseSeparatorPlugin]
    });
  }

  function renderIndividualTrial(summary) {
    const uuid = els.participantSelect.value;
    const session = (summary.sessions || []).find(s => s.uuid === uuid);
    const canvas = document.getElementById('individualTrialChart');
    if (!session || !session.trials) {
      destroyChart('individualTrial');
      return;
    }

    const trials = session.trials;

    // Separate trials by Phase 1 and Phase 2.
    const p1Trials = trials.filter(t => t.phase === 1).sort((a,b) => a.trial_number - b.trial_number);
    const p2Trials = trials.filter(t => t.phase === 2).sort((a,b) => a.trial_number - b.trial_number);

    const points = [];
    const colors = [];

    p1Trials.forEach((t, i) => {
      points.push({ x: i + 1, y: t.confidence_rating });
      colors.push(t.is_correct ? '#18a953' : '#fd8164'); // Green / Orange
    });

    p2Trials.forEach((t, i) => {
      points.push({ x: i + 65, y: t.confidence_rating });
      colors.push(t.is_correct ? '#18a953' : '#fd8164'); // Green / Orange
    });

    const individualSeparatorPlugin = {
      id: 'individualSeparator',
      afterDraw(chart) {
        const { ctx, chartArea: { top, bottom }, scales: { x } } = chart;
        const xVal = x.getPixelForValue(64.5); // Separator between trial 64 and 65
        ctx.save();
        ctx.strokeStyle = '#707070';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(xVal, top);
        ctx.lineTo(xVal, bottom);
        ctx.stroke();

        ctx.fillStyle = '#707070';
        ctx.font = '700 9px "Roboto", sans-serif';
        ctx.fillText('PHASE 1', xVal - 50, top + 15);
        ctx.fillText('PHASE 2', xVal + 10, top + 15);
        ctx.restore();
      }
    };

    upsertChart('individualTrial', canvas, {
      type: 'scatter',
      data: {
        datasets: [{
          label: 'Trial Confidence & Choice',
          data: points,
          pointBackgroundColor: colors,
          pointBorderColor: 'transparent',
          pointRadius: 6,
          pointHoverRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label(context) {
                const tIdx = context.dataIndex;
                const trial = trials[tIdx];
                if (!trial) return '';
                const resultStr = trial.is_correct ? 'Correct' : 'Incorrect';
                return `Trial ${tIdx + 1} (${resultStr}) - Confidence: ${trial.confidence_rating}`;
              }
            }
          }
        },
        scales: {
          y: {
            min: 0.5,
            max: 4.5,
            ticks: {
              stepSize: 1,
              callback: (val) => [1,2,3,4].includes(val) ? val : '',
              color: '#707070'
            },
            title: { display: true, text: 'Confidence Rating', color: '#707070', font: { weight: '700' } },
            grid: { color: '#e9e9e9' }
          },
          x: {
            min: 0,
            max: 129,
            ticks: {
              stepSize: 16,
              color: '#707070'
            },
            title: { display: true, text: 'Trial Number', color: '#707070', font: { weight: '700' } },
            grid: { display: false }
          }
        }
      },
      plugins: [individualSeparatorPlugin]
    });
  }

  function renderAll() {
    const summary = state.summary;
    if (!summary) return;

    renderMetrics(summary);
    renderStats(summary);
    renderSessionsTable(summary);
    populateSelect(summary);

    // Render group level charts
    renderGroupAccuracy(summary);
    renderConfidenceAccuracy(summary);
    renderStimulusDifficulty(summary, 1, 'stimulusPhase1Chart', 'stimulusPhase1', '#fd8164');
    renderStimulusDifficulty(summary, 2, 'stimulusPhase2Chart', 'stimulusPhase2', '#1996fc');
    renderLearningCurve(summary);

    // Render selected participant's chart
    renderIndividualTrial(summary);
  }

  async function fetchData() {
    try {
      const res = await fetch('/api/research/attention-model-video/data', { credentials: 'same-origin' });
      if (!res.ok) {
        throw new Error('Failed to load attention model video data');
      }
      state.summary = await res.json();
      
      // Make app wrapper visible
      const appWrapper = document.getElementById('researchApp');
      const guestBanner = document.getElementById('guestBanner');
      if (appWrapper) appWrapper.style.display = 'block';
      if (guestBanner) guestBanner.style.display = 'none';

      renderAll();
    } catch (err) {
      console.error(err);
      els.stats.textContent = 'Error loading attention model video data.';
      els.stats.style.color = '#fd8164';
    }
  }

  function attach() {
    els.participantSelect.addEventListener('change', () => {
      renderIndividualTrial(state.summary);
    });
  }

  attach();

  // Verify authentication using global BYB auth
  const authReady = window.researchAuth && window.researchAuth.checkSession
    ? window.researchAuth.checkSession()
    : Promise.resolve(true);

  authReady.then((ok) => {
    if (!ok) return;
    fetchData();
  });
})();
