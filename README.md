# FishingWeather

Minimal scaffold for FishingWeather — a fisherman's helper: weather, solunar times, and tides.

Purpose
- React SPA frontend (Vite)
- Node BFF (Express) providing concise APIs: `/api/weather`, `/api/solunar`, `/api/tides`
- Free integrations: Open-Meteo for weather (and attempted tides), `suncalc` (npm) for solunar calculations

What I scaffolded
- `client/` — Vite + React app (simple UI to input lat/lon and fetch data)
- `server/` — Node + Express BFF with API routes and simple implementations
- `.vscode/extensions.json` — recommended extensions
- `.gitignore` and basic project files

Notes about integrations
- Weather: uses Open-Meteo free API (no key).
- Solunar: uses `suncalc` for sun/moon events and calculates major/minor feeding windows (basic algorithm in scaffold).
- Tides: the server first attempts Open-Meteo marine `water_level` data; if that is not available for the location it falls back to NOAA CO-OPS station predictions (US-only, no API key). Availability varies by region — consider adding a region-specific free tide provider for better global coverage.

Get started (PowerShell)

# From project root
cd c:\Users\bear_\Desktop\Development\Projects\FishingWeather

# Install server deps
cd server
npm install

# In another terminal: install client deps
cd ..\client
npm install

# Run server (PowerShell)
cd ..\server
npm run dev

# Run client (PowerShell)
cd ..\client
npm run dev

API endpoints
- `GET /api/weather?lat={lat}&lon={lon}` — hourly weather forecast (Open-Meteo)
- `GET /api/solunar?lat={lat}&lon={lon}&date={YYYY-MM-DD}` — solunar times for date
- `GET /api/tides?lat={lat}&lon={lon}` — tide predictions (best-effort using Open-Meteo/marine)

Notes on charts
- The client uses `chart.js` + `react-chartjs-2` to render hourly temperature and tide height charts. Install client deps with `npm install` in `client/` before running the Vite dev server.

Switching to C# BFF
- Server is intentionally small. If you prefer a C# BFF (ASP.NET Core), keep the same API contract in `server/openapi.json` and implement controllers accordingly.

Next steps I can do for you
- Implement more accurate tide provider integration (free) for your target region.
- Add TypeScript types and OpenAPI generation.
- Add a UI with day/hour breakdown and charts.

