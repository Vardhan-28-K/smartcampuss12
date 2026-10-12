"""
NexusCampus OS (smaretcampussss) - Vercel Serverless Function Handler
Target: Vercel Python Serverless Runtime (@vercel/python)
Routes /api/* endpoints with automated SQLite in-memory / /tmp database migration.
"""

from http.server import BaseHTTPRequestHandler
import json
import os
import sqlite3
import time
import urllib.parse

# In Vercel serverless environment, /tmp is writable
if "VERCEL" in os.environ or os.name != "nt":
    DB_PATH = "/tmp/campus.db"
else:
    DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "campus.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_database():
    try:
        conn = get_db()
        cursor = conn.cursor()

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
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        """)

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
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        """)

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS sensor_telemetry (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            building_id TEXT NOT NULL,
            sensor_type TEXT NOT NULL CHECK (sensor_type IN ('energy', 'occupancy', 'temp', 'co2', 'acoustic', 'water')),
            value REAL NOT NULL,
            unit TEXT NOT NULL,
            timestamp TEXT DEFAULT CURRENT_TIMESTAMP
        );
        """)

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

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        """)

        cursor.execute("SELECT COUNT(*) FROM users;")
        if cursor.fetchone()[0] == 0:
            cursor.executemany("""
            INSERT INTO users (id, email, full_name, role, avatar_url, student_id, department, security_clearance_level)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            """, [
                ('a0000000-0000-0000-0000-000000000001', 'alex.mercer@nexus.edu', 'Alex Mercer', 'student', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150', 'STU-88219', 'Robotics & Autonomous Systems', 2),
                ('a0000000-0000-0000-0000-000000000002', 'evelyn.reed@nexus.edu', 'Dr. Evelyn Reed', 'faculty', 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150', 'FAC-4102', 'Cyber-Physical Security', 4),
                ('a0000000-0000-0000-0000-000000000003', 'marcus.vance@nexus.edu', 'Marcus Vance', 'admin', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150', 'ADM-001', 'Campus Infrastructure Ops', 5)
            ])

            cursor.executemany("""
            INSERT INTO buildings (id, code, name, location_lat, location_lng, total_floors, occupancy_pct, power_usage_kwh, hvac_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, [
                ('b001', 'ROB-03', 'Turing Robotics & AI Complex', 37.774500, -122.418200, 4, 82.5, 142.3, 'nominal'),
                ('b002', 'LIB-01', 'Cyber Commons & Central Library', 37.775200, -122.420500, 5, 68.0, 95.8, 'nominal'),
                ('b003', 'SCI-02', 'Quantum Computing Laboratory', 37.774000, -122.420000, 3, 91.0, 112.4, 'nominal'),
                ('b004', 'ENG-01', 'Main Engineering & Transit Hub', 37.775800, -122.419000, 4, 74.5, 62.0, 'nominal')
            ])

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

            cursor.executemany("""
            INSERT INTO attendance_logs (id, student_id, course_code, check_in_time, geofence_verified, distance_meters, client_ip)
            VALUES (?, ?, ?, datetime('now', ?), 1, ?, '10.24.11.85');
            """, [
                ('e001', 'STU-88219', 'ROB-420', '-2 hours', 11.4),
                ('e002', 'STU-88219', 'CYBER-501', '-1 day', 8.2),
                ('e003', 'STU-88219', 'AI-301', '-2 days', 14.8)
            ])

            cursor.executemany("""
            INSERT INTO system_settings (key, value) VALUES (?, ?);
            """, [
                ('power_saver', '0'),
                ('lockdown', '0'),
                ('hvac_boost', '0'),
                ('total_power_kwh', '412.5'),
                ('gate_scans_today', '1240')
            ])

        conn.commit()
        conn.close()
    except Exception as e:
        print("[DB-INIT] Warning:", e)

class handler(BaseHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data, indent=2).encode('utf-8'))

    def do_GET(self):
        init_database()
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        try:
            conn = get_db()
            cursor = conn.cursor()

            if path in ["/api/status", "/status", "/api/health", "/health"]:
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
                    "project_name": "smaretcampussss",
                    "deployment": "Vercel Serverless Function",
                    "database": "SQLite (Active Connection)",
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

            elif path in ["/api/buildings", "/buildings"]:
                cursor.execute("SELECT * FROM buildings ORDER BY code ASC;")
                rows = [dict(r) for r in cursor.fetchall()]
                self.send_json(rows)

            elif path in ["/api/facilities", "/facilities"]:
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

            elif path in ["/api/attendance/logs", "/attendance/logs"]:
                cursor.execute("""
                SELECT a.*, u.full_name as student_name 
                FROM attendance_logs a 
                LEFT JOIN users u ON a.student_id = u.student_id 
                ORDER BY a.check_in_time DESC LIMIT 50;
                """)
                rows = [dict(r) for r in cursor.fetchall()]
                self.send_json(rows)

            elif path in ["/api/users", "/users"]:
                cursor.execute("SELECT id, email, full_name, role, student_id, department, security_clearance_level FROM users;")
                rows = [dict(r) for r in cursor.fetchall()]
                self.send_json(rows)

            elif path in ["/api/schema", "/schema"]:
                schema_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "schema.sql")
                if not os.path.exists(schema_path):
                    schema_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "schema.sql")
                if os.path.exists(schema_path):
                    with open(schema_path, "r", encoding="utf-8") as f:
                        self.send_json({"schema_sql": f.read(), "source": "PostgreSQL / Supabase Schema File"})
                else:
                    self.send_json({"error": "Schema file not found"}, status=404)

            else:
                self.send_json({"error": f"Endpoint {path} not found"}, status=404)

            conn.close()
        except Exception as e:
            self.send_json({"error": str(e)}, status=500)

    def do_POST(self):
        init_database()
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length) if content_length > 0 else b'{}'
        try:
            data = json.loads(body.decode('utf-8'))
        except Exception:
            data = {}

        try:
            conn = get_db()
            cursor = conn.cursor()

            if path in ["/api/telemetry/action", "/telemetry/action"]:
                action = data.get("action")
                if action == "power_saver":
                    cursor.execute("SELECT value FROM system_settings WHERE key = 'power_saver';")
                    curr = cursor.fetchone()
                    new_val = '0' if (curr and curr[0] == '1') else '1'
                    cursor.execute("REPLACE INTO system_settings (key, value) VALUES ('power_saver', ?);", (new_val,))
                    new_power = '298.2' if new_val == '1' else '412.5'
                    cursor.execute("REPLACE INTO system_settings (key, value) VALUES ('total_power_kwh', ?);", (new_power,))
                    conn.commit()
                    self.send_json({"success": True, "action": "power_saver", "active": (new_val == '1'), "power_kwh": float(new_power)})

                elif action == "lockdown":
                    cursor.execute("SELECT value FROM system_settings WHERE key = 'lockdown';")
                    curr = cursor.fetchone()
                    new_val = '0' if (curr and curr[0] == '1') else '1'
                    cursor.execute("REPLACE INTO system_settings (key, value) VALUES ('lockdown', ?);", (new_val,))
                    cursor.execute("UPDATE buildings SET lockdown_status = ?;", (1 if new_val == '1' else 0,))
                    conn.commit()
                    self.send_json({"success": True, "action": "lockdown", "active": (new_val == '1')})

                elif action == "hvac_boost":
                    cursor.execute("SELECT value FROM system_settings WHERE key = 'hvac_boost';")
                    curr = cursor.fetchone()
                    new_val = '0' if (curr and curr[0] == '1') else '1'
                    cursor.execute("REPLACE INTO system_settings (key, value) VALUES ('hvac_boost', ?);", (new_val,))
                    cursor.execute("UPDATE buildings SET hvac_status = ?;", ('boosted' if new_val == '1' else 'nominal',))
                    conn.commit()
                    self.send_json({"success": True, "action": "hvac_boost", "active": (new_val == '1'), "co2_ppm": 375 if new_val == '1' else 420})
                else:
                    self.send_json({"error": "Invalid action"}, status=400)

            elif path in ["/api/gate-pass/scan", "/gate-pass/scan"]:
                cursor.execute("SELECT value FROM system_settings WHERE key = 'gate_scans_today';")
                row = cursor.fetchone()
                current_scans = int(row[0]) if row else 1240
                new_scans = current_scans + 1
                cursor.execute("REPLACE INTO system_settings (key, value) VALUES ('gate_scans_today', ?);", (str(new_scans),))
                conn.commit()
                self.send_json({
                    "verified": True,
                    "turnstile": "TURNSTILE-B04",
                    "gate_scans_today": new_scans,
                    "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
                })

            elif path in ["/api/facilities/book", "/facilities/book"]:
                facility_id = data.get("facility_id")
                attendees = int(data.get("attendees", 1))

                cursor.execute("SELECT * FROM facilities WHERE id = ?;", (facility_id,))
                facility = cursor.fetchone()
                if not facility:
                    self.send_json({"error": "Facility not found"}, status=404)
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

            elif path in ["/api/attendance/check-in", "/attendance/check-in"]:
                student_id = data.get("student_id", "STU-88219")
                course_code = data.get("course_code", "ROB-420")
                distance = float(data.get("distance_meters", 12.0))

                if distance > 50.0:
                    self.send_json({"success": False, "error": f"Geofence violation: Distance {distance}m exceeds 50m threshold"}, status=403)
                    return

                log_id = f"e{int(time.time()*1000)%1000000:06d}"
                check_in_time = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
                cursor.execute("""
                INSERT INTO attendance_logs (id, student_id, course_code, check_in_time, geofence_verified, distance_meters, client_ip)
                VALUES (?, ?, ?, ?, 1, ?, '127.0.0.1');
                """, (log_id, student_id, course_code, check_in_time, distance))
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

            elif path in ["/api/sql/query", "/sql/query"]:
                query = data.get("query", "").strip()
                if not query:
                    self.send_json({"error": "Query cannot be empty"}, status=400)
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
                self.send_json({"error": f"Endpoint {path} not found"}, status=404)

            conn.close()
        except Exception as e:
            self.send_json({"error": str(e)}, status=500)
