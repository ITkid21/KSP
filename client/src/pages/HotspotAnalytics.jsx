import { useState, useEffect } from 'react';
import { hotspots as hotspotApi } from '../services/api';

export default function HotspotAnalytics() {
  const [summary, setSummary] = useState(null);
  const [list, setList] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [riskFilter, setRiskFilter] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setErrorMsg('');
    try {
      const [s, h, cl] = await Promise.all([
        hotspotApi.getSummary(),
        hotspotApi.getAll(),
        hotspotApi.getClusters(),
      ]);
      setSummary(s);
      setList(Array.isArray(h) ? h : []);
      setClusters(Array.isArray(cl) ? cl : []);
    } catch (err) {
      setErrorMsg('Unable to load hotspot data. Please refresh the page or contact support.');
    } finally {
      setLoading(false);
    }
  }

  const fmt = n => (n != null ? Number(n).toLocaleString('en-IN') : '—');

  const filtered = riskFilter ? list.filter(h => h.risk_level === riskFilter) : list;

  if (loading) {
    return (
      <>
        <div className="page-header">
          <div><h2>Hotspot Analytics</h2></div>
        </div>
        <div className="page-body">
          <div className="loading"><div className="spinner"></div>Loading hotspot data...</div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Hotspot Analytics</h2>
          <div className="page-header-sub">Karnataka State Police — Crime Concentration Analysis</div>
        </div>
        <div className="btn-group">
          <select className="form-select" style={{ width: 140 }} value={riskFilter} onChange={e => setRiskFilter(e.target.value)}>
            <option value="">All Risk Levels</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="moderate">Moderate</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      <div className="page-body">
        {/* Page Introduction */}
        <div className="page-intro">
          <div className="page-intro-icon">🔥</div>
          <div className="page-intro-content">
            <div className="page-intro-title">Crime Hotspot Intelligence</div>
            <div className="page-intro-desc">
              <strong>Description:</strong> Advanced clustering analytics identifying physical regions with disproportionately high crime occurrences using geospatial coordinates and frequency indices.
              <br />
              <strong>Purpose:</strong> To establish micro-level hot zones to assist tactical patrol dispatch and deploy preventive police units to highly active coordinates.
              <br />
              <strong>Instructions:</strong> Review the KPI summaries and active hotspots list. Use the Risk filter in the top-right to isolate hotspots by threat classification.
            </div>
          </div>
        </div>

        {errorMsg && (
          <div className="error-banner" style={{ marginBottom: 16 }}>
            <span style={{ marginRight: 8 }}>⚠</span>{errorMsg}
          </div>
        )}

        {/* KPI Summary */}
        {summary && (
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-card-label">Total Hotspots</div>
              <div className="kpi-card-value">{fmt(summary.total)}</div>
              <div className="kpi-card-sub">Across Karnataka</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-card-label">Critical Zones</div>
              <div className="kpi-card-value" style={{ color: '#ef4444' }}>{fmt(summary.critical)}</div>
              <div className="kpi-card-sub">Immediate attention required</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-card-label">High Risk</div>
              <div className="kpi-card-value" style={{ color: '#f97316' }}>{fmt(summary.high)}</div>
              <div className="kpi-card-sub">Enhanced monitoring</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-card-label">Active Hotspots</div>
              <div className="kpi-card-value" style={{ color: '#3b82f6' }}>{fmt(summary.active)}</div>
              <div className="kpi-card-sub">Currently active</div>
            </div>
          </div>
        )}

        {/* Hotspot Table */}
        <div className="chart-card">
          <div className="chart-card-header">
            <div className="chart-card-title">Hotspot Records ({filtered.length})</div>
          </div>
          <div className="data-table-wrapper" style={{ maxHeight: 480 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>District</th>
                  <th>Crime Type</th>
                  <th>Risk Level</th>
                  <th>Risk Score</th>
                  <th>Incidents</th>
                  <th>Radius (km)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="empty-state">
                      <div className="empty-state-icon">📍</div>
                      <p>No hotspots found{riskFilter ? ` for "${riskFilter}" risk level` : ''}.</p>
                      {riskFilter && (
                        <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={() => setRiskFilter('')}>
                          Clear Filter
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  filtered.slice(0, 200).map((h, i) => (
                    <tr key={h.id || i}>
                      <td style={{ fontWeight: 600 }}>{h.district}</td>
                      <td>{h.crime_type}</td>
                      <td>
                        <span className={`badge badge-${h.risk_level === 'moderate' ? 'moderate' : h.risk_level}`}>
                          {h.risk_level}
                        </span>
                      </td>
                      <td>{typeof h.risk_score === 'number' ? (h.risk_score * 100).toFixed(0) + '%' : h.risk_score}</td>
                      <td>{fmt(h.incident_count)}</td>
                      <td>{h.radius_km}</td>
                      <td>
                        {h.is_active ? (
                          <span className="badge badge-success">Active</span>
                        ) : (
                          <span className="badge badge-moderate">Inactive</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Cluster Summary */}
        {clusters.length > 0 && (
          <div className="chart-card" style={{ marginTop: 20 }}>
            <div className="chart-card-header">
              <div className="chart-card-title">District Cluster Summary</div>
            </div>
            <div className="data-table-wrapper" style={{ maxHeight: 320 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>District</th>
                    <th>Overall Risk</th>
                    <th>Total Cases</th>
                    <th>Crime Types</th>
                  </tr>
                </thead>
                <tbody>
                  {clusters.slice(0, 30).map((c, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{c.district}</td>
                      <td><span className={`badge badge-${c.overall_risk}`}>{c.overall_risk}</span></td>
                      <td>{fmt(c.total_cases)}</td>
                      <td>{c.incident_types || c.crime_types?.length || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
