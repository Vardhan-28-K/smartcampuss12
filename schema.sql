-- ============================================================================
-- NexusCampus OS - Database Schema & Data Model
-- Target Engine: PostgreSQL 15+ / Supabase
-- Features: UUID Primary Keys, Relational Constraints, High-Performance Indexes,
--           Row-Level Security (RLS) Policies, Time-Series Sensor Telemetry
-- ============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 2. ENUMS & DOMAIN TYPES
-- ============================================================================
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('student', 'faculty', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE facility_type AS ENUM ('lab', 'study_room', 'hall', 'auditorium', 'conference');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE facility_status AS ENUM ('available', 'occupied', 'maintenance');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE pass_status AS ENUM ('active', 'expired', 'used', 'revoked');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE sensor_kind AS ENUM ('energy', 'occupancy', 'temp', 'co2', 'acoustic', 'water');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- 3. CORE RELATIONAL TABLES
-- ============================================================================

-- 3.1 USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role user_role NOT NULL DEFAULT 'student',
    avatar_url TEXT,
    student_id VARCHAR(50) UNIQUE,
    department VARCHAR(100) DEFAULT 'Computer Science & Engineering',
    security_clearance_level INT DEFAULT 1 CHECK (security_clearance_level BETWEEN 1 AND 5),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.2 BUILDINGS TABLE
CREATE TABLE IF NOT EXISTS buildings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    location_lat NUMERIC(9,6) NOT NULL,
    location_lng NUMERIC(9,6) NOT NULL,
    total_floors INT NOT NULL DEFAULT 4 CHECK (total_floors > 0),
    occupancy_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (occupancy_pct BETWEEN 0.00 AND 100.00),
    power_usage_kwh NUMERIC(8,2) NOT NULL DEFAULT 0.00 CHECK (power_usage_kwh >= 0.00),
    hvac_status VARCHAR(20) DEFAULT 'nominal' CHECK (hvac_status IN ('nominal', 'boosted', 'throttled', 'offline')),
    lockdown_status BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.3 FACILITIES TABLE
CREATE TABLE IF NOT EXISTS facilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    type facility_type NOT NULL DEFAULT 'study_room',
    floor_number INT NOT NULL DEFAULT 0,
    capacity INT NOT NULL CHECK (capacity > 0),
    status facility_status NOT NULL DEFAULT 'available',
    current_co2_ppm INT DEFAULT 410,
    current_temp_c NUMERIC(4,1) DEFAULT 22.0,
    amenities JSONB DEFAULT '["Wi-Fi 7", "Smart Display", "Dual Monitors"]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.4 GATE PASSES TABLE (Zero-Trust TOTP QR Passes)
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

-- 3.5 SENSOR TELEMETRY TABLE (Time-Series Metrics)
CREATE TABLE IF NOT EXISTS sensor_telemetry (
    id BIGSERIAL PRIMARY KEY,
    building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    sensor_type sensor_kind NOT NULL,
    value NUMERIC(10,2) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.6 ATTENDANCE LOGS TABLE (Geofence-Verified Smart Attendance)
CREATE TABLE IF NOT EXISTS attendance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id VARCHAR(50) NOT NULL,
    course_code VARCHAR(30) NOT NULL,
    check_in_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    geofence_verified BOOLEAN NOT NULL DEFAULT TRUE,
    distance_meters NUMERIC(6,2) DEFAULT 0.00,
    client_ip VARCHAR(45) DEFAULT '127.0.0.1',
    device_fingerprint VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 4. PERFORMANCE & SPATIAL INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_student_id ON users(student_id);

CREATE INDEX IF NOT EXISTS idx_buildings_code ON buildings(code);
CREATE INDEX IF NOT EXISTS idx_buildings_coords ON buildings(location_lat, location_lng);

CREATE INDEX IF NOT EXISTS idx_facilities_building ON facilities(building_id);
CREATE INDEX IF NOT EXISTS idx_facilities_type ON facilities(type);
CREATE INDEX IF NOT EXISTS idx_facilities_status ON facilities(status);

CREATE INDEX IF NOT EXISTS idx_gate_passes_user ON gate_passes(user_id);
CREATE INDEX IF NOT EXISTS idx_gate_passes_validity ON gate_passes(valid_until, status);

CREATE INDEX IF NOT EXISTS idx_telemetry_building_time ON sensor_telemetry(building_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_sensor_type ON sensor_telemetry(sensor_type, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_student_course ON attendance_logs(student_id, course_code);
CREATE INDEX IF NOT EXISTS idx_attendance_time ON attendance_logs(check_in_time DESC);

-- ============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES - SUPABASE COMPLIANT
-- ============================================================================

-- Enable RLS across all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE gate_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensor_telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;

-- Helper Function: Extract authenticated user role from JWT claims
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS text AS $$
BEGIN
    RETURN COALESCE(
        current_setting('request.jwt.claims', true)::jsonb->>'role',
        'student'
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- 5.1 USERS POLICIES
-- Students/Faculty can read their own profile; Admins can read and manage all profiles
CREATE POLICY "users_read_policy" ON users
    FOR SELECT
    USING (
        auth.uid() = id 
        OR current_user_role() = 'admin'
        OR current_user_role() = 'faculty'
    );

CREATE POLICY "users_update_own_profile" ON users
    FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "users_admin_all" ON users
    FOR ALL
    USING (current_user_role() = 'admin');

-- 5.2 BUILDINGS POLICIES
-- All authenticated users can read building telemetry; only admins can modify
CREATE POLICY "buildings_select_all" ON buildings
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "buildings_admin_manage" ON buildings
    FOR ALL
    USING (current_user_role() = 'admin');

-- 5.3 FACILITIES POLICIES
-- All authenticated users can view facilities; faculty & admins can manage bookings
CREATE POLICY "facilities_select_all" ON facilities
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "facilities_update_status" ON facilities
    FOR UPDATE
    USING (current_user_role() IN ('admin', 'faculty'));

-- 5.4 GATE PASSES POLICIES
-- Users can only view & create their own passes; Security Guards / Admins can scan & verify any pass
CREATE POLICY "gate_passes_user_own" ON gate_passes
    FOR SELECT
    USING (
        auth.uid() = user_id 
        OR current_user_role() = 'admin'
    );

CREATE POLICY "gate_passes_user_insert" ON gate_passes
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "gate_passes_admin_update" ON gate_passes
    FOR UPDATE
    USING (current_user_role() = 'admin');

-- 5.5 SENSOR TELEMETRY POLICIES
-- Read-only access for dashboards; automated IoT ingest service or admin can insert
CREATE POLICY "telemetry_select_all" ON sensor_telemetry
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "telemetry_admin_insert" ON sensor_telemetry
    FOR INSERT
    WITH CHECK (current_user_role() = 'admin');

-- 5.6 ATTENDANCE LOGS POLICIES
-- Students can view their own attendance logs; Faculty can view logs for their courses; Admins manage all
CREATE POLICY "attendance_student_read_own" ON attendance_logs
    FOR SELECT
    USING (
        student_id = (SELECT student_id FROM users WHERE id = auth.uid())
        OR current_user_role() IN ('faculty', 'admin')
    );

CREATE POLICY "attendance_insert_verified" ON attendance_logs
    FOR INSERT
    WITH CHECK (
        geofence_verified = true
    );

-- ============================================================================
-- 6. SAMPLE SEED DATA
-- ============================================================================

-- Seed Users
INSERT INTO users (id, email, full_name, role, avatar_url, student_id, department, security_clearance_level)
VALUES 
    ('a0000000-0000-0000-0000-000000000001', 'alex.mercer@nexus.edu', 'Alex Mercer', 'student', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150', 'STU-88219', 'Robotics & Autonomous Systems', 2),
    ('a0000000-0000-0000-0000-000000000002', 'evelyn.reed@nexus.edu', 'Dr. Evelyn Reed', 'faculty', 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150', 'FAC-4102', 'Cyber-Physical Security', 4),
    ('a0000000-0000-0000-0000-000000000003', 'marcus.vance@nexus.edu', 'Marcus Vance', 'admin', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150', 'ADM-001', 'Campus Infrastructure Ops', 5)
ON CONFLICT (email) DO NOTHING;

-- Seed Buildings
INSERT INTO buildings (id, code, name, location_lat, location_lng, total_floors, occupancy_pct, power_usage_kwh, hvac_status)
VALUES 
    ('b0000000-0000-0000-0000-000000000001', 'ROB-03', 'Turing Robotics & AI Complex', 37.774500, -122.418200, 4, 82.50, 142.30, 'nominal'),
    ('b0000000-0000-0000-0000-000000000002', 'LIB-01', 'Cyber Commons & Central Library', 37.775200, -122.420500, 5, 68.00, 95.80, 'nominal'),
    ('b0000000-0000-0000-0000-000000000003', 'SCI-02', 'Quantum Computing Laboratory', 37.774000, -122.420000, 3, 91.00, 112.40, 'nominal'),
    ('b0000000-0000-0000-0000-000000000004', 'ENG-01', 'Main Engineering & Transit Hub', 37.775800, -122.419000, 4, 74.50, 62.00, 'nominal')
ON CONFLICT (code) DO NOTHING;

-- Seed Facilities
INSERT INTO facilities (id, building_id, name, type, floor_number, capacity, status, current_co2_ppm, current_temp_c)
VALUES 
    ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Robotics Lab B - Autonomous Drones', 'lab', 2, 28, 'occupied', 445, 21.8),
    ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'Cyber Defense Simulation Arena', 'lab', 3, 40, 'available', 390, 20.5),
    ('c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000002', 'Quiet Study Pod 104', 'study_room', 1, 6, 'available', 380, 22.0),
    ('c0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000002', 'Collaborative Think Tank Hall A', 'hall', 2, 85, 'occupied', 510, 23.2),
    ('c0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000003', 'Cryogenic Quantum Computing Pod', 'lab', 1, 12, 'maintenance', 415, 18.0)
ON CONFLICT DO NOTHING;

-- Seed Active Gate Pass for Alex Mercer
INSERT INTO gate_passes (id, user_id, secret_token, valid_until, status, gate_id)
VALUES 
    ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'JBSWY3DPEHPK3PXP', NOW() + INTERVAL '12 hours', 'active', 'GATE-NORTH-01')
ON CONFLICT DO NOTHING;

-- Seed Sample Sensor Telemetry
INSERT INTO sensor_telemetry (building_id, sensor_type, value, unit, timestamp)
VALUES 
    ('b0000000-0000-0000-0000-000000000001', 'energy', 142.3, 'kWh', NOW() - INTERVAL '5 minutes'),
    ('b0000000-0000-0000-0000-000000000001', 'occupancy', 82.5, '%', NOW() - INTERVAL '5 minutes'),
    ('b0000000-0000-0000-0000-000000000001', 'co2', 445.0, 'ppm', NOW() - INTERVAL '5 minutes'),
    ('b0000000-0000-0000-0000-000000000002', 'energy', 95.8, 'kWh', NOW() - INTERVAL '5 minutes'),
    ('b0000000-0000-0000-0000-000000000002', 'occupancy', 68.0, '%', NOW() - INTERVAL '5 minutes'),
    ('b0000000-0000-0000-0000-000000000003', 'energy', 112.4, 'kWh', NOW() - INTERVAL '5 minutes'),
    ('b0000000-0000-0000-0000-000000000004', 'energy', 62.0, 'kWh', NOW() - INTERVAL '5 minutes');

-- Seed Attendance Records
INSERT INTO attendance_logs (student_id, course_code, check_in_time, geofence_verified, distance_meters, client_ip)
VALUES 
    ('STU-88219', 'ROB-420: Autonomous Robotics', NOW() - INTERVAL '2 hours', true, 11.4, '10.24.11.85'),
    ('STU-88219', 'CYBER-501: Zero-Trust Defense', NOW() - INTERVAL '1 day', true, 8.2, '10.24.11.85'),
    ('STU-88219', 'AI-301: Deep Neural Systems', NOW() - INTERVAL '2 days', true, 14.8, '10.24.11.85');
