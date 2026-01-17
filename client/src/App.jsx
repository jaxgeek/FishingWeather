import React, { useState, useEffect } from 'react'
import 'chart.js/auto'
import { Line } from 'react-chartjs-2'

export default function App() {
  const [lat, setLat] = useState('37.7749')
  const [lon, setLon] = useState('-122.4194')
  const [stations, setStations] = useState([])
  const [selectedStation, setSelectedStation] = useState(null)
  const [solunar, setSolunar] = useState(null)
  const [weather, setWeather] = useState(null)
  const [tides, setTides] = useState(null)

  const apiBase = import.meta.env.VITE_API_BASE || 'http://localhost:4000'

  useEffect(() => {
    // fetch nearby stations (NE Florida)
    const loadStations = async () => {
      try {
        const res = await fetch(`${apiBase}/api/stations?region=ne-fl`)
        const j = await res.json()
        if (j && j.stations) setStations(j.stations)
      } catch (err) {
        console.warn('Failed to load stations', err)
      }
    }
    loadStations()
  }, [])

  const fetchSolunar = async () => {
    const res = await fetch(`${apiBase}/api/solunar?lat=${lat}&lon=${lon}`)
    const data = await res.json()
    setSolunar(data)
  }

  // automatically fetch solunar when station selection changes
  useEffect(() => {
    if (selectedStation) {
      fetchSolunar()
    }
  }, [selectedStation])

  const fetchWeather = async () => {
    const res = await fetch(`${apiBase}/api/weather?lat=${lat}&lon=${lon}`)
    const data = await res.json()
    setWeather(data)
  }

  const fetchTides = async () => {
    const res = await fetch(`${apiBase}/api/tides?lat=${lat}&lon=${lon}`)
    const data = await res.json()
    setTides(data)
  }

  return (
    <div style={{ fontFamily: 'Arial', padding: 20 }}>
      <h1>FishingWeather (scaffold)</h1>
      <div style={{ marginBottom: 10 }}>
        <label style={{ marginRight: 12 }}>Station:
          <select value={selectedStation ? selectedStation.id : ''} onChange={e => {
            const id = e.target.value
            const st = stations.find(s => s.id === id)
            setSelectedStation(st || null)
            if (st) {
              setLat(st.lat)
              setLon(st.lon)
            }
          }}>
            <option value="">-- select station (NE Florida) --</option>
            {stations.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.id})</option>
            ))}
          </select>
        </label>
        <label>Latitude: <input value={lat} onChange={e => setLat(e.target.value)} /></label>
        <label style={{ marginLeft: 8 }}>Longitude: <input value={lon} onChange={e => setLon(e.target.value)} /></label>
      </div>
      <div style={{ marginBottom: 12 }}>
        <button onClick={fetchSolunar}>Get Solunar</button>
        <button style={{ marginLeft: 8 }} onClick={fetchWeather}>Get Weather</button>
        <button style={{ marginLeft: 8 }} onClick={fetchTides}>Get Tides</button>
      </div>

      <section>
        <h2>Solunar (moon altitude chart)</h2>
        {solunar && solunar.samples ? (
          (() => {
            const labels = solunar.samples.map(s => s.time)
            const dataPoints = solunar.samples.map(s => s.altitude)
            const chartData = {
              labels,
              datasets: [
                { label: 'Moon altitude (°)', data: dataPoints, borderColor: 'rgba(153,102,255,1)', backgroundColor: 'rgba(153,102,255,0.2)', tension: 0.2 }
              ]
            }
            return (
              <div>
                <div style={{ maxWidth: 900 }}><Line data={chartData} /></div>
                <div style={{ marginTop: 12 }}>
                  <strong>Major / Minor feeding times</strong>
                  <ul>
                    {solunar.major && solunar.major.map((m, idx) => (
                      <li key={`maj-${idx}`}><strong>Major:</strong> {m.type.replace('major_', '')} — {m.window && `${m.window.start} → ${m.window.end}`}</li>
                    ))}
                    {solunar.minor && solunar.minor.map((m, idx) => (
                      <li key={`min-${idx}`}><strong>Minor:</strong> {m.type.replace('minor_', '')} — {m.window && `${m.window.start} → ${m.window.end}`}</li>
                    ))}
                  </ul>
                  <div style={{ fontSize: 12, color: '#555' }}><em>{solunar.algorithm && solunar.algorithm.description}</em></div>
                </div>
              </div>
            )
          })()
        ) : (
          <pre>—</pre>
        )}
      </section>

      <section>
        <h2>Weather (hourly temperature)</h2>
        {weather && weather.data && weather.data.hourly && (
          (() => {
            const times = weather.data.hourly.time || []
            const tempsC = weather.data.hourly.temperature_2m || []
            // convert C -> F for fisherman-friendly units
            const tempsF = tempsC.map(v => (v == null ? null : +(v * 9 / 5 + 32).toFixed(1)))
            const chartData = {
              labels: times,
              datasets: [
                {
                  label: 'Temperature (°F)',
                  data: tempsF,
                  borderColor: 'rgba(75,192,192,1)',
                  backgroundColor: 'rgba(75,192,192,0.2)',
                },
              ],
            }
            return <div style={{ maxWidth: 900 }}><Line data={chartData} /></div>
          })()
        )}
        {!weather && <pre>—</pre>}
      </section>

      <section>
        <h2>Tides (hourly)</h2>
        {tides && tides.tides && Array.isArray(tides.tides) && (
          (() => {
            // Filter tide points to current local date at 6-hour intervals (00,06,12,18)
            const isSameLocalDate = (isoStr) => {
              const d = new Date(isoStr)
              const today = new Date()
              return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate()
            }

            const all = tides.tides.map(t => ({ time: t.time, height: t.height_m }))
            const filtered = all.filter(item => {
              try {
                const d = new Date(item.time)
                return isSameLocalDate(item.time) && (d.getHours() % 6 === 0)
              } catch (e) {
                return false
              }
            })

            const use = (filtered.length > 0) ? filtered : all
            const times = use.map(t => t.time)
            const heights = use.map(t => t.height)
            const chartData = {
              labels: times,
              datasets: [
                {
                  label: 'Tide Height (m)',
                  data: heights,
                  borderColor: 'rgba(54,162,235,1)',
                  backgroundColor: 'rgba(54,162,235,0.2)',
                },
              ],
            }
            return <div style={{ maxWidth: 900 }}><Line data={chartData} /></div>
          })()
        )}
        {tides && tides.provider === 'noaa' && tides.tides && Array.isArray(tides.tides) && (
          <div style={{ marginTop: 8 }}>
            <strong>Source:</strong> NOAA station {tides.station && (tides.station.name || tides.station.id)} (distance {tides.distance_m} m)
            <div style={{ maxWidth: 900 }}>
              {(() => {
                // same 6-hour sampling logic for NOAA station chart
                const isSameLocalDate = (isoStr) => {
                  const d = new Date(isoStr)
                  const today = new Date()
                  return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate()
                }
                const all = tides.tides.map(t => ({ time: t.time, height: t.height_m }))
                const filtered = all.filter(item => {
                  try {
                    const d = new Date(item.time)
                    return isSameLocalDate(item.time) && (d.getHours() % 6 === 0)
                  } catch (e) {
                    return false
                  }
                })
                const use = (filtered.length > 0) ? filtered : all
                const times = use.map(t => t.time)
                const heights = use.map(t => t.height)
                const chartData = { labels: times, datasets: [{ label: 'Tide Height (m)', data: heights, borderColor: 'rgba(54,162,235,1)', backgroundColor: 'rgba(54,162,235,0.2)' }] }
                return <Line data={chartData} />
              })()}
            </div>
          </div>
        )}
        {!tides && <pre>—</pre>}
      </section>
    </div>
  )
}
