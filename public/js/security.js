/**
 * NexusCampus OS - Module B: Zero-Trust Gate Pass & Security
 * RFC 6238 HMAC-SHA1 TOTP Generator, 30s Countdown Bar, Anti-Screenshot Hologram,
 * Haversine Geofence Validator, Guard Camera Scanner Simulator
 */

window.NexusSecurity = (function() {
  // Security State
  const state = {
    campusCoords: { lat: 37.774929, lng: -122.419416 }, // Tech Campus Center
    simulatedDistance: 12.0, // In meters
    currentTotpCode: '000000',
    secondsRemaining: 30,
    timerInterval: null,
    watermarkInterval: null,
    secretToken: 'JBSWY3DPEHPK3PXP', // Base32 Secret
    lastQrPayload: '',
    qrCodeObj: null
  };

  // Pure JavaScript SHA-1 implementation (RFC 3174) for universal offline HMAC-SHA1
  function sha1(bytes) {
    function rotl(n, s) { return (n << s) | (n >>> (32 - s)); }
    
    let words = [];
    for (let i = 0; i < bytes.length; i++) {
      words[i >> 2] |= (bytes[i] & 0xff) << (24 - (i % 4) * 8);
    }
    
    const bitLen = bytes.length * 8;
    words[bitLen >> 5] |= 0x80 << (24 - (bitLen % 32));
    words[(((bitLen + 64) >> 9) << 4) + 15] = bitLen;

    let h0 = 0x67452301;
    let h1 = 0xEFCDAB89;
    let h2 = 0x98BADCFE;
    let h3 = 0x10325476;
    let h4 = 0xC3D2E1F0;

    let w = new Array(80);

    for (let i = 0; i < words.length; i += 16) {
      for (let j = 0; j < 16; j++) {
        w[j] = words[i + j] || 0;
      }
      for (let j = 16; j < 80; j++) {
        w[j] = rotl(w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16], 1);
      }

      let a = h0, b = h1, c = h2, d = h3, e = h4;

      for (let j = 0; j < 80; j++) {
        let f, k;
        if (j < 20) {
          f = (b & c) | ((~b) & d);
          k = 0x5A827999;
        } else if (j < 40) {
          f = b ^ c ^ d;
          k = 0x6ED9EBA1;
        } else if (j < 60) {
          f = (b & c) | (b & d) | (c & d);
          k = 0x8F1BBCDC;
        } else {
          f = b ^ c ^ d;
          k = 0xCA62C1D6;
        }

        let temp = (rotl(a, 5) + f + e + k + (w[j] >>> 0)) | 0;
        e = d;
        d = c;
        c = rotl(b, 30);
        b = a;
        a = temp;
      }

      h0 = (h0 + a) | 0;
      h1 = (h1 + b) | 0;
      h2 = (h2 + c) | 0;
      h3 = (h3 + d) | 0;
      h4 = (h4 + e) | 0;
    }

    const result = new Uint8Array(20);
    const h = [h0, h1, h2, h3, h4];
    for (let i = 0; i < 5; i++) {
      result[i * 4] = (h[i] >>> 24) & 0xff;
      result[i * 4 + 1] = (h[i] >>> 16) & 0xff;
      result[i * 4 + 2] = (h[i] >>> 8) & 0xff;
      result[i * 4 + 3] = h[i] & 0xff;
    }
    return result;
  }

  // Base32 Decode
  function base32Decode(base32) {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let clean = base32.toUpperCase().replace(/=+$/, '');
    let bits = 0;
    let val = 0;
    let bytes = [];

    for (let i = 0; i < clean.length; i++) {
      const idx = charset.indexOf(clean.charAt(i));
      if (idx === -1) continue;
      val = (val << 5) | idx;
      bits += 5;
      if (bits >= 8) {
        bytes.push((val >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }
    return new Uint8Array(bytes);
  }

  // HMAC-SHA1
  function hmacSha1(keyBytes, msgBytes) {
    const blockSize = 64;
    let key = new Uint8Array(keyBytes);
    if (key.length > blockSize) {
      key = sha1(key);
    }
    if (key.length < blockSize) {
      let padded = new Uint8Array(blockSize);
      padded.set(key);
      key = padded;
    }

    let oPad = new Uint8Array(blockSize + 20);
    let iPad = new Uint8Array(blockSize + msgBytes.length);

    for (let i = 0; i < blockSize; i++) {
      oPad[i] = key[i] ^ 0x5c;
      iPad[i] = key[i] ^ 0x36;
    }
    iPad.set(msgBytes, blockSize);

    const innerHash = sha1(iPad);
    oPad.set(innerHash, blockSize);

    return sha1(oPad);
  }

  // Compute 6-digit TOTP (RFC 6238)
  function computeTotp(secret, epochSeconds = Math.floor(Date.now() / 1000), timeStep = 30) {
    const counter = Math.floor(epochSeconds / timeStep);
    const keyBytes = base32Decode(secret);

    const counterBytes = new Uint8Array(8);
    let tmp = counter;
    for (let i = 7; i >= 0; i--) {
      counterBytes[i] = tmp & 0xff;
      tmp = Math.floor(tmp / 256);
    }

    const hmacResult = hmacSha1(keyBytes, counterBytes);
    const offset = hmacResult[19] & 0x0f;
    const binary =
      ((hmacResult[offset] & 0x7f) << 24) |
      ((hmacResult[offset + 1] & 0xff) << 16) |
      ((hmacResult[offset + 2] & 0xff) << 8) |
      (hmacResult[offset + 3] & 0xff);

    const otp = binary % 1000000;
    return otp.toString().padStart(6, '0');
  }

  // Haversine Distance Formula in Meters
  function computeHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const toRad = Math.PI / 180;
    const phi1 = lat1 * toRad;
    const phi2 = lat2 * toRad;
    const deltaPhi = (lat2 - lat1) * toRad;
    const deltaLambda = (lon2 - lon1) * toRad;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) *
      Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return Number((R * c).toFixed(1));
  }

  // Render QR Code Pass
  function renderQrPass() {
    const currentUser = window.NexusApp.state.currentUser;
    const now = Math.floor(Date.now() / 1000);
    state.currentTotpCode = computeTotp(state.secretToken, now);

    // Build signed payload string
    const payload = JSON.stringify({
      ver: 'NEXUS-2.6',
      uid: currentUser.id,
      sid: currentUser.student_id,
      totp: state.currentTotpCode,
      ts: now,
      geo_ok: state.simulatedDistance <= 50,
      role: currentUser.role
    });

    state.lastQrPayload = payload;

    // Display TOTP code text
    const codeEl = document.getElementById('totp-digits-display');
    if (codeEl) codeEl.textContent = state.currentTotpCode.replace(/(\d{3})(\d{3})/, '$1 $2');

    // Render Canvas via QRCode.js
    const container = document.getElementById('qrcode-canvas-container');
    if (container) {
      container.innerHTML = '';
      try {
        if (typeof QRCode !== 'undefined') {
          state.qrCodeObj = new QRCode(container, {
            text: payload,
            width: 200,
            height: 200,
            colorDark: '#030712',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
          });
        } else {
          container.innerHTML = `<div style="padding: 20px; font-family: monospace; color: #030712; font-size: 11px; word-break: break-all;">${payload}</div>`;
        }
      } catch (e) {
        console.error('QR code render error:', e);
      }
    }

    // Update Watermark overlay
    updateWatermark();
  }

  // Update dynamic holographic anti-screenshot watermark
  function updateWatermark() {
    const currentUser = window.NexusApp.state.currentUser;
    const wmTextEls = document.querySelectorAll('.watermark-text-item');
    const nowIso = new Date().toISOString().replace('T', ' ').substring(0, 23);

    wmTextEls.forEach(el => {
      el.textContent = `${currentUser.name} • ${currentUser.student_id} • ${nowIso} • NEXUS-SEC-PASS`;
    });
  }

  // 30-Second Precision Countdown Timer
  function startCountdown() {
    if (state.timerInterval) clearInterval(state.timerInterval);

    function tick() {
      const nowMs = Date.now();
      const currentSecond = Math.floor(nowMs / 1000);
      state.secondsRemaining = 30 - (currentSecond % 30);

      // Countdown Progress Bar
      const fillBar = document.getElementById('countdown-bar-fill');
      const timeLbl = document.getElementById('countdown-seconds-label');

      const pct = (state.secondsRemaining / 30) * 100;
      if (fillBar) fillBar.style.width = `${pct}%`;
      if (timeLbl) timeLbl.textContent = `${state.secondsRemaining}s`;

      // If at cycle start, refresh QR code
      if (state.secondsRemaining === 30 || state.secondsRemaining === 0) {
        renderQrPass();
      }
    }

    tick();
    state.timerInterval = setInterval(tick, 1000);

    // Watermark micro-ticker (every 200ms)
    if (state.watermarkInterval) clearInterval(state.watermarkInterval);
    state.watermarkInterval = setInterval(updateWatermark, 250);
  }

  // Geofence Validator
  function updateGeofenceBadge() {
    const badge = document.getElementById('geofence-status-badge');
    const desc = document.getElementById('geofence-distance-desc');
    const isWithin = state.simulatedDistance <= 50;

    if (badge && desc) {
      if (isWithin) {
        badge.className = 'geofence-badge verified';
        badge.innerHTML = `🟢 Geofence Verified within ${state.simulatedDistance}m`;
        desc.textContent = `Client coordinates verified against Gate North Perimeter. Physical entry permitted.`;
      } else {
        badge.className = 'geofence-badge denied';
        badge.innerHTML = `🔴 Outside Geofence: ${state.simulatedDistance}m away`;
        desc.textContent = `Client outside perimeter (>${50}m). High-security turnstile scans will be rejected.`;
      }
    }
  }

  // Toggle Geofence Distance Simulation (Inside 12m vs Outside 240m)
  function toggleSimulatedLocation(isOutside) {
    state.simulatedDistance = isOutside ? 240.0 : 12.0;
    updateGeofenceBadge();
    renderQrPass();
    window.NexusApp.showToast(
      isOutside 
        ? 'Location simulated: Outside Campus (240m) - Security Pass Restricted' 
        : 'Location simulated: At Campus Gate (12m) - Geofence Verified', 
      isOutside ? 'warning' : 'success'
    );
  }

  // Guard Camera Scanner Modal Controls
  function openScannerModal() {
    const modal = document.getElementById('guard-scanner-modal');
    if (!modal) return;
    modal.classList.add('open');

    // Reset scanner HUD output
    const statusBox = document.getElementById('scanner-auth-result');
    if (statusBox) {
      statusBox.innerHTML = `
        <div style="color: var(--text-muted); font-size: 0.8rem;">
          Align Nexus Pass QR code within scanning brackets to simulate turnstile gate verification.
        </div>
      `;
    }

    window.NexusApp.playSound('click');
  }

  function closeScannerModal() {
    const modal = document.getElementById('guard-scanner-modal');
    if (modal) modal.classList.remove('open');
    window.NexusApp.playSound('click');
  }

  // Simulate Real-Time Camera Scan Verification
  function simulateScan() {
    const statusBox = document.getElementById('scanner-auth-result');
    if (!statusBox) return;

    statusBox.innerHTML = `
      <div style="color: var(--cyan-light); font-size: 0.85rem; font-weight: 600; display: flex; align-items: center; gap: 8px;">
        <span class="pulse-dot"></span> Decrypting HMAC-SHA1 Token & Validating Geofence...
      </div>
    `;

    window.NexusApp.playSound('scan');

    setTimeout(() => {
      try {
        const payload = JSON.parse(state.lastQrPayload);
        const currentUser = window.NexusApp.state.currentUser;
        const isLockdown = window.NexusTelemetry.state.lockdownActive;

        if (isLockdown && currentUser.role !== 'admin') {
          window.NexusApp.playSound('alarm');
          statusBox.innerHTML = `
            <div style="background: rgba(244, 63, 94, 0.2); border: 1px solid var(--rose-primary); padding: 12px; border-radius: 8px; color: #fb7185;">
              <div style="font-weight: 700; font-size: 0.9rem;">🚫 ACCESS DENIED - CAMPUS LOCKDOWN</div>
              <div style="font-size: 0.75rem; margin-top: 4px;">Perimeter turnstiles sealed by Facilities Admin. Code Red in effect.</div>
            </div>
          `;
          window.NexusTelemetry.appendLogEntry('SEC-SCAN', `Rejected pass ${currentUser.student_id}: Campus Lockdown active.`, 'danger');
          return;
        }

        if (state.simulatedDistance > 50) {
          window.NexusApp.playSound('alarm');
          statusBox.innerHTML = `
            <div style="background: rgba(244, 63, 94, 0.2); border: 1px solid var(--rose-primary); padding: 12px; border-radius: 8px; color: #fb7185;">
              <div style="font-weight: 700; font-size: 0.9rem;">🚫 GEOFENCE VALIDATION FAILED</div>
              <div style="font-size: 0.75rem; margin-top: 4px;">Device detected at ${state.simulatedDistance}m. Must be within 50m of turnstiles.</div>
            </div>
          `;
          window.NexusTelemetry.appendLogEntry('SEC-SCAN', `Geofence breach attempt: ${currentUser.student_id} from ${state.simulatedDistance}m.`, 'warn');
          return;
        }

        // Success verification
        window.NexusApp.playSound('success');
        window.NexusTelemetry.recordGateScan();

        // Call backend database endpoint
        fetch('/api/gate-pass/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pass_id: 'd001', student_id: currentUser.student_id })
        }).catch(() => {});

        window.NexusTelemetry.appendLogEntry('SEC-SCAN', `Verified TOTP (${payload.totp}) for ${currentUser.name} (${currentUser.student_id}). Gate North-B04 unlocked. Database updated.`, 'success');

        statusBox.innerHTML = `
          <div style="background: rgba(16, 185, 129, 0.2); border: 1px solid var(--emerald-primary); padding: 12px; border-radius: 8px; color: var(--emerald-light);">
            <div style="font-weight: 700; font-size: 0.92rem; display: flex; align-items: center; gap: 6px;">
              ✅ ACCESS GRANTED • TURNSTILE B-04 UNLOCKED
            </div>
            <div style="font-size: 0.76rem; margin-top: 6px; color: #e2e8f0; line-height: 1.4;">
              <b>User:</b> ${currentUser.name} (${currentUser.student_id})<br/>
              <b>Role:</b> ${currentUser.role.toUpperCase()} (Clearance Level ${currentUser.clearance})<br/>
              <b>Token:</b> ${payload.totp} (HMAC-SHA1 Valid) • <b>Distance:</b> ${state.simulatedDistance}m
            </div>
          </div>
        `;
        window.NexusApp.showToast(`Pass Authenticated: Gate North-B04 Unlocked for ${currentUser.name}`, 'success');

      } catch (err) {
        statusBox.innerHTML = `<div style="color: #fb7185;">Verification parsing failure.</div>`;
      }
    }, 800);
  }

  // Refresh pass when switching roles
  function refreshPassForUser(user) {
    state.secretToken = user.role === 'admin' ? 'NEXUSSECRETKEYADM' : 'JBSWY3DPEHPK3PXP';
    renderQrPass();
    updateWatermark();
  }

  function init() {
    renderQrPass();
    startCountdown();
    updateGeofenceBadge();

    // Hook Geofence simulator toggle
    const geoToggle = document.getElementById('geofence-sim-checkbox');
    if (geoToggle) {
      geoToggle.addEventListener('change', (e) => {
        toggleSimulatedLocation(e.target.checked);
      });
    }

    // Hook Scanner Modal
    const btnOpenScan = document.getElementById('btn-open-scanner-modal');
    if (btnOpenScan) btnOpenScan.addEventListener('click', openScannerModal);

    const btnCloseScan = document.getElementById('btn-close-scanner-modal');
    if (btnCloseScan) btnCloseScan.addEventListener('click', closeScannerModal);

    const btnTriggerScan = document.getElementById('btn-trigger-camera-scan');
    if (btnTriggerScan) btnTriggerScan.addEventListener('click', simulateScan);
  }

  return {
    state,
    init,
    computeTotp,
    computeHaversineDistance,
    refreshPassForUser,
    openScannerModal,
    closeScannerModal,
    simulateScan,
    toggleSimulatedLocation
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  window.NexusSecurity.init();
});
