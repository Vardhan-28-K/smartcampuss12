/**
 * NexusCampus OS - Module D: AI Copilot ("Nexus AI Autonomous Assistant")
 * Natural Language Processing, Action Execution, Speech Synthesis (TTS), Telemetry Triage
 */

window.NexusCopilot = (function() {
  const state = {
    speechSynthAvailable: ('speechSynthesis' in window),
    ttsEnabled: false,
    messageHistory: [
      {
        role: 'assistant',
        text: 'Greetings. I am **Nexus Autonomous Copilot (v2.6)**. I monitor campus IoT telemetry, execute automated energy protocols, audit perimeter security passes, and assist in facility routing. How may I assist your operations today?'
      }
    ]
  };

  // Speak text via Web Speech API
  function speak(text) {
    if (!state.ttsEnabled || !state.speechSynthAvailable) return;
    try {
      window.speechSynthesis.cancel();
      // Strip markdown symbols for audio
      const cleanText = text.replace(/[*_#`\[\]]/g, '');
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 1.05;
      utterance.pitch = 0.95;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('TTS failed:', e);
    }
  }

  // Render chat messages
  function renderMessages() {
    const container = document.getElementById('copilot-messages-container');
    if (!container) return;

    container.innerHTML = '';
    state.messageHistory.forEach(msg => {
      const bubble = document.createElement('div');
      bubble.className = `chat-bubble ${msg.role}`;

      const avatarIcon = msg.role === 'assistant' ? '🤖' : '👤';
      
      // Simple markdown converter for bold and code
      let formattedText = msg.text
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
        .replace(/`(.*?)`/g, '<code style="background: rgba(6,182,212,0.15); color: #22d3ee; padding: 2px 6px; border-radius: 4px; font-family: monospace;">$1</code>')
        .replace(/\n/g, '<br/>');

      bubble.innerHTML = `
        <div class="chat-avatar">${avatarIcon}</div>
        <div class="chat-content-box">
          <div>${formattedText}</div>
          ${msg.actionHtml ? `<div style="margin-top: 10px;">${msg.actionHtml}</div>` : ''}
        </div>
      `;

      container.appendChild(bubble);
    });

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
  }

  // Process user intent & generate response / action
  function processQuery(prompt) {
    const p = prompt.toLowerCase();
    let reply = "";
    let actionHtml = null;

    // 1. Security Audit
    if (p.includes('security') || p.includes('audit') || p.includes('lockdown') || p.includes('threat')) {
      const isLockdown = window.NexusTelemetry.state.lockdownActive;
      const scans = window.NexusTelemetry.state.gateScans;
      reply = `🛡️ **Perimeter Security Audit Report**:\n- Turnstiles Status: **${isLockdown ? 'LOCKED DOWN (CODE RED)' : 'ACTIVE & NORMAL'}**\n- Scans Processed Today: **${scans.toLocaleString()}**\n- Cryptographic Protocol: **HMAC-SHA1 30s TOTP**\n- Geofence Compliance Rate: **99.8%** within Gate North 50m radius.\n- Incident Alerts: **0 Breaches Detected**.`;
      actionHtml = `
        <button onclick="NexusApp.navigateTo('gate-pass')" class="btn-secondary" style="font-size: 11px; padding: 6px 12px;">
          View Zero-Trust Gate Pass & Security ↗
        </button>
      `;
    }
    // 2. Quiet Study Space / CO2 Optimization
    else if (p.includes('study') || p.includes('co2') || p.includes('quiet') || p.includes('room')) {
      reply = `📚 **Recommended Space: Quiet Study Pod 104** (Cyber Commons & Library, Floor 1):\n- Current CO2: **380 ppm** (Optimal oxygenation)\n- Acoustic Noise: **22 dB** (Ultra-quiet)\n- Status: **Available** (Capacity 6 personas)\n- Ambient Temp: **22.0°C**`;
      actionHtml = `
        <button onclick="NexusApp.navigateTo('facilities')" class="btn-primary" style="font-size: 11px; padding: 6px 12px;">
          Reserve Study Pod 104 Now ↗
        </button>
      `;
    }
    // 3. Power Saver / Energy Optimization
    else if (p.includes('power') || p.includes('energy') || p.includes('kwh') || p.includes('saver')) {
      const currentPower = window.NexusTelemetry.state.powerKwh;
      const isSaver = window.NexusTelemetry.state.powerSaverActive;
      reply = `⚡ **Grid Telemetry Analysis**:\n- Total Campus Consumption: **${currentPower} kWh**\n- Substation Efficiency: **94.6%**\n- Power Saver Mode: **${isSaver ? 'ACTIVE (-28% load)' : 'STANDBY'}**.\nWould you like me to toggle Power Saver protocol?`;
      actionHtml = `
        <button onclick="NexusTelemetry.togglePowerSaver()" class="btn-primary" style="font-size: 11px; padding: 6px 12px;">
          Toggle Power Saver Mode ⚡
        </button>
      `;
    }
    // 4. Navigation / Routing
    else if (p.includes('navigat') || p.includes('route') || p.includes('path') || p.includes('robotics') || p.includes('map')) {
      reply = `🗺️ **A* Pathfinding Solution: Main Gate ➔ Robotics Lab B**:\n- Distance: **340 meters**\n- Estimated Walk Time: **4.2 minutes**\n- Step Count: **~446 steps**\n- Accessible Status: **Wheelchair Ramp & Elevator Verified**.\nRoute visualizer is active on the Geospatial Map.`;
      actionHtml = `
        <button onclick="NexusApp.navigateTo('campus-map'); NexusMap.calculateAndDrawRoute();" class="btn-primary" style="font-size: 11px; padding: 6px 12px;">
          Show Route on Campus Map ➔
        </button>
      `;
    }
    // 5. Attendance
    else if (p.includes('attendance') || p.includes('check-in') || p.includes('class')) {
      reply = `📝 **Smart Attendance Status**:\n- Student: **Alex Mercer (STU-88219)**\n- Overall Attendance: **94.2%**\n- Next Lecture: **ROB-420: Autonomous Robotics (Turing Complex Room 204)**\n- Geofence Verification: Ready for 1-click check-in.`;
      actionHtml = `
        <button onclick="NexusApp.navigateTo('attendance')" class="btn-secondary" style="font-size: 11px; padding: 6px 12px;">
          Open Attendance Check-In ↗
        </button>
      `;
    }
    // Default smart assistant response
    else {
      reply = `Synthesized query across campus microservices: **"${prompt}"**.\nTelemetry state is nominal across all 4 sectors. Energy consumption is **${window.NexusTelemetry.state.powerKwh} kWh**, CO2 is **${window.NexusTelemetry.state.co2Ppm} ppm**, and campus security is **Level 1 Operational**.`;
      actionHtml = `
        <div style="display: flex; gap: 8px;">
          <button onclick="NexusCopilot.triggerPreset('Run Campus Security Audit')" class="btn-secondary" style="font-size: 11px; padding: 5px 10px;">Security Audit</button>
          <button onclick="NexusCopilot.triggerPreset('Find quiet study space with CO2 < 400ppm')" class="btn-secondary" style="font-size: 11px; padding: 5px 10px;">Find Study Pod</button>
        </div>
      `;
    }

    // Add assistant reply to history
    state.messageHistory.push({
      role: 'assistant',
      text: reply,
      actionHtml
    });

    renderMessages();
    speak(reply);
    window.NexusApp.playSound('success');
  }

  // Handle user submit
  function handleUserSubmit() {
    const input = document.getElementById('copilot-input-box');
    if (!input) return;

    const query = input.value.trim();
    if (!query) return;

    // Add user message
    state.messageHistory.push({
      role: 'user',
      text: query
    });

    input.value = '';
    renderMessages();
    window.NexusApp.playSound('click');

    // Simulate cyber AI cognitive latency
    setTimeout(() => {
      processQuery(query);
    }, 450);
  }

  // Trigger quick preset prompt chip
  function triggerPreset(presetText) {
    const input = document.getElementById('copilot-input-box');
    if (input) input.value = presetText;
    handleUserSubmit();
  }

  function toggleTts() {
    state.ttsEnabled = !state.ttsEnabled;
    const btn = document.getElementById('btn-toggle-tts');
    if (btn) {
      btn.innerHTML = state.ttsEnabled ? '🔊 Audio Voice: ON' : '🔈 Audio Voice: OFF';
      btn.style.color = state.ttsEnabled ? '#22d3ee' : '#94a3b8';
    }
    window.NexusApp.showToast(state.ttsEnabled ? 'Copilot TTS Voice Synthesis Enabled' : 'Copilot Voice Muted', 'info');
  }

  function init() {
    renderMessages();

    const sendBtn = document.getElementById('btn-send-copilot');
    if (sendBtn) sendBtn.addEventListener('click', handleUserSubmit);

    const input = document.getElementById('copilot-input-box');
    if (input) {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleUserSubmit();
      });
    }

    const ttsBtn = document.getElementById('btn-toggle-tts');
    if (ttsBtn) ttsBtn.addEventListener('click', toggleTts);

    // Preset chips
    document.querySelectorAll('.prompt-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        triggerPreset(chip.dataset.prompt);
      });
    });
  }

  return {
    state,
    init,
    triggerPreset,
    toggleTts,
    handleUserSubmit
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  window.NexusCopilot.init();
});
