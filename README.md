# smaretcampussss - Smart Campus Web Application & Management Platform

**NexusCampus OS (`smaretcampussss`)** — Production-grade Smart Campus Management Platform optimized for instant zero-configuration deployment to **Vercel** with integrated Python serverless functions, SQLite/PostgreSQL relational schema, and client-side failover.

---

## ⚡ How to Deploy to Vercel (Step-by-Step)

### Option 1: Deploy with Vercel CLI (Fastest - 1 Command)

Open PowerShell inside this folder (`C:\Users\K VARDHAN\Downloads\smaretcampussss`):

```powershell
npx vercel
```

1. It will ask: `Set up and deploy "~/Downloads/smaretcampussss"?` ➔ Press **Enter (Y)**.
2. `Which scope do you want to deploy to?` ➔ Select your account.
3. `Link to existing project?` ➔ Press **N** (No).
4. `What’s your project’s name?` ➔ Type **`smaretcampussss`** (or press Enter).
5. `In which directory is your code located?` ➔ Press **Enter** (`./`).
6. Vercel will output your instant production URL:  
   👉 `https://smaretcampussss.vercel.app` (or `https://smaretcampussss-<username>.vercel.app`)

---

### Option 2: Deploy via GitHub & Vercel Dashboard

1. **Initialize Git & Push to GitHub:**
   ```powershell
   git init
   git add .
   git commit -m "Deploy smaretcampussss to Vercel"
   git branch -M main
   git remote add origin https://github.com/<your-username>/smaretcampussss.git
   git push -u origin main
   ```

2. **Import into Vercel:**
   - Go to [vercel.com/new](https://vercel.com/new).
   - Click **Import** next to your `smaretcampussss` repository.
   - Leave the build settings as default (`vercel.json` and `package.json` handle everything automatically).
   - Click **Deploy**.

---

## 📁 Project Structure (Vercel Ready)

```
smaretcampussss/
├── index.html                   # Core Responsive Single-Page UI
├── package.json                 # Sets project name to "smaretcampussss" on Vercel
├── vercel.json                  # Vercel Serverless routing & CORS configuration
├── requirements.txt             # Python runtime specification
│
├── api/
│   └── index.py                 # Vercel Python Serverless Function (/api/* endpoints)
│
├── css/
│   └── styles.css               # Cybersecurity dark theme & glassmorphism
│
├── js/
│   ├── app.js                   # Application kernel & role switching
│   ├── telemetry.js             # Real-time streaming IoT chart & actions
│   ├── security.js              # Zero-Trust HMAC-SHA1 TOTP & scanner simulator
│   ├── campus-map.js            # Leaflet GIS vector map & A* pathfinding
│   ├── ai-copilot.js            # Autonomous AI assistant & speech synthesis
│   ├── facilities.js            # Room reservations & capacity validation
│   ├── attendance.js            # Geofence-verified check-in & receipts
│   └── schema-viewer.js         # Interactive SQL query sandbox
│
├── lib/
│   ├── chart.umd.min.js         # Chart.js visualization engine
│   ├── leaflet.js & .css        # Geospatial GIS mapping engine
│   ├── lucide.min.js            # Cyber UI icons
│   └── qrcode.min.js            # Pure JS QR code generator
│
├── schema.sql                   # Full PostgreSQL / Supabase RLS schema
└── server.py                    # Local development server fallback
```

---

## 🎯 Verified Features on Vercel:
- **Serverless REST API:** Automatically handles `/api/status`, `/api/facilities`, `/api/attendance/logs`, `/api/gate-pass/scan`, and `/api/sql/query`.
- **Zero-Trust Security:** Ephemeral 30s HMAC-SHA1 QR code pass with anti-screenshot holography and Haversine distance geofence validation.
- **Geospatial GIS Map:** Leaflet dark vector layout with custom POIs, multi-floor plans, and A* shortest-path routing.
- **AI Copilot:** Conversational natural language queries with speech synthesis and telemetry triage.
