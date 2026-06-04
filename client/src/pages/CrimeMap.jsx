import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import { map as mapApi } from '../services/api';
import 'leaflet/dist/leaflet.css';

const RISK_COLORS = { critical: '#ef4444', high: '#f97316', moderate: '#f59e0b', medium: '#f59e0b', low: '#10b981' };
const KARNATAKA_CENTER = [14.5, 76.0];

function HeatmapLayer({ points }) {
  const map = useMap();
  const layerRef = useRef(null);

  useEffect(() => {
    if (!points || points.length === 0) return;
    // Use circle markers as heatmap alternative (no native dep needed)
    if (layerRef.current) { layerRef.current.forEach(l => map.removeLayer(l)); }
    const layers = [];
    points.forEach(p => {
      const intensity = Math.min((p.cases || 0) / 5000, 1);
      const radius = 8 + intensity * 30;
      const color = intensity > 0.7 ? '#ef4444' : intensity > 0.4 ? '#f97316' : intensity > 0.2 ? '#f59e0b' : '#10b981';
      const circle = window.L.circleMarker([p.lat, p.lng], {
        radius, fillColor: color, color: 'transparent', fillOpacity: 0.35, weight: 0
      }).addTo(map);
      circle.bindPopup(`<strong>${p.district}</strong><br/>${p.crime_type}<br/>Cases: ${(p.cases||0).toLocaleString()}<br/>Severity: ${p.severity}`);
      layers.push(circle);
    });
    layerRef.current = layers;
    return () => { layers.forEach(l => map.removeLayer(l)); };
  }, [points, map]);

  return null;
}

export default function CrimeMap() {
  const [locations, setLocations] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [heatmapData, setHeatmapData] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [crimeTypes, setCrimeTypes] = useState([]);
  const [filters, setFilters] = useState({ crime_type: '', district: '', severity: '', layer: 'markers' });
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadInitialData(); }, []);

  useEffect(() => {
    const params = {};
    if (filters.crime_type) params.crime_type = filters.crime_type;
    if (filters.district) params.district = filters.district;
    if (filters.severity) params.severity = filters.severity;
    mapApi.getLocations(params).then(setLocations).catch(console.error);
    mapApi.getHeatmapData(filters.crime_type || undefined).then(setHeatmapData).catch(console.error);
  }, [filters.crime_type, filters.district, filters.severity]);

  async function loadInitialData() {
    try {
      const [locs, cl, heat, dist, ct] = await Promise.all([
        mapApi.getLocations(), mapApi.getClusters(), mapApi.getHeatmapData(),
        mapApi.getDistricts(), mapApi.getCrimeTypes()
      ]);
      setLocations(locs); setClusters(cl); setHeatmapData(heat);
      setDistricts(dist); setCrimeTypes(ct);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  const updateFilter = (key, val) => setFilters(prev => ({ ...prev, [key]: val }));

  if (loading) return <><div className="page-header"><h2>Crime Map</h2></div><div className="page-body"><div className="loading"><div className="spinner"></div>Loading map data...</div></div></>;

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Crime Map & Hotspot Visualization</h2>
          <div className="page-header-sub">OpenStreetMap with Leaflet.js — District-level crime mapping</div>
        </div>
        <div className="btn-group">
          <span className="badge badge-info" style={{padding:'4px 10px',fontSize:11}}>📍 {locations.length} locations</span>
          <span className="badge badge-critical" style={{padding:'4px 10px',fontSize:11}}>🔥 {clusters.filter(c=>c.overall_risk==='critical').length} critical zones</span>
        </div>
      </div>

      <div className="page-body" style={{padding:16}}>
        {/* Filters */}
        <div className="filter-bar">
          <div className="form-group">
            <label className="form-label">Layer</label>
            <select className="form-select" value={filters.layer} onChange={e => updateFilter('layer', e.target.value)}>
              <option value="markers">Crime Markers</option>
              <option value="heatmap">Heatmap</option>
              <option value="clusters">District Clusters</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Crime Type</label>
            <select className="form-select" value={filters.crime_type} onChange={e => updateFilter('crime_type', e.target.value)}>
              <option value="">All Types</option>
              {crimeTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">District</label>
            <select className="form-select" value={filters.district} onChange={e => updateFilter('district', e.target.value)}>
              <option value="">All Districts</option>
              {districts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Severity</label>
            <select className="form-select" value={filters.severity} onChange={e => updateFilter('severity', e.target.value)}>
              <option value="">All</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        {/* Map + Sidebar */}
        <div className="map-layout">
          <div className="map-layout-main">
            <MapContainer center={KARNATAKA_CENTER} zoom={7} className="map-container" style={{height:'100%',minHeight:550}}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/">OSM</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              />

              {filters.layer === 'heatmap' && <HeatmapLayer points={heatmapData} />}

              {filters.layer === 'markers' && locations.map((loc, i) => (
                <CircleMarker key={i} center={[loc.latitude, loc.longitude]}
                  radius={Math.max(5, Math.min((loc.cases||0)/500, 18))}
                  fillColor={RISK_COLORS[loc.severity] || '#3b82f6'}
                  color={RISK_COLORS[loc.severity] || '#3b82f6'}
                  weight={1} fillOpacity={0.7}>
                  <Popup>
                    <strong>{loc.district}</strong><br/>
                    Type: {loc.crime_type}<br/>
                    Cases: {(loc.cases||0).toLocaleString()}<br/>
                    Severity: <span style={{color:RISK_COLORS[loc.severity]}}>{loc.severity}</span><br/>
                    Risk: {loc.overall_risk}
                  </Popup>
                </CircleMarker>
              ))}

              {filters.layer === 'clusters' && clusters.map((cl, i) => (
                <CircleMarker key={i} center={[cl.latitude, cl.longitude]}
                  radius={Math.max(12, Math.min(cl.total_cases/2000, 35))}
                  fillColor={RISK_COLORS[cl.overall_risk] || '#3b82f6'}
                  color="#fff" weight={2} fillOpacity={0.6}>
                  <Popup>
                    <strong>{cl.district}</strong><br/>
                    Total Cases: {(cl.total_cases||0).toLocaleString()}<br/>
                    Risk: <span style={{color:RISK_COLORS[cl.overall_risk]}}>{cl.overall_risk}</span><br/>
                    Crime Types: {cl.incident_types}<br/>
                    <small>{cl.crime_types?.join(', ')}</small>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>

          {/* Sidebar */}
          <div className="map-layout-sidebar">
            <div className="chart-card" style={{marginBottom:12}}>
              <div className="chart-card-title" style={{marginBottom:10}}>Risk Legend</div>
              {[{label:'Critical',color:'#ef4444'},{label:'High',color:'#f97316'},{label:'Moderate',color:'#f59e0b'},{label:'Low',color:'#10b981'}].map(r => (
                <div key={r.label} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6,fontSize:12}}>
                  <span style={{width:12,height:12,borderRadius:'50%',background:r.color,flexShrink:0}}></span>
                  <span style={{color:'#94a3b8'}}>{r.label} Risk</span>
                </div>
              ))}
            </div>

            <div className="chart-card" style={{marginBottom:12}}>
              <div className="chart-card-title" style={{marginBottom:10}}>Top Hotspots</div>
              {clusters.slice(0, 8).map((c, i) => (
                <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:'1px solid #1e293b',fontSize:12}}>
                  <div>
                    <div style={{fontWeight:600,color:'#e2e8f0'}}>{c.district}</div>
                    <div style={{fontSize:10,color:'#64748b'}}>{c.incident_types} crime types</div>
                  </div>
                  <span className={`badge badge-${c.overall_risk}`}>{(c.total_cases||0).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
