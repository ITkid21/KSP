import { useState, useEffect } from 'react';

const API_URL = '/api';

export default function AIAnalyst() {
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

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
      } else {
        setErrorMsg('Unable to load insights. Please try again.');
      }
    } catch (err) {
      setErrorMsg('Unable to connect to the server. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInsights();
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    setErrorMsg('');
    setSuccessMsg('');
    const token = localStorage.getItem('ksp_token');
    try {
      const res = await fetch(`${API_URL}/ai/generate-insights`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setSuccessMsg('AI analysis completed. New insights have been generated.');
        fetchInsights();
      } else {
        setErrorMsg('Failed to run AI analysis. Please try again.');
      }
    } catch (err) {
      setErrorMsg('Unable to connect to the server. Please check your connection.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>AI Analyst</h2>
          <div className="page-header-sub">Karnataka State Police — Automated Intelligence Analysis</div>
        </div>
        <button className="btn btn-primary" onClick={handleGenerate} disabled={generating}>
          {generating ? 'Analysing Data...' : 'Run Analysis AI'}
        </button>
      </div>

      <div className="page-body">
        <div className="page-intro">
          <div className="page-intro-icon">🧠</div>
          <div className="page-intro-content">
            <div className="page-intro-title">AI-Powered Crime Analysis</div>
            <div className="page-intro-desc">
              Automatically scans the crime database for statistical anomalies, emerging trends, and strategic patterns.
              Generates categorised insights (critical alerts, warnings, observations) to assist command-level decision making.
              Click “Run Analysis AI” to generate fresh insights.
            </div>
          </div>
        </div>

        {errorMsg && (
          <div className="error-banner" style={{ marginBottom: 16 }}>
            <span style={{ marginRight: 8 }}>⚠</span>{errorMsg}
          </div>
        )}
        {successMsg && (
          <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7', padding: '10px 14px', borderRadius: '6px', marginBottom: 16, fontSize: 13 }}>
            ✓ {successMsg}
          </div>
        )}

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
    </>
  );
}
