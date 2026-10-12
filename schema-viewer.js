/**
 * NexusCampus OS - Database Schema & Supabase SQL Studio Viewer
 * Directly Connected to Backend Database Engine via /api/sql/query
 */

window.NexusSchema = (function() {
  const schemaSqlText = `-- NexusCampus OS - Production PostgreSQL / Supabase RLS Schema
-- Complete relational model with 6 core tables, UUID primary keys, and Row-Level Security.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ENUMS
CREATE TYPE user_role AS ENUM ('student', 'faculty', 'admin');
CREATE TYPE facility_type AS ENUM ('lab', 'study_room', 'hall', 'auditorium', 'conference');
CREATE TYPE facility_status AS ENUM ('available', 'occupied', 'maintenance');
CREATE TYPE pass_status AS ENUM ('active', 'expired', 'used', 'revoked');
CREATE TYPE sensor_kind AS ENUM ('energy', 'occupancy', 'temp', 'co2', 'acoustic', 'water');

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role user_role NOT NULL DEFAULT 'student',
    avatar_url TEXT,
    student_id VARCHAR(50) UNIQUE,
    department VARCHAR(100) DEFAULT 'Computer Science & Engineering',
    security_clearance_level INT DEFAULT 1 CHECK (security_clearance_level BETWEEN 1 AND 5),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. BUILDINGS TABLE
CREATE TABLE IF NOT EXISTS buildings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    location_lat NUMERIC(9,6) NOT NULL,
    location_lng NUMERIC(9,6) NOT NULL,
    total_floors INT NOT NULL DEFAULT 4,
    occupancy_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    power_usage_kwh NUMERIC(8,2) NOT NULL DEFAULT 0.00,
    hvac_status VARCHAR(20) DEFAULT 'nominal',
    lockdown_status BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. FACILITIES TABLE
CREATE TABLE IF NOT EXISTS facilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    type facility_type NOT NULL DEFAULT 'study_room',
    floor_number INT NOT NULL DEFAULT 0,
    capacity INT NOT NULL,
    status facility_status NOT NULL DEFAULT 'available',
    current_co2_ppm INT DEFAULT 410,
    current_temp_c NUMERIC(4,1) DEFAULT 22.0,
    amenities JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. GATE PASSES TABLE (TOTP HMAC-SHA1 QR Passes)
CREATE TABLE IF NOT EXISTS gate_passes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    secret_token VARCHAR(255) NOT NULL,
    valid_until TIMESTAMPTZ NOT NULL,
    status pass_status NOT NULL DEFAULT 'active',
    gate_id VARCHAR(50) DEFAULT 'GATE-NORTH-01',
    scan_count INT DEFAULT 0,
    last_scanned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. SENSOR TELEMETRY TABLE (Time-Series)
CREATE TABLE IF NOT EXISTS sensor_telemetry (
    id BIGSERIAL PRIMARY KEY,
    building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    sensor_type sensor_kind NOT NULL,
    value NUMERIC(10,2) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. ATTENDANCE LOGS TABLE (Geofence-Verified)
CREATE TABLE IF NOT EXISTS attendance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id VARCHAR(50) NOT NULL,
    course_code VARCHAR(30) NOT NULL,
    check_in_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    geofence_verified BOOLEAN NOT NULL DEFAULT TRUE,
    distance_meters NUMERIC(6,2) DEFAULT 0.00,
    client_ip VARCHAR(45) DEFAULT '127.0.0.1',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SUPABASE ROW-LEVEL SECURITY (RLS) POLICIES
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE gate_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensor_telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gate_passes_user_own" ON gate_passes
    FOR SELECT USING (auth.uid() = user_id OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'admin');

CREATE POLICY "attendance_student_read_own" ON attendance_logs
    FOR SELECT USING (student_id = (SELECT student_id FROM users WHERE id = auth.uid()) OR current_setting('request.jwt.claims', true)::jsonb->>'role' IN ('faculty', 'admin'));
`;

  function copySqlToClipboard() {
    navigator.clipboard.writeText(schemaSqlText).then(() => {
      window.NexusApp.showToast('Copied PostgreSQL / Supabase Schema to Clipboard!', 'success');
      window.NexusApp.playSound('success');
    }).catch(() => {
      window.NexusApp.showToast('Failed to copy to clipboard', 'error');
    });
  }

  function downloadSqlFile() {
    const blob = new Blob([schemaSqlText], { type: 'text/sql' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nexus_campus_schema.sql';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    window.NexusApp.showToast('Downloaded nexus_campus_schema.sql', 'success');
  }

  // Interactive Live SQL Execution against Backend Database
  async function runSqlSimulator() {
    const input = document.getElementById('sql-query-input');
    const output = document.getElementById('sql-query-output');
    if (!input || !output) return;

    const query = input.value.trim();
    if (!query) return;

    window.NexusApp.playSound('scan');
    output.innerHTML = `<span style="color: var(--cyan-light);"><span class="pulse-dot"></span> Transmitting query to Backend Database Engine...</span>`;

    try {
      const res = await fetch('/api/sql/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query })
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        output.innerHTML = `
          <div style="color: #fb7185; padding: 6px; font-weight: 600;">
            ⚠️ SQL Execution Error: ${data.error || 'Server error'}
          </div>
        `;
        window.NexusApp.playSound('alarm');
        return;
      }

      if (data.rows && data.rows.length > 0) {
        const columns = data.columns || Object.keys(data.rows[0]);
        let tableHtml = `<table class="attendance-table" style="font-size: 0.73rem;"><thead><tr>`;
        columns.forEach(col => {
          tableHtml += `<th>${col}</th>`;
        });
        tableHtml += `</tr></thead><tbody>`;

        data.rows.forEach(row => {
          tableHtml += `<tr>`;
          columns.forEach(col => {
            let val = row[col];
            if (typeof val === 'object' && val !== null) val = JSON.stringify(val);
            tableHtml += `<td>${val !== null && val !== undefined ? val : '<em>NULL</em>'}</td>`;
          });
          tableHtml += `</tr>`;
        });
        tableHtml += `</tbody></table>`;
        tableHtml += `
          <div style="margin-top: 10px; color: var(--emerald-light); font-size: 0.72rem; display: flex; justify-content: space-between;">
            <span>✅ Query OK: ${data.row_count} rows fetched from campus.db</span>
            <span>Execution Latency: ${data.elapsed_ms} ms</span>
          </div>
        `;
        output.innerHTML = tableHtml;
      } else if (data.affected_rows !== undefined) {
        output.innerHTML = `
          <div style="color: var(--emerald-light); padding: 8px;">
            ✅ Command Executed: ${data.affected_rows} rows affected in ${data.elapsed_ms} ms.
          </div>
        `;
      } else {
        output.innerHTML = `
          <div style="color: var(--text-muted); padding: 8px;">
            Query returned 0 rows in ${data.elapsed_ms} ms.
          </div>
        `;
      }
      window.NexusApp.playSound('success');

    } catch (err) {
      output.innerHTML = `<div style="color: #fb7185;">Network connection to database failed: ${err.message}</div>`;
      window.NexusApp.playSound('alarm');
    }
  }

  function init() {
    const copyBtn = document.getElementById('btn-copy-schema-sql');
    if (copyBtn) copyBtn.addEventListener('click', copySqlToClipboard);

    const dlBtn = document.getElementById('btn-download-schema-sql');
    if (dlBtn) dlBtn.addEventListener('click', downloadSqlFile);

    const runSqlBtn = document.getElementById('btn-run-sql');
    if (runSqlBtn) runSqlBtn.addEventListener('click', runSqlSimulator);

    const input = document.getElementById('sql-query-input');
    if (input) {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') runSqlSimulator();
      });
    }

    const toggleAudio = document.getElementById('setting-audio-toggle');
    if (toggleAudio) {
      toggleAudio.addEventListener('change', (e) => {
        window.NexusApp.state.audioEnabled = e.target.checked;
        window.NexusApp.showToast(`Audio Sound FX: ${e.target.checked ? 'Enabled' : 'Muted'}`, 'info');
      });
    }

    const resetBtn = document.getElementById('btn-reset-demo-state');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        window.location.reload();
      });
    }
  }

  return {
    schemaSqlText,
    init,
    copySqlToClipboard,
    downloadSqlFile,
    runSqlSimulator
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  window.NexusSchema.init();
});
