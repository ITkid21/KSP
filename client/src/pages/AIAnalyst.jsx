import { useState, useEffect } from 'react';

const API_URL = '/api';

export default function AIAnalyst() {
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchInsights = async () => {
    setLoading(true);
    const token = localStorage.getItem('ksp_token');
    try {
      const res = await fetch(`${API_URL}/ai/insights`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setInsights(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInsights();
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    const token = localStorage.getItem('ksp_token');
    try {
      const res = await fetch(`${API_URL}/ai/generate-insights`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        alert('Insights generated successfully!');
        fetchInsights();
      } else {
        alert('Failed to generate insights');
      }
    } catch (err) {
      console.error(err);
      alert('Error generating insights');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="page-body">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold' }}>AI Analyst</h2>
          <p style={{ fontSize: '12px', color: '#94a3b8' }}>Automated anomaly detection and strategic recommendations</p>
        </div>
        <button className="btn btn-primary" onClick={handleGenerate} disabled={generating}>
          {generating ? 'Analyzing Data...' : 'Run Analysis AI'}
        </button>
      </div>

      {loading && insights.length === 0 ? (
        <div className="loading"><div className="spinner"></div>Loading Insights...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
          {insights.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🧠</div>
              <h3>No insights generated yet</h3>
              <p>Click "Run Analysis AI" to scan the database for trends and anomalies.</p>
            </div>
          ) : (
            <>
              {/* Critical & Warning section */}
              <div className="chart-card">
                <div className="chart-card-header">
                  <div className="chart-card-title" style={{ color: '#ef4444' }}>Critical Alerts & Warnings</div>
                </div>
                {insights.filter(i => i.severity === 'critical' || i.severity === 'warning').map(insight => (
                  <div key={insight.id} className={`insight-card ${insight.severity}`}>
                    <div className="insight-card-title">{insight.title}</div>
                    <div className="insight-card-desc">{insight.description}</div>
                    <div className="insight-card-meta">
                      <span className={`badge badge-${insight.severity}`}>{insight.insight_type}</span>
                      {insight.crime_type && <span className="badge badge-info">{insight.crime_type.substring(0, 20)}</span>}
                      {insight.district && <span className="badge badge-warning">{insight.district}</span>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Info & Success section */}
              <div className="chart-card">
                <div className="chart-card-header">
                  <div className="chart-card-title">Observations & Trends</div>
                </div>
                {insights.filter(i => i.severity === 'info' || i.severity === 'success').map(insight => (
                  <div key={insight.id} className={`insight-card ${insight.severity}`}>
                    <div className="insight-card-title">{insight.title}</div>
                    <div className="insight-card-desc">{insight.description}</div>
                    <div className="insight-card-meta">
                      <span className={`badge badge-${insight.severity}`}>{insight.insight_type}</span>
                      {insight.crime_type && <span className="badge badge-info">{insight.crime_type.substring(0, 20)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
