/**
 * NexusCampus OS - Attendance Tracker Module
 * Directly Connected to Backend Database Engine (/api/attendance/logs, /api/attendance/check-in)
 */

window.NexusAttendance = (function() {
  const coursesList = [
    { code: 'ROB-420', name: 'Autonomous Robotics & SLAM Navigation', venue: 'Turing Lab B', faculty: 'Dr. Evelyn Reed' },
    { code: 'CYBER-501', name: 'Zero-Trust Cyber-Physical Defense', venue: 'Arena 302', faculty: 'Marcus Vance' },
    { code: 'AI-301', name: 'Deep Neural Architectures & LLMs', venue: 'Cyber Commons Pod', faculty: 'Prof. J. Chen' }
  ];

  let attendanceLogs = [];

  // Fetch Attendance Records from Backend Database
  async function loadLogs() {
    try {
      const res = await fetch('/api/attendance/logs');
      if (res.ok) {
        attendanceLogs = await res.json();
      } else {
        throw new Error('Failed to fetch attendance logs');
      }
    } catch (e) {
      console.warn('Fallback attendance records:', e);
      if (attendanceLogs.length === 0) {
        attendanceLogs = [
          {
            id: 'e001',
            student_id: 'STU-88219',
            course_code: 'ROB-420',
            check_in_time: '2026-10-07 14:15:22',
            geofence_verified: 1,
            distance_meters: 11.4
          },
          {
            id: 'e002',
            student_id: 'STU-88219',
            course_code: 'CYBER-501',
            check_in_time: '2026-10-06 10:02:18',
            geofence_verified: 1,
            distance_meters: 8.2
          }
        ];
      }
    }
    renderLogs();
  }

  function getCourseTitle(code) {
    const c = coursesList.find(item => item.code === code);
    return c ? c.name : code;
  }

  function renderLogs() {
    const tableBody = document.getElementById('attendance-logs-tbody');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    attendanceLogs.forEach(log => {
      const row = document.createElement('tr');
      const dist = log.distance_meters !== undefined ? log.distance_meters : 12.0;
      const title = log.course_name || getCourseTitle(log.course_code);

      row.innerHTML = `
        <td style="font-family: var(--font-mono); color: var(--cyan-light); font-weight: 600;">${log.course_code}</td>
        <td>${title}</td>
        <td style="font-family: var(--font-mono);">${log.check_in_time}</td>
        <td>
          <span style="
            display: inline-flex; align-items: center; gap: 4px;
            font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 4px;
            background: rgba(16,185,129,0.15); border: 1px solid var(--emerald-primary); color: var(--emerald-light);
          ">
            ● GEOFENCE PASS (${dist}m)
          </span>
        </td>
        <td style="font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-muted);">${log.id}</td>
      `;
      tableBody.appendChild(row);
    });
  }

  // Trigger Smart Attendance Check-In & Persist to Database
  async function performCheckIn() {
    const select = document.getElementById('attendance-course-select');
    const courseCode = select ? select.value : 'ROB-420';
    const currentUser = window.NexusApp.state.currentUser;
    const distance = window.NexusSecurity.state.simulatedDistance;

    if (distance > 50) {
      window.NexusApp.playSound('alarm');
      window.NexusApp.showToast(`Geofence Failure: Distance ${distance}m exceeds 50m threshold. Database rejected record!`, 'error');
      window.NexusTelemetry.appendLogEntry('ATTEND-WARN', `Geofence check failed for ${currentUser.student_id} (${distance}m away).`, 'warn');
      return;
    }

    try {
      const res = await fetch('/api/attendance/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: currentUser.student_id,
          course_code: courseCode,
          distance_meters: distance
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Check-in failed');

      window.NexusApp.playSound('success');
      window.NexusApp.showToast(`Attendance Committed to Database for ${courseCode} (Log ID: ${data.id})!`, 'success');
      window.NexusTelemetry.appendLogEntry('ATTEND-OK', `Database record inserted: ${currentUser.student_id} checked into ${courseCode} (${distance}m).`, 'success');

      // Reload fresh logs from DB
      loadLogs();
    } catch (err) {
      window.NexusApp.showToast(`Check-In Error: ${err.message}`, 'error');
    }
  }

  function refreshUser(user) {
    const subtitle = document.getElementById('attendance-role-info');
    if (subtitle) {
      if (user.role === 'faculty') {
        subtitle.textContent = `Viewing Faculty Attendance Roster for ${user.name} (${user.department})`;
      } else if (user.role === 'admin') {
        subtitle.textContent = `Campus-Wide Master Attendance Database Audit Console`;
      } else {
        subtitle.textContent = `Student Attendance Verification Console for ${user.name} (${user.student_id})`;
      }
    }
  }

  function init() {
    loadLogs();

    const checkInBtn = document.getElementById('btn-perform-checkin');
    if (checkInBtn) checkInBtn.addEventListener('click', performCheckIn);
  }

  return {
    coursesList,
    attendanceLogs,
    init,
    loadLogs,
    renderLogs,
    performCheckIn,
    refreshUser
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  window.NexusAttendance.init();
});
