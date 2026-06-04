import { useState, useEffect } from 'react';
import { crime } from '../services/api';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Title, Tooltip, Legend, Filler
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler);

const chartDefaults = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 } } }, tooltip: { backgroundColor: '#1a2236', borderColor: '#334155', borderWidth: 1, titleFont: { family: 'Inter' }, bodyFont: { family: 'Inter' }, padding: 10 } },
  scales: { x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: '#1e293b' } }, y: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: '#1e293b' } } }
};

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [monthly, setMonthly] = useState([]);
  const [categories, setCategories] = useState([]);
  const [trends, setTrends] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [selectedYear, setSelectedYear] = useState('');
  const [years, setYears] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedYear) {
      crime.getByMonth(selectedYear).then(setMonthly).catch(console.error);
      crime.getByCategory(selectedYear, 15).then(setCategories).catch(console.error);
    }
  }, [selectedYear]);

  async function loadData() {
    try {
      setLoading(true);
      const [s, y, t, d] = await Promise.all([
        crime.getSummary(), crime.getYears(), crime.getGrowthTrends(), crime.getDistrictWise()
      ]);
      setSummary(s);
      setYears(y);
      setTrends(t);
      setDistricts(d);
      const latestYear = y[y.length - 1];
      setSelectedYear(latestYear);
      const [m, c] = await Promise.all([
        crime.getByMonth(latestYear), crime.getByCategory(latestYear, 15)
      ]);
      setMonthly(m);
      setCategories(c);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  if (loading) return <><div className="page-header"><div><h2>Dashboard</h2></div></div><div className="page-body"><div className="loading"><div className="spinner"></div>Loading dashboard data...</div></div></>;

  const fmt = (n) => n != null ? Number(n).toLocaleString('en-IN') : '—';

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Crime Intelligence Dashboard</h2>
          <div className="page-header-sub">Karnataka State Police — Real-time Crime Overview</div>
        </div>
        <div className="btn-group">
          <select className="form-select" style={{ width: 120 }} value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div className="page-body">
        {/* KPI Cards */}
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-card-label">Total Crimes</div>
            <div className="kpi-card-value">{fmt(summary?.totalCrimes)}</div>
            <div className="kpi-card-sub">All records (2021-2024)</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-card-label">Crime Growth</div>
            <div className="kpi-card-value">{summary?.crimeGrowthPercent > 0 ? '+' : ''}{summary?.crimeGrowthPercent}%</div>
            <div className={`kpi-card-change ${summary?.crimeGrowthPercent > 0 ? 'positive' : summary?.crimeGrowthPercent < 0 ? 'negative' : 'neutral'}`}>
              {summary?.crimeGrowthPercent > 0 ? '▲ Increasing' : summary?.crimeGrowthPercent < 0 ? '▼ Decreasing' : '— Stable'}
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-card-label">High Risk Zones</div>
            <div className="kpi-card-value">{summary?.highRiskZones}</div>
            <div className="kpi-card-sub">Districts at high/critical risk</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-card-label">Active Hotspots</div>
            <div className="kpi-card-value">{summary?.activeHotspots}</div>
            <div className="kpi-card-sub">Currently monitored</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-card-label">Most Common Crime</div>
            <div className="kpi-card-value" style={{ fontSize: 16 }}>{summary?.mostCommonCrime?.split('(')[0]?.trim()?.substring(0, 25)}</div>
            <div className="kpi-card-sub">{fmt(summary?.mostCommonCrimeCount)} cases</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-card-label">Most Dangerous</div>
            <div className="kpi-card-value" style={{ fontSize: 16 }}>{summary?.mostDangerousCrime?.split('(')[0]?.trim()?.substring(0, 25)}</div>
            <div className="kpi-card-sub">{fmt(summary?.mostDangerousCrimeCount)} cases</div>
          </div>
        </div>

        {/* Charts Row 1 */}
        <div className="charts-grid">
          <div className="chart-card">
            <div className="chart-card-header">
              <div className="chart-card-title">Crime by Year</div>
            </div>
            <div className="chart-card-body">
              <Bar data={{
                labels: summary?.crimeByYear?.map(d => d.year) || [],
                datasets: [{ label: 'Total Crimes', data: summary?.crimeByYear?.map(d => d.total) || [],
                  backgroundColor: ['#3b82f6', '#06b6d4', '#8b5cf6', '#f59e0b'], borderRadius: 4, barPercentage: 0.6 }]
              }} options={{ ...chartDefaults, plugins: { ...chartDefaults.plugins, legend: { display: false } } }} />
            </div>
          </div>

          <div className="chart-card">
            <div className="chart-card-header">
              <div className="chart-card-title">Monthly Trend — {selectedYear}</div>
            </div>
            <div className="chart-card-body">
              <Line data={{
                labels: monthly.map(d => d.month),
                datasets: [{ label: 'Cases', data: monthly.map(d => d.total), borderColor: '#3b82f6',
                  backgroundColor: 'rgba(59,130,246,0.1)', fill: true, tension: 0.3, pointRadius: 3 }]
              }} options={{ ...chartDefaults, plugins: { ...chartDefaults.plugins, legend: { display: false } } }} />
            </div>
          </div>
        </div>

        {/* Charts Row 2 */}
        <div className="charts-grid">
          <div className="chart-card">
            <div className="chart-card-header">
              <div className="chart-card-title">Top 15 Crime Categories — {selectedYear}</div>
            </div>
            <div className="chart-card-body" style={{ minHeight: 350 }}>
              <Bar data={{
                labels: categories.map(d => d.category?.split('(')[0]?.trim()?.substring(0, 30)),
                datasets: [{ label: 'Cases', data: categories.map(d => d.total),
                  backgroundColor: '#06b6d4', borderRadius: 3, barPercentage: 0.7 }]
              }} options={{ ...chartDefaults, indexAxis: 'y', plugins: { ...chartDefaults.plugins, legend: { display: false } } }} />
            </div>
          </div>

          <div className="chart-card">
            <div className="chart-card-header">
              <div className="chart-card-title">Crime Growth Trends</div>
            </div>
            <div className="chart-card-body">
              <Bar data={{
                labels: trends.map(d => d.year),
                datasets: [
                  { label: 'Total', data: trends.map(d => d.total), backgroundColor: '#3b82f6', borderRadius: 4, yAxisID: 'y' },
                  { label: 'Growth %', data: trends.map(d => d.growth), type: 'line', borderColor: '#f59e0b',
                    backgroundColor: 'transparent', yAxisID: 'y1', pointRadius: 4, pointBackgroundColor: '#f59e0b' }
                ]
              }} options={{ ...chartDefaults, scales: { ...chartDefaults.scales,
                y1: { position: 'right', ticks: { color: '#64748b', callback: v => v + '%' }, grid: { display: false } } } }} />
            </div>
          </div>
        </div>

        {/* District Distribution */}
        <div className="chart-card">
          <div className="chart-card-header">
            <div className="chart-card-title">District-wise Crime Distribution</div>
          </div>
          <div className="data-table-wrapper" style={{ maxHeight: 400 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>District</th>
                  <th>Risk Level</th>
                  <th>Total Cases</th>
                  <th>Crime Types</th>
                </tr>
              </thead>
              <tbody>
                {districts.slice(0, 20).map((d, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{d.district}</td>
                    <td><span className={`badge badge-${d.overall_risk}`}>{d.overall_risk}</span></td>
                    <td>{fmt(d.total_cases)}</td>
                    <td>{d.crime_types}</td>
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
