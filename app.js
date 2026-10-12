/**
 * NexusCampus OS - Core Application Kernel
 * Handles: System State, Role Switching, Clocks, Web Audio FX, Toast Notifications, Router
 */

window.NexusApp = (function() {
  // Global State
  const state = {
    currentRole: 'student', // 'student' | 'faculty' | 'admin'
    currentUser: {
      id: 'a0000000-0000-0000-0000-000000000001',
      name: 'Alex Mercer',
      email: 'alex.mercer@nexus.edu',
      student_id: 'STU-88219',
      role: 'student',
      department: 'Robotics & Autonomous Systems',
      clearance: 2,
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'
    },
    usersByRole: {
      student: {
        id: 'a0000000-0000-0000-0000-000000000001',
        name: 'Alex Mercer',
        email: 'alex.mercer@nexus.edu',
        student_id: 'STU-88219',
        role: 'student',
        department: 'Robotics & Autonomous Systems',
        clearance: 2,
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'
      },
      faculty: {
        id: 'a0000000-0000-0000-0000-000000000002',
        name: 'Dr. Evelyn Reed',
        email: 'evelyn.reed@nexus.edu',
        student_id: 'FAC-4102',
        role: 'faculty',
        department: 'Cyber-Physical Security',
        clearance: 4,
        avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150'
      },
      admin: {
        id: 'a0000000-0000-0000-0000-000000000003',
        name: 'Marcus Vance',
        email: 'marcus.vance@nexus.edu',
        student_id: 'ADM-001',
        role: 'admin',
        department: 'Campus Infrastructure Ops',
        clearance: 5,
        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150'
      }
    },
    systemStatus: 'OPERATIONAL', // 'OPERATIONAL' | 'LOCKDOWN' | 'POWER_SAVER' | 'HVAC_BOOST'
    audioEnabled: true,
    activeRoute: 'dashboard'
  };

  // Web Audio Synthesizer for cyber sound fx
  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) audioCtx = new AudioContextClass();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playSound(type) {
    if (!state.audioEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      if (type === 'click') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.05);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.05);
      } else if (type === 'success') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
        osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (type === 'scan') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(2400, now + 0.1);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'alarm') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.linearRampToValueAtTime(440, now + 0.25);
        osc.frequency.linearRampToValueAtTime(880, now + 0.5);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.6);
      }
    } catch (e) {
      // Audio not permitted yet
    }
  }

  // Toast Notifications
  function showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '🚨';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `
      <span style="font-size: 1.1rem;">${icon}</span>
      <div style="flex: 1;">${message}</div>
    `;
    container.appendChild(toast);
    playSound(type === 'error' ? 'alarm' : type === 'success' ? 'success' : 'click');

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // Live Server Clock
  function initClock() {
    function update() {
      const now = new Date();
      
      // UTC Clock
      const utcIso = now.toISOString().replace('T', ' ').substring(0, 19);
      const elUtc = document.getElementById('clock-utc');
      if (elUtc) elUtc.textContent = utcIso;

      // Local Clock
      const localStr = now.toLocaleTimeString('en-US', { hour12: false });
      const elLocal = document.getElementById('clock-local');
      if (elLocal) elLocal.textContent = localStr;
    }
    update();
    setInterval(update, 1000);
  }

  // Switch Roles
  function setRole(roleName) {
    if (!state.usersByRole[roleName]) return;
    state.currentRole = roleName;
    state.currentUser = state.usersByRole[roleName];

    // Update active role button
    document.querySelectorAll('.role-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.role === roleName);
    });

    // Update Header Avatar & Info
    const avatarImg = document.getElementById('header-user-avatar');
    if (avatarImg) avatarImg.src = state.currentUser.avatar;
    const userNameEl = document.getElementById('header-user-name');
    if (userNameEl) userNameEl.textContent = state.currentUser.name;
    const userRoleEl = document.getElementById('header-user-role');
    if (userRoleEl) userRoleEl.textContent = state.currentUser.role.toUpperCase();

    // Dropdown details
    const dropName = document.getElementById('dropdown-name');
    if (dropName) dropName.textContent = state.currentUser.name;
    const dropEmail = document.getElementById('dropdown-email');
    if (dropEmail) dropEmail.textContent = state.currentUser.email;
    const dropId = document.getElementById('dropdown-id');
    if (dropId) dropId.textContent = state.currentUser.student_id;
    const dropRole = document.getElementById('dropdown-role');
    if (dropRole) dropRole.textContent = state.currentUser.role.toUpperCase();
    const dropDept = document.getElementById('dropdown-dept');
    if (dropDept) dropDept.textContent = state.currentUser.department;
    const dropClearance = document.getElementById('dropdown-clearance');
    if (dropClearance) dropClearance.textContent = `Level ${state.currentUser.clearance}`;

    // Admin-only action buttons visibility / enablement
    const adminActionCard = document.querySelector('.admin-actions-card');
    if (adminActionCard) {
      if (roleName === 'admin') {
        adminActionCard.style.opacity = '1';
        adminActionCard.style.pointerEvents = 'auto';
      } else {
        adminActionCard.style.opacity = '0.7';
      }
    }

    // Refresh Gate Pass for new user
    if (window.NexusSecurity) {
      window.NexusSecurity.refreshPassForUser(state.currentUser);
    }

    // Refresh Attendance user
    if (window.NexusAttendance) {
      window.NexusAttendance.refreshUser(state.currentUser);
    }

    playSound('click');
    showToast(`Role switched to: ${state.currentUser.role.toUpperCase()} (${state.currentUser.name})`, 'info');
  }

  // Set System Status Badge
  function setSystemStatus(status, label, className = 'operational') {
    state.systemStatus = status;
    const badge = document.getElementById('system-status-badge');
    const dot = document.getElementById('system-status-dot');
    const text = document.getElementById('system-status-text');

    if (badge && text) {
      text.textContent = label;
      badge.className = `system-status-pill ${className}`;
      if (className === 'lockdown') {
        badge.style.background = 'rgba(244, 63, 94, 0.2)';
        badge.style.borderColor = 'rgba(244, 63, 94, 0.6)';
        badge.style.color = '#fb7185';
        if (dot) {
          dot.style.background = '#f43f5e';
          dot.style.boxShadow = '0 0 12px #f43f5e';
        }
      } else if (className === 'powersaver') {
        badge.style.background = 'rgba(6, 182, 212, 0.2)';
        badge.style.borderColor = 'rgba(6, 182, 212, 0.6)';
        badge.style.color = '#22d3ee';
        if (dot) {
          dot.style.background = '#06b6d4';
          dot.style.boxShadow = '0 0 12px #06b6d4';
        }
      } else if (className === 'hvac') {
        badge.style.background = 'rgba(16, 185, 129, 0.2)';
        badge.style.borderColor = 'rgba(16, 185, 129, 0.6)';
        badge.style.color = '#34d399';
        if (dot) {
          dot.style.background = '#10b981';
          dot.style.boxShadow = '0 0 12px #10b981';
        }
      } else {
        badge.style.background = 'rgba(16, 185, 129, 0.1)';
        badge.style.borderColor = 'rgba(16, 185, 129, 0.35)';
        badge.style.color = 'var(--emerald-light)';
        if (dot) {
          dot.style.background = 'var(--emerald-primary)';
          dot.style.boxShadow = '0 0 10px var(--emerald-primary)';
        }
      }
    }
  }

  // Navigation Router
  function navigateTo(routeId) {
    state.activeRoute = routeId;

    // Toggle active link
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.toggle('active', link.dataset.target === routeId);
    });

    // Toggle active view
    document.querySelectorAll('.view-section').forEach(section => {
      section.classList.toggle('active', section.id === `view-${routeId}`);
    });

    // Trigger Leaflet map invalidateSize if navigating to map
    if (routeId === 'campus-map' && window.NexusMap && window.NexusMap.mapInstance) {
      setTimeout(() => {
        window.NexusMap.mapInstance.invalidateSize();
      }, 100);
    }

    playSound('click');
  }

  // App Initialization
  function init() {
    initClock();

    // Setup navigation listeners
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const target = link.dataset.target;
        if (target) navigateTo(target);
      });
    });

    // Setup role switcher listeners
    document.querySelectorAll('.role-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        setRole(btn.dataset.role);
      });
    });

    // Setup User Profile dropdown toggle
    const profileBtn = document.getElementById('user-profile-toggle-btn');
    const dropdown = document.getElementById('user-profile-dropdown');
    if (profileBtn && dropdown) {
      profileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('open');
        playSound('click');
      });

      document.addEventListener('click', () => {
        dropdown.classList.remove('open');
      });
    }

    // Set initial user details
    setRole('student');

    // Initialize Lucide icons if loaded
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  return {
    state,
    init,
    setRole,
    setSystemStatus,
    navigateTo,
    showToast,
    playSound
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  window.NexusApp.init();
});
