import { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement,
  ArcElement
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement,
  ArcElement
);

const API_URL = '/api';

export default function Analytics() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    overview: null,
    categoryBreakdown: null,
    severity: null,
    yearComparison: null
  });

  const [error, setError] = useState('');

  useEffect(() => {
    const fetchAnalytics = async () => {
      const token = localStorage.getItem('ksp_token');
      const headers = { 'Authorization': `Bearer ${token}` };

      try {
        const [overviewRes, categoryRes, severityRes, yearRes] = await Promise.all([
          fetch(`${API_URL}/analytics/overview`, { headers }),
          fetch(`${API_URL}/analytics/category-breakdown`, { headers }),
          fetch(`${API_URL}/analytics/severity-analysis`, { headers }),
          fetch(`${API_URL}/analytics/year-comparison`, { headers })
        ]);

        const [overview, categoryBreakdown, severity, yearComparison] = await Promise.all([
          overviewRes.json(),
          categoryRes.json(),
          severityRes.json(),
          yearRes.json()
        ]);

        setData({ overview, categoryBreakdown, severity, yearComparison });
      } catch (err) {
        setError('Unable to load analytics data. Please refresh the page or contact support.');
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <>
        <div className="page-header"><div><h2>Deep Analytics</h2><div className="page-header-sub">Karnataka State Police — Crime Statistical Analysis</div></div></div>
        <div className="page-body"><div className="loading"><div className="spinner"></div>Loading Analytics...</div></div>
      </>
    );
  }

  if (error || !data.overview) {
    return (
      <>
        <div className="page-header"><div><h2>Deep Analytics</h2></div></div>
        <div className="page-body">
          <div className="error-banner">
            <span style={{ marginRight: 8 }}>⚠</span>
            {error || 'Unable to load analytics data. Please refresh the page.'}
          </div>
        </div>
      </>
    );
  }

  const { overview, categoryBreakdown, severity, yearComparison } = data;

  // Chart configs
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#e2e8f0' } }
    },
    scales: {
      x: { ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } },
      y: { ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } }
    }
  };

  const donutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'right', labels: { color: '#e2e8f0' } }
    }
  };

  // Trend Data
  const trendData = {
    labels: overview.monthlyTrends.map(t => `${t.month} ${t.year}`),
    datasets: [{
      label: 'Total Crime Cases',
      data: overview.monthlyTrends.map(t => t.total),
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      tension: 0.4,
      fill: true
    }]
  };

  // Top Crimes Data
  const topCrimesData = {
    labels: overview.topCrimes.map(c => c.major_head.substring(0, 20) + '...'),
    datasets: [{
      label: 'Cases',
      data: overview.topCrimes.map(c => c.total),
      backgroundColor: '#f59e0b'
    }]
  };

  // Severity Data
  const riskLabels = severity.byRisk.map(r => r.risk_level);
  const riskColors = riskLabels.map(l => 
    l === 'critical' ? '#ef4444' : l === 'high' ? '#f97316' : l === 'medium' ? '#f59e0b' : '#10b981'
  );
  
  const severityData = {
    labels: riskLabels,
    datasets: [{
      data: severity.byRisk.map(r => r.total_cases),
      backgroundColor: riskColors,
      borderWidth: 0
    }]
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Deep Analytics</h2>
          <div className="page-header-sub">Karnataka State Police — Crime Statistical Analysis</div>
        </div>
        <div className="badge badge-info">Data updated to 2024</div>
      </div>

      <div className="page-body">
        <div className="page-intro">
          <div className="page-intro-icon">📈</div>
          <div className="page-intro-content">
            <div className="page-intro-title">Crime Analytics Engine</div>
            <div className="page-intro-desc">
              <strong>Description:</strong> Advanced statistical reporting engine containing multi-dimensional breakdowns, risk profiling, and historical YoY (Year-over-Year) growth rate analysis.
              <br />
              <strong>Purpose:</strong> To uncover deep patterns, hotspots, and growth percentages for strategic, long-term intelligence-led policing strategies.
              <br />
              <strong>Instructions:</strong> Use the interactive charts to drill down into monthly records, location risk distributions, and YoY growth tables.
            </div>
          </div>
        </div>

        <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-card-label">Total Records Processed</div>
          <div className="kpi-card-value">{overview.totalRecords.toLocaleString()}</div>
          <div className="kpi-card-sub">{overview.yearRange.min_year} - {overview.yearRange.max_year}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-label">Districts Analyzed</div>
          <div className="kpi-card-value">{overview.totalDistricts}</div>
          <div className="kpi-card-sub">Across Karnataka state</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-label">High Risk Hotspots</div>
          <div className="kpi-card-value">
            {severity.byRisk.find(r => r.risk_level === 'critical')?.districts || 0}
          </div>
          <div className="kpi-card-sub">Critical alert zones</div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-card" style={{ gridColumn: 'span 2' }}>
          <div className="chart-card-header">
            <div className="chart-card-title">Statewide Crime Trends</div>
          </div>
          <div className="chart-card-body" style={{ height: '300px' }}>
            <Line data={trendData} options={chartOptions} />
          </div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-card-header">
            <div className="chart-card-title">Top 15 Crime Categories</div>
          </div>
          <div className="chart-card-body" style={{ height: '300px' }}>
            <Bar 
              data={topCrimesData} 
              options={{...chartOptions, indexAxis: 'y'}} 
            />
          </div>
        </div>
        <div className="chart-card">
          <div className="chart-card-header">
            <div className="chart-card-title">Cases by Location Risk Level</div>
          </div>
          <div className="chart-card-body" style={{ height: '300px' }}>
            <Doughnut data={severityData} options={donutOptions} />
          </div>
        </div>
      </div>

      <div className="chart-card">
        <div className="chart-card-header">
          <div className="chart-card-title">Year-over-Year Growth (Top Categories)</div>
        </div>
        <div className="data-table-wrapper" style={{ maxHeight: '400px', overflowY: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>2022</th>
                <th>2023</th>
                <th>2024</th>
                <th>YoY Growth</th>
              </tr>
            </thead>
            <tbody>
              {yearComparison.map((yc, idx) => (
                <tr key={idx}>
                  <td>{yc.category}</td>
                  <td>{yc.years['2022'] || 0}</td>
                  <td>{yc.years['2023'] || 0}</td>
                  <td>{yc.years['2024'] || yc.latestTotal}</td>
                  <td>
                    <span className={`kpi-card-change ${yc.growth > 0 ? 'positive' : yc.growth < 0 ? 'negative' : 'neutral'}`}>
                      {yc.growth > 0 ? '↑' : yc.growth < 0 ? '↓' : '-'} {Math.abs(yc.growth)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </>
  );
}
