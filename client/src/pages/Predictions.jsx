import { useState, useEffect } from 'react';

const API_URL = '/api';

export default function Predictions() {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [data, setData] = useState({ list: [], summary: null });
  const [user, setUser] = useState(null);
  
  // Filters
  const [district, setDistrict] = useState('');
  const [crimeType, setCrimeType] = useState('');

  const fetchPredictions = async () => {
    setLoading(true);
    const token = localStorage.getItem('ksp_token');
    const headers = { 'Authorization': `Bearer ${token}` };

    try {
      const queryParams = new URLSearchParams();
      if (district) queryParams.append('district', district);
      if (crimeType) queryParams.append('crime_type', crimeType);

      const [listRes, summaryRes] = await Promise.all([
        fetch(`${API_URL}/predictions?${queryParams.toString()}`, { headers }),
        fetch(`${API_URL}/predictions/summary`, { headers })
      ]);

      const [list, summary] = await Promise.all([
        listRes.json(),
        summaryRes.json()
      ]);

      setData({ list, summary });
    } catch (err) {
      console.error('Error fetching predictions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('ksp_user'));
    setUser(u);
    fetchPredictions();
  }, [district, crimeType]);

  const handleGenerate = async () => {
    if (!window.confirm('Are you sure you want to run the prediction model? This will replace existing predictions.')) return;
    
    setGenerating(true);
    const token = localStorage.getItem('ksp_token');
    try {
      const res = await fetch(`${API_URL}/predictions/generate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await res.json();
      if (res.ok) {
        alert(result.message);
        fetchPredictions();
      } else {
        alert(result.error || 'Generation failed');
      }
    } catch (err) {
      alert('Error generating predictions');
    } finally {
      setGenerating(false);
    }
  };

  const getRiskBadge = (score) => {
    if (score >= 0.8) return <span className="badge badge-critical">Critical ({score})</span>;
    if (score >= 0.6) return <span className="badge badge-high">High ({score})</span>;
    if (score >= 0.4) return <span className="badge badge-moderate">Moderate ({score})</span>;
    return <span className="badge badge-low">Low ({score})</span>;
  };

  if (loading && data.list.length === 0) {
    return <div className="loading"><div className="spinner"></div>Loading Predictive Models...</div>;
  }

  const uniqueDistricts = [...new Set(data.list.map(p => p.district))];
  const uniqueTypes = [...new Set(data.list.map(p => p.predicted_crime_type))];

  return (
    <div className="page-body">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold' }}>Predictive Policing</h2>
          <p style={{ fontSize: '12px', color: '#94a3b8' }}>AI-driven forecast models for proactive deployment</p>
        </div>
        
        {user && (user.role === 'super_admin' || user.role === 'analyst') && (
          <button 
            className="btn btn-primary" 
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? 'Running Model...' : 'Run New Prediction Model'}
          </button>
        )}
      </div>

      {data.summary && (
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-card-label">High Risk Predictions</div>
            <div className="kpi-card-value" style={{ color: '#ef4444' }}>{data.summary.highRiskCount}</div>
            <div className="kpi-card-sub">Hotspots with score ≥ 0.7</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-card-label">Top Predicted District</div>
            <div className="kpi-card-value">
              {data.summary.topDistricts[0] ? data.summary.topDistricts[0].district : 'N/A'}
            </div>
            <div className="kpi-card-sub">
              Avg Risk: {data.summary.topDistricts[0] ? data.summary.topDistricts[0].avg_risk : '0'}
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-card-label">Highest Threat Crime Type</div>
            <div className="kpi-card-value" style={{ fontSize: '18px' }}>
              {data.summary.topCrimeTypes[0] ? data.summary.topCrimeTypes[0].crime_type : 'N/A'}
            </div>
            <div className="kpi-card-sub">
              Avg Risk: {data.summary.topCrimeTypes[0] ? data.summary.topCrimeTypes[0].avg_risk : '0'}
            </div>
          </div>
        </div>
      )}

      <div className="filter-bar">
        <div className="form-group">
          <label className="form-label">District Filter</label>
          <select className="form-select" value={district} onChange={e => setDistrict(e.target.value)}>
            <option value="">All Districts</option>
            {uniqueDistricts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Crime Type Filter</label>
          <select className="form-select" value={crimeType} onChange={e => setCrimeType(e.target.value)}>
            <option value="">All Crime Types</option>
            {uniqueTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>District</th>
              <th>Predicted Crime Type</th>
              <th>Month / Year</th>
              <th>Risk Score</th>
              <th>Confidence</th>
              <th>Model Version</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {data.list.slice(0, 100).map(pred => (
              <tr key={pred.id}>
                <td>{pred.district}</td>
                <td><strong>{pred.predicted_crime_type}</strong></td>
                <td>{pred.predicted_month} {pred.predicted_year}</td>
                <td>{getRiskBadge(pred.risk_score)}</td>
                <td>{(pred.confidence_score * 100).toFixed(1)}%</td>
                <td><span className="badge badge-info">{pred.model_version}</span></td>
                <td>
                  <button className="btn btn-sm btn-secondary">Deploy Units</button>
                </td>
              </tr>
            ))}
            {data.list.length === 0 && (
              <tr>
                <td colSpan="7" className="empty-state">
                  No predictions found. Run the prediction model to generate forecasts.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
