const express = require('express');
const SunCalc = require('suncalc');

const router = express.Router();

// helper: haversine distance (meters)
function haversine(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// GET /api/weather?lat={lat}&lon={lon}
router.get('/weather', async (req, res) => {
  try {
    const { lat, lon } = req.query;
    if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' });

    // Open-Meteo hourly forecast (temperature and precipitation)
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(
      lat
    )}&longitude=${encodeURIComponent(lon)}&hourly=temperature_2m,precipitation,winddirection_10m,windspeed_10m&timezone=auto`;

    // Node 18+ provides a global `fetch`. Ensure your Node version is >=18.
    const resp = await fetch(url);
    const data = await resp.json();

    return res.json({ provider: 'open-meteo', data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error', details: err.message });
  }
});

// GET /api/solunar?lat={lat}&lon={lon}&date={YYYY-MM-DD}
router.get('/solunar', (req, res) => {
  try {
    const { lat, lon, date } = req.query;
    if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' });
    const targetDate = date ? new Date(date + 'T00:00:00') : new Date();

    // compute solar and lunar times using suncalc
    const sunTimes = SunCalc.getTimes(targetDate, Number(lat), Number(lon));
    const moonTimes = SunCalc.getMoonTimes(targetDate, Number(lat), Number(lon));

    // Sample moon altitude throughout the day for charting and finding transit/antitransit
    const samples = [];
    const sampleIntervalMinutes = 10; // every 10 minutes
    const dayStart = new Date(targetDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    for (let t = dayStart.getTime(); t <= dayEnd.getTime(); t += sampleIntervalMinutes * 60 * 1000) {
      const dt = new Date(t);
      const pos = SunCalc.getMoonPosition(dt, Number(lat), Number(lon));
      const altitudeDeg = (pos && typeof pos.altitude === 'number') ? (pos.altitude * 180) / Math.PI : null;
      samples.push({ time: dt.toISOString(), altitude: altitudeDeg });
    }

    // Find transit (max altitude) and antitransit (min altitude)
    let transit = null;
    let antitransit = null;
    let maxAlt = -Infinity;
    let minAlt = Infinity;
    for (const s of samples) {
      if (s.altitude != null) {
        if (s.altitude > maxAlt) {
          maxAlt = s.altitude;
          transit = s.time;
        }
        if (s.altitude < minAlt) {
          minAlt = s.altitude;
          antitransit = s.time;
        }
      }
    }

    // Solunar algorithm (practical, algorithmic approach):
    // - Major feeding periods: when the moon is overhead (transit) and underfoot (antitransit).
    //   Represented as windows centered on transit/antitransit. Default window: +/- 60 minutes.
    // - Minor feeding periods: moonrise and moonset windows. Default window: +/- 30 minutes.
    // These are algorithmic approximations of traditional solunar rules and work without proprietary data.
    const windowMinutes = { major: 60, minor: 30 };
    const windowAround = (isoCenter, minutes) => {
      if (!isoCenter) return null;
      const c = new Date(isoCenter);
      return { start: new Date(c.getTime() - minutes * 60 * 1000).toISOString(), end: new Date(c.getTime() + minutes * 60 * 1000).toISOString() };
    };

    const major = [];
    if (transit) major.push({ type: 'major_transit', center: transit, window: windowAround(transit, windowMinutes.major) });
    if (antitransit) major.push({ type: 'major_antitransit', center: antitransit, window: windowAround(antitransit, windowMinutes.major) });

    const minor = [];
    if (moonTimes.rise) minor.push({ type: 'minor_moonrise', center: moonTimes.rise.toISOString(), window: windowAround(moonTimes.rise.toISOString(), windowMinutes.minor) });
    if (moonTimes.set) minor.push({ type: 'minor_moonset', center: moonTimes.set.toISOString(), window: windowAround(moonTimes.set.toISOString(), windowMinutes.minor) });

    const result = {
      date: targetDate.toISOString().slice(0, 10),
      sun: {
        sunrise: sunTimes.sunrise && sunTimes.sunrise.toISOString(),
        sunset: sunTimes.sunset && sunTimes.sunset.toISOString(),
      },
      moon: {
        moonrise: moonTimes.rise && moonTimes.rise.toISOString(),
        moonset: moonTimes.set && moonTimes.set.toISOString(),
        fraction: SunCalc.getMoonIllumination(targetDate).fraction,
      },
      samples, // sampled moon altitude for charting
      major, // algorithmic major feeding windows (transit/antitransit)
      minor, // algorithmic minor feeding windows (moonrise/moonset)
      algorithm: {
        description: 'Major windows = transit/antitransit (±60m). Minor windows = moonrise/moonset (±30m). Windows are algorithmic approximations of classic solunar theory.'
      }
    };

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error', details: err.message });
  }
});

// GET /api/tides?lat={lat}&lon={lon}
router.get('/tides', async (req, res) => {
  try {
    const { lat, lon } = req.query;
    if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' });

    // 1) Try Open-Meteo marine endpoint (best-effort)
    const today = new Date();
    const start = new Date(today);
    start.setDate(today.getDate() - 1);
    const end = new Date(today);
    end.setDate(today.getDate() + 2);
    const fmt = (d) => d.toISOString().slice(0, 10);

    const openMeteoUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${encodeURIComponent(
      lat
    )}&longitude=${encodeURIComponent(lon)}&hourly=water_level,water_temperature,wave_height&start_date=${fmt(start)}&end_date=${fmt(end)}&timezone=auto`;

    let resp = await fetch(openMeteoUrl);
    let data = await resp.json();

    if (data && data.hourly && (data.hourly.water_level || data.hourly.wave_height)) {
      // Normalize tide-like entries if present
      const times = data.hourly.time || [];
      const water = data.hourly.water_level || [];
      const tideEntries = times.map((t, i) => ({ time: t, height_m: water[i] ?? null }));
      return res.json({ provider: 'open-meteo-marine', station: null, tides: tideEntries, raw: data });
    }

    // 2) Fallback: NOAA CO-OPS (US-only) — find nearest station and request predictions
    // This works only for locations near US NOAA stations.
    try {
      const stationsUrl = 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?units=metric';
      const sresp = await fetch(stationsUrl);
      const sdata = await sresp.json();
      const stations = (sdata && sdata.stations) || [];

      // find nearest station
      let best = null;
      let bestDist = Infinity;
      for (const st of stations) {
        if (!st.lat || !st.lng) continue;
        const d = haversine(Number(lat), Number(lon), Number(st.lat), Number(st.lng));
        if (d < bestDist) {
          bestDist = d;
          best = st;
        }
      }

      if (!best) {
        return res.json({ provider: 'none', tides: [], note: 'no nearby NOAA stations found' });
      }

      // request predictions for station for the date window
      const begin = fmt(start).replace(/-/g, '');
      const finish = fmt(end).replace(/-/g, '');
      const predUrl = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?begin_date=${begin}&end_date=${finish}&station=${best.id}&product=predictions&datum=MLLW&units=metric&time_zone=lst_ldt&format=json`;

      const presp = await fetch(predUrl);
      const pdata = await presp.json();

      // NOAA API sometimes returns an object with a `predictions` array, or the array directly.
      const extractArray = (obj) => {
        if (!obj) return null;
        if (Array.isArray(obj)) return obj;
        if (Array.isArray(obj.predictions)) return obj.predictions;
        if (Array.isArray(obj.data)) return obj.data;
        if (Array.isArray(obj.observations)) return obj.observations;
        return null;
      };

      const predArray = extractArray(pdata);
      if (predArray && predArray.length > 0) {
        const tideEntries = predArray.map((p) => ({ time: p.t || p.time || p.dt || p.timestamp, height_m: Number(p.v || p.value || p.height) }));
        return res.json({ provider: 'noaa', station: best, distance_m: Math.round(bestDist), tides: tideEntries });
      }

      // If predictions not available, try recent observed water levels for the nearest station
      const obsUrl = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?begin_date=${begin}&end_date=${finish}&station=${best.id}&product=water_level&datum=MLLW&units=metric&time_zone=lst_ldt&format=json`;
      const obResp = await fetch(obsUrl);
      const obData = await obResp.json();
      const obsArray = extractArray(obData);
      if (obsArray && obsArray.length > 0) {
        const tideEntries = obsArray.map((p) => ({ time: p.t || p.time || p.dt || p.timestamp, height_m: Number(p.v || p.value || p.height) }));
        return res.json({ provider: 'noaa-observed', station: best, distance_m: Math.round(bestDist), tides: tideEntries });
      }
    } catch (noaaErr) {
      // ignore NOAA errors and continue to return best-effort message below
      console.warn('NOAA tide lookup failed', noaaErr && noaaErr.message);
    }

    // nothing available
    return res.json({ provider: 'none', tides: [], note: 'no tide data available for this location using configured free providers' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error', details: err.message });
  }
});

// GET /api/stations?region=big-bend
// Returns a list of NOAA stations filtered to the Big Bend region of Florida (best-effort bounding box)
let stationsCache = { ts: 0, stations: null };
router.get('/stations', async (req, res) => {
  try {
    const { region } = req.query;

    // For now we only support closed region key `big-bend` (Florida Big Bend)
    // Bounding box roughly covers the Big Bend / Nature Coast: lat 29.0 -> 31.0, lon -85.5 -> -82.0
    const bbox = { minLat: 29.0, maxLat: 31.0, minLon: -85.5, maxLon: -82.0 };

    // Cache stations for 24h to avoid repeated large downloads
    const now = Date.now();
    if (!stationsCache.stations || now - stationsCache.ts > 24 * 60 * 60 * 1000) {
      const stationsUrl = 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?units=metric';
      const sresp = await fetch(stationsUrl);
      const sdata = await sresp.json();
      stationsCache.stations = (sdata && sdata.stations) || [];
      stationsCache.ts = now;
    }

    const filtered = stationsCache.stations.filter((st) => {
      const lat = Number(st.lat);
      const lon = Number(st.lng);
      if (Number.isNaN(lat) || Number.isNaN(lon)) return false;
      return lat >= bbox.minLat && lat <= bbox.maxLat && lon >= bbox.minLon && lon <= bbox.maxLon;
    });

    // Map to small footprint
    const payload = filtered.map((st) => ({ id: st.id, name: st.name, lat: st.lat, lon: st.lng }));
    return res.json({ provider: 'noaa-mdapi', region: region || 'big-bend', count: payload.length, stations: payload });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error', details: err.message });
  }
});

// GET /api/recommendations?lat={lat}&lon={lon}
// Returns simple, high-level bait recommendations based on weather, tides, and solunar trends.
router.get('/recommendations', async (req, res) => {
  try {
    const { lat, lon } = req.query;
    if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' });

    // build a base URL that points back at this server so we can reuse our existing endpoints
    const base = `${req.protocol}://${req.get('host')}`;

    // fetch current data from our own endpoints (best-effort aggregation)
    const [weatherResp, solunarResp, tidesResp] = await Promise.all([
      fetch(`${base}/api/weather?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`).then(r => r.json()).catch(() => null),
      fetch(`${base}/api/solunar?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`).then(r => r.json()).catch(() => null),
      fetch(`${base}/api/tides?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`).then(r => r.json()).catch(() => null),
    ]);

    const now = new Date();

    // helper: check if now is inside an iso window {start,end}
    const isNowInIsoWindow = (w) => {
      if (!w || !w.start || !w.end) return false;
      const s = new Date(w.start);
      const e = new Date(w.end);
      return now >= s && now <= e;
    };

    // solunar summary
    const solunarSummary = { inMajor: false, inMinor: false };
    try {
      if (solunarResp) {
        if (Array.isArray(solunarResp.major)) {
          solunarSummary.inMajor = solunarResp.major.some(m => isNowInIsoWindow(m.window));
        }
        if (Array.isArray(solunarResp.minor)) {
          solunarSummary.inMinor = solunarResp.minor.some(m => isNowInIsoWindow(m.window));
        }
      }
    } catch (e) {
      // ignore solunar parse errors
    }

    // weather summary: pick nearest hour's values
    let weatherSummary = { temp_c: null, temp_f: null, precip_mm: null, wind_kmh: null };
    try {
      if (weatherResp && weatherResp.data && weatherResp.data.hourly) {
        const times = weatherResp.data.hourly.time || [];
        const temps = weatherResp.data.hourly.temperature_2m || [];
        const prec = weatherResp.data.hourly.precipitation || [];
        const ws = weatherResp.data.hourly.windspeed_10m || [];

        // find nearest index to now (by hour)
        let bestIdx = 0;
        let bestDiff = Infinity;
        for (let i = 0; i < times.length; i++) {
          const d = new Date(times[i]);
          const diff = Math.abs(d - now);
          if (diff < bestDiff) {
            bestDiff = diff;
            bestIdx = i;
          }
        }
        const tc = temps[bestIdx];
        weatherSummary.temp_c = typeof tc === 'number' ? tc : null;
        weatherSummary.temp_f = (typeof tc === 'number') ? +(tc * 9 / 5 + 32).toFixed(1) : null;
        weatherSummary.precip_mm = prec[bestIdx] ?? null;
        weatherSummary.wind_kmh = ws[bestIdx] ?? null;
      }
    } catch (e) {
      // ignore
    }

    // tide summary: determine rising/falling by comparing nearest points
    let tideSummary = { trend: 'unknown', nearestHeight: null };
    try {
      if (tidesResp && Array.isArray(tidesResp.tides) && tidesResp.tides.length > 1) {
        const arr = tidesResp.tides.map(t => ({ time: new Date(t.time), height: Number(t.height_m || t.height || t.v || 0) }));
        // find nearest index
        let bestIdx = 0;
        let bestDiff = Infinity;
        for (let i = 0; i < arr.length; i++) {
          const diff = Math.abs(arr[i].time - now);
          if (diff < bestDiff) {
            bestDiff = diff;
            bestIdx = i;
          }
        }
        tideSummary.nearestHeight = arr[bestIdx].height;
        // compare to next and previous to see trend
        const prev = arr[Math.max(0, bestIdx - 1)];
        const next = arr[Math.min(arr.length - 1, bestIdx + 1)];
        if (next && prev) {
          const slope = ((next.height - prev.height) / ((next.time - prev.time) / 1000 / 3600)); // m per hour
          tideSummary.trend = slope > 0 ? 'rising' : (slope < 0 ? 'falling' : 'stable');
        }
      }
    } catch (e) {
      // ignore
    }

    // simple rules engine: build recommendations list
    const recommendations = [];

    // Rule: Major solunar window -> promote live/cut baits
    if (solunarSummary.inMajor) {
      recommendations.push({ bait: 'Live/Cut Bait', reason: 'Currently inside major solunar feeding window (transit/antitransit)', confidence: 'high' });
    }

    // Rule: Minor window -> increase likelihood of active feeding
    if (solunarSummary.inMinor) {
      recommendations.push({ bait: 'Shrimp / Small live baits', reason: 'Minor solunar period (moonrise/moonset) — increased activity', confidence: 'medium' });
    }

    // Rule: tide trend influences bait type
    if (tideSummary.trend === 'rising') {
      recommendations.push({ bait: 'Soft plastics / Shrimp', reason: 'Incoming tide / rising — bait moves with current, soft plastics and shrimp often work well', confidence: 'medium' });
    } else if (tideSummary.trend === 'falling') {
      recommendations.push({ bait: 'Jigs / Bottom rigs', reason: 'Falling tide — fish often concentrate in channels and holes; try bottom presentations', confidence: 'medium' });

    }

    // Rule: temperature bands
    if (weatherSummary.temp_c != null) {
      const t = weatherSummary.temp_c;
      if (t < 10) { // <50F
        recommendations.push({ bait: 'Slow jigs / Spoons', reason: `Cold water (${weatherSummary.temp_f}°F) — use slow, weighty presentations`, confidence: 'medium' });
      } else if (t >= 10 && t < 21) { // 50-70F
        recommendations.push({ bait: 'Soft plastics / Live bait', reason: `Moderate water (${weatherSummary.temp_f}°F) — soft plastics and live bait effective`, confidence: 'high' });
      } else { // >70F
        recommendations.push({ bait: 'Topwater / Surface plugs', reason: `Warm water (${weatherSummary.temp_f}°F) — surface action can be productive`, confidence: 'medium' });
      }
    }

    // Rule: wind > 20 km/h -> heavier and larger baits
    if (weatherSummary.wind_kmh != null && weatherSummary.wind_kmh > 20) {
      recommendations.push({ bait: 'Heavier jigs / spoons', reason: `Windy conditions (${weatherSummary.wind_kmh} km/h) — use heavier, castable baits`, confidence: 'medium' });
    }

    // Rule: precipitation discourages topwater
    if (weatherSummary.precip_mm != null && weatherSummary.precip_mm > 1) {
      recommendations.push({ bait: 'Subsurface baits (soft plastics, jigs)', reason: `Rainy conditions — fish may move subsurface`, confidence: 'low' });
    }

    // de-duplicate by bait name keeping highest confidence (simple approach)
    const byBait = {};
    for (const r of recommendations) {
      const key = r.bait;
      const rank = r.confidence === 'high' ? 3 : (r.confidence === 'medium' ? 2 : 1);
      if (!byBait[key] || rank > byBait[key].rank) {
        byBait[key] = { bait: r.bait, reason: r.reason, confidence: r.confidence, rank };
      }
    }

    const final = Object.values(byBait).sort((a, b) => b.rank - a.rank).map(x => ({ bait: x.bait, reason: x.reason, confidence: x.confidence }));

    return res.json({ provider: 'rule-based', recommendations: final, weather: weatherSummary, tides: tideSummary, solunar: solunarSummary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error', details: err.message });
  }
});

module.exports = router;
