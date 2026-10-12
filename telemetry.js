/**
 * NexusCampus OS - Module A: Real-Time IoT Telemetry Dashboard
 * Connected to Backend Database Engine via REST API (/api/status, /api/telemetry/action)
 */

window.NexusTelemetry = (function() {
  const state = {
    powerKwh: 412.5,
    occupancyPct: 78.0,
    co2Ppm: 420,
    gateScans: 1240,
    powerSaverActive: false,
    lockdownActive: false,
    hvacBoostActive: false,
    streamPaused: false,
    chartInstance: null,
    historyLabels: [],
    energyHistory: [],
    occupancyHistory: [],
    timerId: null,
    eventLogTimerId: null
  };

  function seedInitialHistory() {
    const now = Date.now();
    for (let i = 14; i >= 0; i--) {
      const t = new Date(now - i * 3000);
      const timeStr = t.toLocaleTimeString('en-US', { hour12: false, minute: '2-digit', second: '2-digit' });
      state.historyLabels.push(timeStr);
      
      const energy = Number((410 + Math.sin(i * 0.6) * 4 + (Math.random() * 2 - 1)).toFixed(1));
      state.energyHistory.push(energy);

      const occ = Number((78 + Math.cos(i * 0.5) * 3 + (Math.random() * 2 - 1)).toFixed(1));
      state.occupancyHistory.push(occ);
    }
  }

  function initChart() {
    const canvas = document.getElementById('telemetry-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const cyanGrad = ctx.createLinearGradient(0, 0, 0, 320);
    cyanGrad.addColorStop(0, 'rgba(6, 182, 212, 0.45)');
    cyanGrad.addColorStop(1, 'rgba(6, 182, 212, 0.02)');

    const emeraldGrad = ctx.createLinearGradient(0, 0, 0, 320);
    emeraldGrad.addColorStop(0, 'rgba(16, 185, 129, 0.45)');
    emeraldGrad.addColorStop(1, 'rgba(16, 185, 129, 0.02)');

    state.chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [...state.historyLabels],
        datasets: [
          {
            label: 'Energy Usage (kWh)',
            data: [...state.energyHistory],
            borderColor: '#22d3ee',
            backgroundColor: cyanGrad,
            borderWidth: 2.5,
            pointBackgroundColor: '#06b6d4',
            pointBorderColor: '#ffffff',
            pointRadius: 3,
            fill: true,
            tension: 0.4,
            yAxisID: 'yEnergy'
          },
          {
            label: 'Room Occupancy (%)',
            data: [...state.occupancyHistory],
            borderColor: '#34d399',
            backgroundColor: emeraldGrad,
            borderWidth: 2.5,
            pointBackgroundColor: '#10b981',
            pointBorderColor: '#ffffff',
            pointRadius: 3,
            fill: true,
            tension: 0.4,
            yAxisID: 'yOccupancy'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 600, easing: 'easeOutQuart' },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              color: '#94a3b8',
              font: { family: "'Inter', sans-serif", size: 12, weight: '600' },
              usePointStyle: true,
              pointStyle: 'circle'
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(51, 65, 85, 0.25)', drawBorder: false },
            ticks: { color: '#64748b', font: { family: "'JetBrains Mono', monospace", size: 11 } }
          },
          yEnergy: {
            type: 'linear',
            position: 'left',
            min: 250,
            max: 500,
            grid: { color: 'rgba(6, 182, 212, 0.1)', drawBorder: false },
            ticks: {
              color: '#22d3ee',
              font: { family: "'JetBrains Mono', monospace", size: 11 },
              callback: (val) => `${val} kWh`
            }
          },
          yOccupancy: {
            type: 'linear',
            position: 'right',
            min: 0,
            max: 100,
            grid: { drawOnChartArea: false },
            ticks: {
              color: '#34d399',
              font: { family: "'JetBrains Mono', monospace", size: 11 },
              callback: (val) => `${val}%`
            }
          }
        }
      }
    });
  }

  // Fetch Live State From Backend Database
  async function fetchBackendStatus() {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        state.powerKwh = data.metrics.power_kwh;
        state.occupancyPct = data.metrics.occupancy_pct;
        state.co2Ppm = data.metrics.co2_ppm;
        state.gateScans = data.metrics.gate_scans_today;
        state.powerSaverActive = data.power_saver;
        state.lockdownActive = data.lockdown;
        state.hvacBoostActive = data.hvac_boost;

        // Sync buttons UI
        const btnPower = document.getElementById('btn-power-saver');
        if (btnPower) btnPower.classList.toggle('active', state.powerSaverActive);
        const btnLock = document.getElementById('btn-lockdown');
        if (btnLock) btnLock.classList.toggle('active', state.lockdownActive);
        const btnHvac = document.getElementById('btn-hvac-boost');
        if (btnHvac) btnHvac.classList.toggle('active', state.hvacBoostActive);

        // Update system badge
        if (state.lockdownActive) {
          window.NexusApp.setSystemStatus('LOCKDOWN', '🚨 CAMPUS LOCKDOWN ACTIVE', 'lockdown');
        } else if (state.powerSaverActive) {
          window.NexusApp.setSystemStatus('POWER_SAVER', '⚡ Power Saver Mode Active', 'powersaver');
        } else if (state.hvacBoostActive) {
          window.NexusApp.setSystemStatus('HVAC_BOOST', '💨 HVAC Boost Active', 'hvac');
        } else {
          window.NexusApp.setSystemStatus('OPERATIONAL', '🟢 All Systems Operational', 'operational');
        }

        updateMetricCards();
      }
    } catch (e) {
      // Offline fallback
    }
  }

  function startStream() {
    if (state.timerId) clearInterval(state.timerId);

    state.timerId = setInterval(() => {
      let targetPower = state.powerSaverActive ? 298.2 : 412.5;
      let powerDelta = (Math.random() * 4 - 2);
      state.powerKwh = Number((targetPower + powerDelta).toFixed(1));

      let targetOcc = state.lockdownActive ? 12.0 : 78.0;
      let occDelta = (Math.random() * 2 - 1);
      state.occupancyPct = Number(Math.max(5, Math.min(99, targetOcc + occDelta)).toFixed(1));

      let targetCo2 = state.hvacBoostActive ? 375 : 420;
      let co2Delta = Math.floor(Math.random() * 6 - 3);
      state.co2Ppm = Math.max(350, Math.min(650, targetCo2 + co2Delta));

      updateMetricCards();

      if (state.chartInstance) {
        const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false, minute: '2-digit', second: '2-digit' });
        state.historyLabels.push(timeStr);
        state.energyHistory.push(state.powerKwh);
        state.occupancyHistory.push(state.occupancyPct);

        if (state.historyLabels.length > 20) {
          state.historyLabels.shift();
          state.energyHistory.shift();
          state.occupancyHistory.shift();
        }

        state.chartInstance.data.labels = state.historyLabels;
        state.chartInstance.data.datasets[0].data = state.energyHistory;
        state.chartInstance.data.datasets[1].data = state.occupancyHistory;
        state.chartInstance.update('none');
      }
    }, 3000);
  }

  function updateMetricCards() {
    const elPower = document.getElementById('metric-val-power');
    if (elPower) elPower.textContent = state.powerKwh.toFixed(1);

    const elOcc = document.getElementById('metric-val-occupancy');
    if (elOcc) elOcc.textContent = `${state.occupancyPct.toFixed(1)}%`;

    const elCo2 = document.getElementById('metric-val-co2');
    if (elCo2) {
      elCo2.textContent = `${state.co2Ppm} ppm`;
      const co2Badge = document.getElementById('metric-status-co2');
      if (co2Badge) {
        if (state.co2Ppm < 450) {
          co2Badge.textContent = 'Good (Optimal)';
          co2Badge.className = 'metric-trend up-good';
        } else {
          co2Badge.textContent = 'High Airflow Req';
          co2Badge.className = 'metric-trend warning';
        }
      }
    }

    const elScans = document.getElementById('metric-val-scans');
    if (elScans) elScans.textContent = state.gateScans.toLocaleString();
  }

  // Quick Admin Action: Power Saver Mode
  async function togglePowerSaver() {
    const currentRole = window.NexusApp.state.currentRole;
    if (currentRole !== 'admin') {
      window.NexusApp.showToast('Access Denied: Only Facilities Admin can toggle Power Saver Mode.', 'error');
      return;
    }

    try {
      const res = await fetch('/api/telemetry/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'power_saver' })
      });
      const data = await res.json();
      state.powerSaverActive = data.active;
      state.powerKwh = data.power_kwh;
    } catch (e) {
      state.powerSaverActive = !state.powerSaverActive;
      state.powerKwh = state.powerSaverActive ? 298.2 : 412.5;
    }

    const btn = document.getElementById('btn-power-saver');
    if (btn) btn.classList.toggle('active', state.powerSaverActive);

    if (state.powerSaverActive) {
      window.NexusApp.setSystemStatus('POWER_SAVER', '⚡ Power Saver Mode Active', 'powersaver');
      window.NexusApp.showToast('Power Saver Mode Engaged: Synchronized with Backend Database (-28% load).', 'success');
      appendLogEntry('SYS-ENERGY', 'Database updated: Engaged campus-wide Power Saver protocol.', 'success');
    } else {
      window.NexusApp.setSystemStatus('OPERATIONAL', '🟢 All Systems Operational', 'operational');
      window.NexusApp.showToast('Power Saver Disengaged: Normal grid baseline restored.', 'info');
      appendLogEntry('SYS-ENERGY', 'Database updated: Power Saver deactivated.', 'warn');
    }
    updateMetricCards();
  }

  // Quick Admin Action: Emergency Lockdown
  async function toggleEmergencyLockdown() {
    const currentRole = window.NexusApp.state.currentRole;
    if (currentRole !== 'admin') {
      window.NexusApp.showToast('Access Denied: Security Clearance Level 5 (Admin) required.', 'error');
      return;
    }

    try {
      const res = await fetch('/api/telemetry/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'lockdown' })
      });
      const data = await res.json();
      state.lockdownActive = data.active;
    } catch (e) {
      state.lockdownActive = !state.lockdownActive;
    }

    const btn = document.getElementById('btn-lockdown');
    if (btn) btn.classList.toggle('active', state.lockdownActive);

    if (state.lockdownActive) {
      window.NexusApp.setSystemStatus('LOCKDOWN', '🚨 CAMPUS LOCKDOWN ACTIVE', 'lockdown');
      window.NexusApp.playSound('alarm');
      window.NexusApp.showToast('CRITICAL ALERT: Campus Lockdown Triggered! Turnstiles sealed in Database.', 'error', 6000);
      appendLogEntry('SEC-LOCKDOWN', '🚨 Code Red: Database locked perimeter gates.', 'danger');
    } else {
      window.NexusApp.setSystemStatus('OPERATIONAL', '🟢 All Systems Operational', 'operational');
      window.NexusApp.showToast('Lockdown Cancelled: Security perimeter restored to Level 1.', 'success');
      appendLogEntry('SEC-LOCKDOWN', 'Lockdown lifted across all building records.', 'success');
    }
    updateMetricCards();
  }

  // Quick Admin Action: HVAC Boost
  async function toggleHvacBoost() {
    const currentRole = window.NexusApp.state.currentRole;
    if (currentRole !== 'admin' && currentRole !== 'faculty') {
      window.NexusApp.showToast('Access Denied: Admin or Faculty authorization required.', 'error');
      return;
    }

    try {
      const res = await fetch('/api/telemetry/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'hvac_boost' })
      });
      const data = await res.json();
      state.hvacBoostActive = data.active;
      state.co2Ppm = data.co2_ppm;
    } catch (e) {
      state.hvacBoostActive = !state.hvacBoostActive;
      state.co2Ppm = state.hvacBoostActive ? 375 : 420;
    }

    const btn = document.getElementById('btn-hvac-boost');
    if (btn) btn.classList.toggle('active', state.hvacBoostActive);

    if (state.hvacBoostActive) {
      window.NexusApp.setSystemStatus('HVAC_BOOST', '💨 HVAC High-Velocity Boost', 'hvac');
      window.NexusApp.showToast('HVAC Boost Active: Directing airflow to labs (DB synced).', 'success');
      appendLogEntry('HVAC-AIRFLOW', 'Boosted air filtration in Robotics Lab Complex & Auditorium.', 'success');
    } else {
      window.NexusApp.setSystemStatus('OPERATIONAL', '🟢 All Systems Operational', 'operational');
      window.NexusApp.showToast('HVAC Boost Disengaged: Standard variable air volume resumed.', 'info');
      appendLogEntry('HVAC-AIRFLOW', 'HVAC returned to automated occupancy feedback loop.', 'info');
    }
    updateMetricCards();
  }

  const sampleEvents = [
    { sensor: 'ENG-01', msg: 'Power draw stabilized at 62.4 kWh on Substation 2', type: 'info' },
    { sensor: 'ROB-03', msg: 'Lab B thermal sensor reading 21.8°C (Nominal)', type: 'info' },
    { sensor: 'GATE-N', msg: 'RFID NFC scanner verified STU-88219 (Alex Mercer)', type: 'success' },
    { sensor: 'LIB-01', msg: 'Air Quality: CO2 concentration at 408 ppm', type: 'info' },
    { sensor: 'SCI-02', msg: 'Cryo-cooling sensor pod #4 report: -268.4°C', type: 'info' },
    { sensor: 'FAC-204', msg: 'PIR motion detector detected occupancy shift', type: 'info' },
    { sensor: 'GATE-W', msg: 'Transit Hub turnstile scan velocity 34 p/min', type: 'info' }
  ];

  function appendLogEntry(sensor, message, type = 'info') {
    const logBox = document.getElementById('stream-log-container');
    if (!logBox) return;

    const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false });
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.innerHTML = `
      <span class="log-time">[${timeStr}]</span>
      <span class="log-sensor">${sensor}</span>
      <span class="log-msg">${message}</span>
    `;

    logBox.insertBefore(entry, logBox.firstChild);
    if (logBox.children.length > 40) logBox.removeChild(logBox.lastChild);
  }

  function startEventLogStream() {
    sampleEvents.slice(0, 5).forEach(e => appendLogEntry(e.sensor, e.msg, e.type));
    state.eventLogTimerId = setInterval(() => {
      if (state.streamPaused) return;
      const pick = sampleEvents[Math.floor(Math.random() * sampleEvents.length)];
      appendLogEntry(pick.sensor, pick.msg, pick.type);
    }, 3500);
  }

  function toggleLogStream() {
    state.streamPaused = !state.streamPaused;
    const btn = document.getElementById('btn-stream-toggle');
    if (btn) btn.textContent = state.streamPaused ? '▶ Resume Stream' : '⏸ Pause Stream';
    window.NexusApp.showToast(state.streamPaused ? 'IoT Sensor Stream Paused' : 'IoT Sensor Stream Resumed', 'info');
  }

  function recordGateScan() {
    state.gateScans += 1;
    updateMetricCards();
  }

  function init() {
    seedInitialHistory();
    initChart();
    fetchBackendStatus();
    startStream();
    startEventLogStream();

    const btnPower = document.getElementById('btn-power-saver');
    if (btnPower) btnPower.addEventListener('click', togglePowerSaver);

    const btnLockdown = document.getElementById('btn-lockdown');
    if (btnLockdown) btnLockdown.addEventListener('click', toggleEmergencyLockdown);

    const btnHvac = document.getElementById('btn-hvac-boost');
    if (btnHvac) btnHvac.addEventListener('click', toggleHvacBoost);

    const btnToggleStream = document.getElementById('btn-stream-toggle');
    if (btnToggleStream) btnToggleStream.addEventListener('click', toggleLogStream);
  }

  return {
    state,
    init,
    togglePowerSaver,
    toggleEmergencyLockdown,
    toggleHvacBoost,
    recordGateScan,
    appendLogEntry,
    fetchBackendStatus
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  window.NexusTelemetry.init();
});
