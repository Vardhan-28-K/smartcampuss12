#!/usr/bin/env python3
"""
NexusCampus OS - Production Backend & Relational Database Engine
Provides:
  - SQLite Relational Database (`campus.db`) mirroring PostgreSQL / Supabase schema
  - Automatic table initialization & seed migration on startup
  - Comprehensive REST API endpoints for telemetry, gate pass scans, facilities, and attendance
  - Live Interactive SQL Query execution endpoint (/api/sql/query)
  - Full CORS, Threading, and Static Asset delivery
"""

import os
import sys
import json
import time
import sqlite3
import urllib.parse
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn

PORT = 8080
HOST = "0.0.0.0"
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "campus.db")

# ============================================================================
# DATABASE INITIALIZATION & MIGRATION
# ============================================================================

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_database():
    conn = get_db()
    cursor = conn.cursor()

    # 1. Users Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('student', 'faculty', 'admin')),
        avatar_url TEXT,
        student_id TEXT UNIQUE,
        department TEXT DEFAULT 'Computer Science & Engineering',
        security_clearance_level INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 2. Buildings Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS buildings (
        id TEXT PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        location_lat REAL NOT NULL,
        location_lng REAL NOT NULL,
        total_floors INTEGER NOT NULL DEFAULT 4,
        occupancy_pct REAL NOT NULL DEFAULT 0.0,
        power_usage_kwh REAL NOT NULL DEFAULT 0.0,
        hvac_status TEXT DEFAULT 'nominal',
        lockdown_status INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 3. Facilities Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS facilities (
        id TEXT PRIMARY KEY,
        building_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('lab', 'study_room', 'hall', 'auditorium', 'conference')),
        floor_number INTEGER NOT NULL DEFAULT 0,
        capacity INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'maintenance')),
        current_co2_ppm INTEGER DEFAULT 410,
        current_temp_c REAL DEFAULT 22.0,
        amenities TEXT DEFAULT '[]',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE
    );
    """)

    # 4. Gate Passes Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS gate_passes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        secret_token TEXT NOT NULL,
        valid_until TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'used', 'revoked')),
        gate_id TEXT DEFAULT 'GATE-NORTH-01',
        scan_count INTEGER DEFAULT 0,
        last_scanned_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)

    # 5. Sensor Telemetry Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sensor_telemetry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        building_id TEXT NOT NULL,
        sensor_type TEXT NOT NULL CHECK (sensor_type IN ('energy', 'occupancy', 'temp', 'co2', 'acoustic', 'water')),
        value REAL NOT NULL,
        unit TEXT NOT NULL,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE
    );
    """)

    # 6. Attendance Logs Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS attendance_logs (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        course_code TEXT NOT NULL,
        check_in_time TEXT DEFAULT CURRENT_TIMESTAMP,
        geofence_verified INTEGER NOT NULL DEFAULT 1,
        distance_meters REAL DEFAULT 0.0,
        client_ip TEXT DEFAULT '127.0.0.1',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 7. System Settings Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Seed initial data if users table is empty
    cursor.execute("SELECT COUNT(*) FROM users;")
    if cursor.fetchone()[0] == 0:
        print("[DB] Seeding initial database records into campus.db...")
        # Seed Users
        cursor.executemany("""
        INSERT INTO users (id, email, full_name, role, avatar_url, student_id, department, security_clearance_level)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?);
        """, [
            ('a0000000-0000-0000-0000-000000000001', 'alex.mercer@nexus.edu', 'Alex Mercer', 'student', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150', 'STU-88219', 'Robotics & Autonomous Systems', 2),
            ('a0000000-0000-0000-0000-000000000002', 'evelyn.reed@nexus.edu', 'Dr. Evelyn Reed', 'faculty', 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150', 'FAC-4102', 'Cyber-Physical Security', 4),
            ('a0000000-0000-0000-0000-000000000003', 'marcus.vance@nexus.edu', 'Marcus Vance', 'admin', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150', 'ADM-001', 'Campus Infrastructure Ops', 5)
        ])

        # Seed Buildings
        cursor.executemany("""
        INSERT INTO buildings (id, code, name, location_lat, location_lng, total_floors, occupancy_pct, power_usage_kwh, hvac_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, [
            ('b001', 'ROB-03', 'Turing Robotics & AI Complex', 37.774500, -122.418200, 4, 82.5, 142.3, 'nominal'),
            ('b002', 'LIB-01', 'Cyber Commons & Central Library', 37.775200, -122.420500, 5, 68.0, 95.8, 'nominal'),
            ('b003', 'SCI-02', 'Quantum Computing Laboratory', 37.774000, -122.420000, 3, 91.0, 112.4, 'nominal'),
            ('b004', 'ENG-01', 'Main Engineering & Transit Hub', 37.775800, -122.419000, 4, 74.5, 62.0, 'nominal')
        ])

        # Seed Facilities
        cursor.executemany("""
        INSERT INTO facilities (id, building_id, name, type, floor_number, capacity, status, current_co2_ppm, current_temp_c, amenities)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, [
            ('c001', 'b001', 'Robotics Lab B - Autonomous Drones', 'lab', 2, 28, 'occupied', 445, 21.8, json.dumps(['Motion Capture Arena', '3D Printers', 'Soldering Stations', 'Wi-Fi 7'])),
            ('c002', 'b001', 'Cyber Defense Simulation Arena', 'lab', 3, 40, 'available', 390, 20.5, json.dumps(['Isolated Subnet', 'Air-Gapped Racks', 'Dual 4K Displays'])),
            ('c003', 'b002', 'Quiet Study Pod 104', 'study_room', 1, 6, 'available', 380, 22.0, json.dumps(['Acoustic Panels', 'Whiteboard', 'Smart TV Screen'])),
            ('c004', 'b002', 'Collaborative Think Tank Hall A', 'hall', 2, 85, 'occupied', 510, 23.2, json.dumps(['Surround Audio System', 'Dual Laser Projectors'])),
            ('c005', 'b003', 'Cryogenic Quantum Computing Pod', 'lab', 1, 12, 'maintenance', 415, 18.0, json.dumps(['Dilution Fridge Telemetry', 'Cleanroom Garments'])),
            ('c006', 'b004', 'Executive Cyber Governance Boardroom', 'conference', 4, 22, 'available', 395, 21.0, json.dumps(['Cisco Webex Telepresence', 'Automated Privacy Glass']))
        ])

        # Seed Gate Passes
        cursor.execute("""
        INSERT INTO gate_passes (id, user_id, secret_token, valid_until, status, gate_id, scan_count)
        VALUES ('d001', 'a0000000-0000-0000-0000-000000000001', 'JBSWY3DPEHPK3PXP', datetime('now', '+12 hours'), 'active', 'GATE-NORTH-01', 1240);
        """)

        # Seed Attendance Logs
        cursor.executemany("""
        INSERT INTO attendance_logs (id, student_id, course_code, check_in_time, geofence_verified, distance_meters, client_ip)
        VALUES (?, ?, ?, datetime('now', ?), 1, ?, '10.24.11.85');
        """, [
            ('e001', 'STU-88219', 'ROB-420', '-2 hours', 11.4),
            ('e002', 'STU-88219', 'CYBER-501', '-1 day', 8.2),
            ('e003', 'STU-88219', 'AI-301', '-2 days', 14.8)
        ])

        # Seed System Settings
        cursor.executemany("""
        INSERT INTO system_settings (key, value) VALUES (?, ?);
        """, [
            ('power_saver', '0'),
            ('lockdown', '0'),
            ('hvac_boost', '0'),
            ('total_power_kwh', '412.5'),
            ('gate_scans_today', '1240')
        ])

        # Seed Sensor Telemetry
        cursor.executemany("""
        INSERT INTO sensor_telemetry (building_id, sensor_type, value, unit)
        VALUES (?, ?, ?, ?);
        """, [
            ('b001', 'energy', 142.3, 'kWh'),
            ('b001', 'occupancy', 82.5, '%'),
            ('b001', 'co2', 445.0, 'ppm'),
            ('b002', 'energy', 95.8, 'kWh'),
            ('b003', 'energy', 112.4, 'kWh'),
            ('b004', 'energy', 62.0, 'kWh')
        ])

    conn.commit()
    conn.close()
    print("[DB] campus.db initialization complete.")

# ============================================================================
# HTTP & REST API SERVER
# ============================================================================

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True

class NexusRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Enable CORS and disable aggressive caching for API
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        if self.path.startswith('/api/'):
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path.startswith("/api/"):
            self.handle_api_get(path, urllib.parse.parse_qs(parsed.query))
            return

        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length) if content_length > 0 else b'{}'
        try:
            data = json.loads(body.decode('utf-8'))
        except Exception:
            data = {}

        if path.startswith("/api/"):
            self.handle_api_post(path, data)
            return

        self.send_error(404, "Endpoint not found")

    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data, indent=2).encode('utf-8'))

    # GET API Routes
    def handle_api_get(self, path, query):
        conn = get_db()
        cursor = conn.cursor()

        try:
            if path == "/api/status":
                # Fetch settings
                cursor.execute("SELECT key, value FROM system_settings;")
                settings = dict(cursor.fetchall())

                cursor.execute("SELECT SUM(power_usage_kwh) as total_power, AVG(occupancy_pct) as avg_occ FROM buildings;")
                bld_stats = cursor.fetchone()

                total_power = float(settings.get('total_power_kwh', bld_stats['total_power'] or 412.5))
                gate_scans = int(settings.get('gate_scans_today', 1240))
                is_power_saver = settings.get('power_saver') == '1'
                is_lockdown = settings.get('lockdown') == '1'
                is_hvac_boost = settings.get('hvac_boost') == '1'

                status_text = "OPERATIONAL"
                if is_lockdown:
                    status_text = "LOCKDOWN"
                elif is_power_saver:
                    status_text = "POWER_SAVER"
                elif is_hvac_boost:
                    status_text = "HVAC_BOOST"

                self.send_json({
                    "system": "NexusCampus OS",
                    "version": "2.6-enterprise",
                    "database": "SQLite (campus.db) - Active Connection",
                    "status": status_text,
                    "power_saver": is_power_saver,
                    "lockdown": is_lockdown,
                    "hvac_boost": is_hvac_boost,
                    "metrics": {
                        "power_kwh": total_power,
                        "occupancy_pct": round(float(bld_stats['avg_occ'] or 78.0), 1),
                        "co2_ppm": 375 if is_hvac_boost else 420,
                        "gate_scans_today": gate_scans
                    },
                    "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
                })

            elif path == "/api/buildings":
                cursor.execute("SELECT * FROM buildings ORDER BY code ASC;")
                rows = [dict(r) for r in cursor.fetchall()]
                self.send_json(rows)

            elif path == "/api/facilities":
                cursor.execute("""
                SELECT f.*, b.name as building_name, b.code as building_code 
                FROM facilities f 
                JOIN buildings b ON f.building_id = b.id 
                ORDER BY f.floor_number ASC, f.name ASC;
                """)
                rows = []
                for r in cursor.fetchall():
                    item = dict(r)
                    item['amenities'] = json.loads(item['amenities']) if item.get('amenities') else []
                    rows.append(item)
                self.send_json(rows)

            elif path == "/api/attendance/logs":
                cursor.execute("""
                SELECT a.*, u.full_name as student_name 
                FROM attendance_logs a 
                LEFT JOIN users u ON a.student_id = u.student_id 
                ORDER BY a.check_in_time DESC LIMIT 50;
                """)
                rows = [dict(r) for r in cursor.fetchall()]
                self.send_json(rows)

            elif path == "/api/users":
                cursor.execute("SELECT id, email, full_name, role, student_id, department, security_clearance_level FROM users;")
                rows = [dict(r) for r in cursor.fetchall()]
                self.send_json(rows)

            elif path == "/api/schema":
                schema_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "schema.sql")
                if os.path.exists(schema_path):
                    with open(schema_path, "r", encoding="utf-8") as f:
                        self.send_json({"schema_sql": f.read(), "source": "PostgreSQL / Supabase Schema File"})
                else:
                    self.send_json({"error": "Schema file not found"}, status=404)

            else:
                self.send_json({"error": "Unknown API GET endpoint"}, status=404)

        finally:
            conn.close()

    # POST API Routes
    def handle_api_post(self, path, data):
        conn = get_db()
        cursor = conn.cursor()

        try:
            if path == "/api/telemetry/action":
                action = data.get("action")
                if action == "power_saver":
                    cursor.execute("SELECT value FROM system_settings WHERE key = 'power_saver';")
                    curr = cursor.fetchone()
                    new_val = '0' if (curr and curr[0] == '1') else '1'
                    cursor.execute("REPLACE INTO system_settings (key, value) VALUES ('power_saver', ?);", (new_val,))
                    new_power = '298.2' if new_val == '1' else '412.5'
                    cursor.execute("REPLACE INTO system_settings (key, value) VALUES ('total_power_kwh', ?);", (new_power,))
                    conn.commit()

                    self.send_json({
                        "success": True,
                        "action": "power_saver",
                        "active": (new_val == '1'),
                        "power_kwh": float(new_power)
                    })

                elif action == "lockdown":
                    cursor.execute("SELECT value FROM system_settings WHERE key = 'lockdown';")
                    curr = cursor.fetchone()
                    new_val = '0' if (curr and curr[0] == '1') else '1'
                    cursor.execute("REPLACE INTO system_settings (key, value) VALUES ('lockdown', ?);", (new_val,))
                    cursor.execute("UPDATE buildings SET lockdown_status = ?;", (1 if new_val == '1' else 0,))
                    conn.commit()

                    self.send_json({
                        "success": True,
                        "action": "lockdown",
                        "active": (new_val == '1')
                    })

                elif action == "hvac_boost":
                    cursor.execute("SELECT value FROM system_settings WHERE key = 'hvac_boost';")
                    curr = cursor.fetchone()
                    new_val = '0' if (curr and curr[0] == '1') else '1'
                    cursor.execute("REPLACE INTO system_settings (key, value) VALUES ('hvac_boost', ?);", (new_val,))
                    cursor.execute("UPDATE buildings SET hvac_status = ?;", ('boosted' if new_val == '1' else 'nominal',))
                    conn.commit()

                    self.send_json({
                        "success": True,
                        "action": "hvac_boost",
                        "active": (new_val == '1'),
                        "co2_ppm": 375 if new_val == '1' else 420
                    })
                else:
                    self.send_json({"error": "Invalid telemetry action"}, status=400)

            elif path == "/api/gate-pass/scan":
                cursor.execute("SELECT value FROM system_settings WHERE key = 'gate_scans_today';")
                row = cursor.fetchone()
                current_scans = int(row[0]) if row else 1240
                new_scans = current_scans + 1
                cursor.execute("REPLACE INTO system_settings (key, value) VALUES ('gate_scans_today', ?);", (str(new_scans),))
                
                # Update pass scan count
                pass_id = data.get("pass_id", "d001")
                cursor.execute("UPDATE gate_passes SET scan_count = scan_count + 1, last_scanned_at = CURRENT_TIMESTAMP WHERE id = ?;", (pass_id,))
                conn.commit()

                self.send_json({
                    "verified": True,
                    "turnstile": "TURNSTILE-B04",
                    "gate_scans_today": new_scans,
                    "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
                })

            elif path == "/api/facilities/book":
                facility_id = data.get("facility_id")
                attendees = int(data.get("attendees", 1))

                cursor.execute("SELECT * FROM facilities WHERE id = ?;", (facility_id,))
                facility = cursor.fetchone()
                if not facility:
                    self.send_json({"error": "Facility not found"}, status=404)
                    return

                if facility['status'] == 'occupied':
                    self.send_json({"error": "Facility is already occupied"}, status=409)
                    return

                if attendees > facility['capacity']:
                    self.send_json({"error": f"Attendee count ({attendees}) exceeds capacity ({facility['capacity']})"}, status=400)
                    return

                cursor.execute("UPDATE facilities SET status = 'occupied' WHERE id = ?;", (facility_id,))
                conn.commit()

                self.send_json({
                    "success": True,
                    "facility_id": facility_id,
                    "facility_name": facility['name'],
                    "status": "occupied",
                    "attendees": attendees
                })

            elif path == "/api/attendance/check-in":
                student_id = data.get("student_id", "STU-88219")
                course_code = data.get("course_code", "ROB-420")
                distance = float(data.get("distance_meters", 12.0))

                if distance > 50.0:
                    self.send_json({
                        "success": False,
                        "error": f"Geofence violation: Distance {distance}m exceeds 50m threshold",
                        "distance_meters": distance
                    }, status=403)
                    return

                log_id = f"e{int(time.time()*1000)%1000000:06d}"
                check_in_time = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())

                cursor.execute("""
                INSERT INTO attendance_logs (id, student_id, course_code, check_in_time, geofence_verified, distance_meters, client_ip)
                VALUES (?, ?, ?, ?, 1, ?, ?);
                """, (log_id, student_id, course_code, check_in_time, distance, self.client_address[0]))
                conn.commit()

                self.send_json({
                    "success": True,
                    "id": log_id,
                    "student_id": student_id,
                    "course_code": course_code,
                    "check_in_time": check_in_time,
                    "distance_meters": distance,
                    "geofence_verified": True
                })

            elif path == "/api/sql/query":
                # Real SQL Query execution against database
                query = data.get("query", "").strip()
                if not query:
                    self.send_json({"error": "Query cannot be empty"}, status=400)
                    return

                # Prevent destructive dropping of master tables in demo sandbox
                query_lower = query.lower()
                if "drop table" in query_lower or "truncate" in query_lower:
                    self.send_json({"error": "DROP TABLE and TRUNCATE are restricted in the interactive sandbox."}, status=403)
                    return

                start_t = time.perf_counter()
                cursor.execute(query)
                
                if cursor.description:
                    columns = [col[0] for col in cursor.description]
                    rows = [dict(zip(columns, r)) for r in cursor.fetchall()]
                    elapsed_ms = round((time.perf_counter() - start_t) * 1000, 2)
                    self.send_json({
                        "success": True,
                        "columns": columns,
                        "rows": rows,
                        "row_count": len(rows),
                        "elapsed_ms": elapsed_ms
                    })
                else:
                    conn.commit()
                    elapsed_ms = round((time.perf_counter() - start_t) * 1000, 2)
                    self.send_json({
                        "success": True,
                        "affected_rows": cursor.rowcount,
                        "elapsed_ms": elapsed_ms
                    })

            else:
                self.send_json({"error": "Unknown API POST endpoint"}, status=404)

        except Exception as e:
            self.send_json({"error": str(e)}, status=500)
        finally:
            conn.close()

def run():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    init_database()
    server_address = (HOST, PORT)
    httpd = ThreadedHTTPServer(server_address, NexusRequestHandler)
    print("=" * 70)
    print(f" NexusCampus OS - Full-Stack Platform Active")
    print(f" Database:      SQLite (`campus.db`) Connected & Migrated")
    print(f" Web UI:        http://localhost:{PORT}/index.html")
    print(f" Status API:    http://localhost:{PORT}/api/status")
    print(f" SQL Runner:    POST http://localhost:{PORT}/api/sql/query")
    print("=" * 70)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        httpd.server_close()

if __name__ == "__main__":
    run()
