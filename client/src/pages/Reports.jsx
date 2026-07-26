import { useState } from 'react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const API_URL = '/api';

export default function Reports() {
  const [reportType, setReportType] = useState('yearly');
  const [year, setYear] = useState('2024');
  const [month, setMonth] = useState('JAN');
  const [district, setDistrict] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const generateReport = async () => {
    setLoading(true);
    setReportData(null);
    setErrorMsg('');
    const token = localStorage.getItem('ksp_token');
    const headers = { 'Authorization': `Bearer ${token}` };

    try {
      let endpoint = '';
      if (reportType === 'monthly') endpoint = `/reports/monthly?year=${year}&month=${month}`;
      else if (reportType === 'yearly') endpoint = `/reports/yearly?year=${year}`;
      else if (reportType === 'district') endpoint = `/reports/district?district=${district}`;
      else if (reportType === 'category') endpoint = `/reports/category?category=${category}`;

      if (!endpoint || (reportType === 'district' && !district) || (reportType === 'category' && !category)) {
        setErrorMsg('Please fill all required fields before generating a report.');
        setLoading(false);
        return;
      }

      const res = await fetch(`${API_URL}${endpoint}`, { headers });
      const data = await res.json();
      if (res.ok) {
        setReportData(data);
      } else {
        setErrorMsg(data.error || 'Failed to generate report. Please check your parameters.');
      }
    } catch (err) {
      setErrorMsg('Unable to connect to the server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const exportPDF = () => {
    if (!reportData || !reportData.data || reportData.data.length === 0) return;
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text('KSP Crime Analytics Report', 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    
    let subtitle = '';
    if (reportType === 'monthly') subtitle = `Monthly Report: ${reportData.month} ${reportData.year} | Total Cases: ${reportData.total}`;
    else if (reportType === 'yearly') subtitle = `Yearly Report: ${reportData.year} | Total Cases: ${reportData.grandTotal}`;
    else if (reportType === 'district') subtitle = `District Report: ${reportData.district} | Total Cases: ${reportData.total}`;
    else if (reportType === 'category') subtitle = `Category Report: ${reportData.category}`;
    
    doc.text(subtitle, 14, 30);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 36);

    let head = [];
    let body = [];

    if (reportType === 'monthly') {
      head = [['Major Head', 'Minor Head', 'Cases', 'Prev Month', 'Year Total']];
      body = reportData.data.map(d => [d.major_head, d.minor_head || '-', d.current_month_count, d.previous_month_count, d.current_year_total]);
    } else if (reportType === 'yearly') {
      head = [['Major Head', 'Total Cases']];
      body = reportData.data.map(d => [d.major_head, d.total]);
    } else if (reportType === 'district') {
      head = [['Crime Type', 'Cases', 'Severity', 'Overall Risk', 'Coordinates']];
      body = reportData.data.map(d => [d.crime_type, d.cases, d.severity, d.overall_risk, `${d.latitude.toFixed(4)}, ${d.longitude.toFixed(4)}`]);
    } else if (reportType === 'category') {
      head = [['Year', 'Month', 'Total Cases']];
      body = reportData.data.map(d => [d.year, d.month, d.total]);
    }

    doc.autoTable({
      startY: 45,
      head: head,
      body: body,
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] },
      styles: { fontSize: 9 }
    });

    doc.save(`ksp_report_${reportType}_${new Date().getTime()}.pdf`);
  };

  const exportCSV = () => {
    if (!reportData || !reportData.data || reportData.data.length === 0) return;
    let csv = '';
    
    if (reportType === 'monthly') {
      csv = 'Major Head,Minor Head,Cases,Prev Month,Year Total\n';
      reportData.data.forEach(d => { csv += `"${d.major_head}","${d.minor_head || '-'}",${d.current_month_count},${d.previous_month_count},${d.current_year_total}\n`; });
    } else if (reportType === 'yearly') {
      csv = 'Major Head,Total Cases\n';
      reportData.data.forEach(d => { csv += `"${d.major_head}",${d.total}\n`; });
    } else if (reportType === 'district') {
      csv = 'Crime Type,Cases,Severity,Overall Risk,Latitude,Longitude\n';
      reportData.data.forEach(d => { csv += `"${d.crime_type}",${d.cases},"${d.severity}","${d.overall_risk}",${d.latitude},${d.longitude}\n`; });
    } else if (reportType === 'category') {
      csv = 'Year,Month,Total Cases\n';
      reportData.data.forEach(d => { csv += `${d.year},"${d.month}",${d.total}\n`; });
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `ksp_report_${reportType}_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Report Generation</h2>
          <div className="page-header-sub">Karnataka State Police — Analytical Reports</div>
        </div>
        {reportData && (
          <div className="btn-group">
            <button className="btn btn-secondary" onClick={exportCSV}>Export CSV</button>
            <button className="btn btn-primary" onClick={exportPDF}>Export PDF</button>
          </div>
        )}
      </div>

      <div className="page-body">
        <div className="page-intro">
          <div className="page-intro-icon">📋</div>
          <div className="page-intro-content">
            <div className="page-intro-title">Report Generation Centre</div>
            <div className="page-intro-desc">
              <strong>Description:</strong> Formal reporting utility compiling yearly summaries, monthly statistics, and district-level risk forecasts into structured tabular formats.
              <br />
              <strong>Purpose:</strong> To prepare standardized documentation and audit trails for internal administration, court proceedings, and executive review.
              <br />
              <strong>Instructions:</strong> Select a Report Type from the configuration panel, fill in the filters (Year, Month, or District), click "Generate Data", and use the export buttons.
            </div>
            <div className="page-intro-steps">
              <span className="intro-step">① Select report type</span>
              <span className="intro-step">② Set parameters</span>
              <span className="intro-step">③ Generate &amp; preview</span>
              <span className="intro-step">④ Export PDF / CSV</span>
            </div>
          </div>
        </div>

        {errorMsg && (
          <div className="error-banner" style={{ marginBottom: 16 }}>
            <span style={{ marginRight: 8 }}>⚠</span>{errorMsg}
          </div>
        )}

      <div className="chart-card" style={{ marginBottom: '20px' }}>
        <div className="chart-card-header">
          <div className="chart-card-title">Report Configuration</div>
        </div>
        <div className="form-row" style={{ alignItems: 'flex-end' }}>
          <div className="form-group">
            <label className="form-label">Report Type</label>
            <select className="form-select" value={reportType} onChange={e => { setReportType(e.target.value); setReportData(null); }}>
              <option value="yearly">Yearly Summary</option>
              <option value="monthly">Monthly Detailed</option>
              <option value="district">District Hotspots</option>
              <option value="category">Crime Category Trend</option>
            </select>
          </div>
          
          {(reportType === 'monthly' || reportType === 'yearly') && (
            <div className="form-group">
              <label className="form-label">Year</label>
              <select className="form-select" value={year} onChange={e => setYear(e.target.value)}>
                <option value="2021">2021</option>
                <option value="2022">2022</option>
                <option value="2023">2023</option>
                <option value="2024">2024</option>
              </select>
            </div>
          )}

          {reportType === 'monthly' && (
            <div className="form-group">
              <label className="form-label">Month</label>
              <select className="form-select" value={month} onChange={e => setMonth(e.target.value)}>
                <option value="JAN">January</option>
                <option value="FEB">February</option>
                <option value="MAR">March</option>
                <option value="APR">April</option>
                <option value="MAY">May</option>
                <option value="JUN">June</option>
                <option value="JUL">July</option>
                <option value="AUG">August</option>
                <option value="SEP">September</option>
                <option value="OCT">October</option>
                <option value="NOV">November</option>
                <option value="DEC">December</option>
              </select>
            </div>
          )}

          {reportType === 'district' && (
            <div className="form-group">
              <label className="form-label">District Name</label>
              <input type="text" className="form-input" placeholder="e.g. BENGALURU CITY" value={district} onChange={e => setDistrict(e.target.value)} />
            </div>
          )}

          {reportType === 'category' && (
            <div className="form-group">
              <label className="form-label">Crime Category</label>
              <input type="text" className="form-input" placeholder="e.g. MURDER" value={category} onChange={e => setCategory(e.target.value)} />
            </div>
          )}

          <div className="form-group">
            <button className="btn btn-primary" style={{ width: '100%', height: '36px' }} onClick={generateReport} disabled={loading}>
              {loading ? 'Generating...' : 'Generate Data'}
            </button>
          </div>
        </div>
      </div>

      {reportData && (
        <div className="chart-card">
          <div className="chart-card-header">
            <div className="chart-card-title">Preview Data ({reportData.data.length} records)</div>
          </div>
          <div className="data-table-wrapper" style={{ maxHeight: '500px', overflowY: 'auto' }}>
            <table className="data-table">
              <thead>
                {reportType === 'monthly' && (
                  <tr><th>Major Head</th><th>Minor Head</th><th>Cases</th><th>Prev Month</th><th>Year Total</th></tr>
                )}
                {reportType === 'yearly' && (
                  <tr><th>Major Head</th><th>Total Cases</th></tr>
                )}
                {reportType === 'district' && (
                  <tr><th>Crime Type</th><th>Cases</th><th>Severity</th><th>Overall Risk</th></tr>
                )}
                {reportType === 'category' && (
                  <tr><th>Year</th><th>Month</th><th>Total Cases</th></tr>
                )}
              </thead>
              <tbody>
                {reportData.data.map((d, i) => (
                  <tr key={i}>
                    {reportType === 'monthly' && (
                      <><td>{d.major_head}</td><td>{d.minor_head || '-'}</td><td>{d.current_month_count}</td><td>{d.previous_month_count}</td><td>{d.current_year_total}</td></>
                    )}
                    {reportType === 'yearly' && (
                      <><td>{d.major_head}</td><td>{d.total}</td></>
                    )}
                    {reportType === 'district' && (
                      <><td>{d.crime_type}</td><td>{d.cases}</td>
                        <td><span className={`badge badge-${d.severity === 'critical' ? 'critical' : d.severity === 'high' ? 'high' : 'moderate'}`}>{d.severity}</span></td>
                        <td>{d.overall_risk}</td>
                      </>
                    )}
                    {reportType === 'category' && (
                      <><td>{d.year}</td><td>{d.month}</td><td>{d.total}</td></>
                    )}
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
