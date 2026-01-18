import React, { useState, useEffect } from 'react'
import 'chart.js/auto'
import { Line } from 'react-chartjs-2'
import './App.css'
import SunIcon from './assets/sun.svg'
import MoonIcon from './assets/moon.svg'
import TideIcon from './assets/tide.svg'
import BaitIcon from './assets/bait.svg'

export default function App() {
  const [lat, setLat] = useState('30.4')
  const [lon, setLon] = useState('-81.7')
  const [stations, setStations] = useState([])
  const [selectedStation, setSelectedStation] = useState(null)
  const [solunar, setSolunar] = useState(null)
  const [weather, setWeather] = useState(null)
  const [tides, setTides] = useState(null)
  const [recommendations, setRecommendations] = useState(null)

  const apiBase = import.meta.env.VITE_API_BASE || 'http://localhost:4000'

  useEffect(() => {
    const loadStations = async () => {
      try {
        const res = await fetch(`${apiBase}/api/stations?region=big-bend`)
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

  useEffect(() => { if (selectedStation) { setLat(selectedStation.lat); setLon(selectedStation.lon); fetchSolunar(); } }, [selectedStation])

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

  const fetchRecommendations = async () => {
    try {
      const res = await fetch(`${apiBase}/api/recommendations?lat=${lat}&lon=${lon}`)
      const data = await res.json()
      setRecommendations(data)
    } catch (err) { console.warn('Failed to load recommendations', err) }
  }

  return (
    <div className="app">
      <div className="header">
        <div className="title">FishingWeather — Big Bend</div>
        <div className="small">High-level bait suggestions · Rule-based</div>
      </div>

      <div className="controls">
        <label>Station:
          <select value={selectedStation ? selectedStation.id : ''} onChange={e => {
            const id = e.target.value
            const st = stations.find(s => s.id === id)
            setSelectedStation(st || null)
            if (!st) { setLat('30.4'); setLon('-81.7') }
          }}>
            <option value="">-- select station (Big Bend) --</option>
            {stations.map(s => (<option key={s.id} value={s.id}>{s.name}</option>))}
          </select>
        </label>

        <label>Latitude: <input value={lat} onChange={e => setLat(e.target.value)} /></label>
        <label>Longitude: <input value={lon} onChange={e => setLon(e.target.value)} /></label>

        <button onClick={fetchSolunar}>Solunar</button>
        <button onClick={fetchWeather}>Weather</button>
        <button onClick={fetchTides}>Tides</button>
        <button onClick={fetchRecommendations}>Recommendations</button>
      </div>

      <div className="grid">
        <div className="card">
          <div className="cardRow">
            <img src={MoonIcon} className="icon" alt="moon" />
            <div>
              <h3>Solunar</h3>
              <div className="small">Major windows: {solunar && solunar.major ? solunar.major.map(m => m.type.replace('major_', '')).join(', ') : '—'}</div>
            </div>
          </div>
          <div style={{marginTop:10}}>
            {solunar && solunar.samples ? (
              (() => {
                const labels = solunar.samples.map(s => s.time)
                const dataPoints = solunar.samples.map(s => s.altitude)
                const chartData = { labels, datasets: [{ label: 'Moon altitude (°)', data: dataPoints, borderColor: 'rgba(153,102,255,1)', backgroundColor: 'rgba(153,102,255,0.08)', tension: 0.2 }] }
                return <div style={{maxWidth: '100%'}}><Line data={chartData} /></div>
              })()
            ) : (<div className="small">No solunar data. Click <em>Solunar</em>.</div>)}
          </div>
        </div>

        <div className="card">
          <div className="cardRow">
            <img src={SunIcon} className="icon" alt="sun" />
            <div>
              <h3>Weather</h3>
              <div className="small">Hourly temperatures (°F)</div>
            </div>
          </div>
          <div style={{marginTop:10}}>
            {weather && weather.data && weather.data.hourly ? (
              (() => {
                const times = weather.data.hourly.time || []
                const tempsC = weather.data.hourly.temperature_2m || []
                const tempsF = tempsC.map(v => (v == null ? null : +(v * 9 / 5 + 32).toFixed(1)))
                const chartData = { labels: times, datasets: [{ label: 'Temp (°F)', data: tempsF, borderColor: 'rgba(75,192,192,1)', backgroundColor: 'rgba(75,192,192,0.06)' }] }
                return <div style={{maxWidth:'100%'}}><Line data={chartData} /></div>
              })()
            ) : (<div className="small">No weather data. Click <em>Weather</em>.</div>)}
          </div>
        </div>

        <div className="card">
          <div className="cardRow">
            <img src={TideIcon} className="icon" alt="tide" />
            <div>
              <h3>Tides</h3>
              <div className="small">Trend and sampled heights</div>
            </div>
          </div>
          <div style={{marginTop:10}}>
            {tides && tides.tides && tides.tides.length > 0 ? (
              <div>
                <div className="small">Source: {tides.provider}</div>
                {tides.tides && tides.tides.slice(0,6).map((t,i)=> (
                  <div key={i} className="small">{new Date(t.time).toLocaleString()}: {Number(t.height_m).toFixed(2)} m</div>
                ))}
              </div>
            ) : (<div className="small">No tide data. Click <em>Tides</em>.</div>)}
          </div>
        </div>

        <div className="card">
          <div className="cardRow">
            <img src={BaitIcon} className="icon" alt="bait" />
            <div>
              <h3>Recommendations</h3>
              <div className="small">Baits tailored by rules (weather, tide, solunar)</div>
            </div>
          </div>
          <div style={{marginTop:10}}>
            {recommendations && recommendations.recommendations && recommendations.recommendations.length > 0 ? (
              <ul className="recommendList">
                {recommendations.recommendations.map((r, i) => (
                  <li key={i}>
                    <img src={BaitIcon} className="baitIcon" alt="bait" />
                    <div>
                      <div style={{fontWeight:600}}>{r.bait} <span style={{fontSize:12,fontWeight:400,color:'#475569'}}>({r.confidence})</span></div>
                      <div className="small">{r.reason}</div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (<div className="small">No recommendations yet. Click <em>Recommendations</em>.</div>)}
            <div className="footerNote">Recommendations are high-level heuristics. Future versions will refine by species and water body.</div>
          </div>
        </div>
      </div>
    </div>
  )
}

