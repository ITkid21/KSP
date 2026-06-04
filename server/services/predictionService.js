/**
 * PredictionService - Modular abstraction for Organizer's ML prediction engine.
 */
const db = require('../models/database');

class PredictionService {
  /**
   * Get prediction for specific inputs
   * @param {string} district 
   * @param {string} crimeType 
   * @param {number} year 
   * @returns {Object} Risk Score, Hotspot Prediction, Confidence Score
   */
  static getPrediction(district, crimeType, year = 2025) {
    // Treat the database predictions table (representing organizer's ML model output) as primary source
    const predictions = db.getAll('predictions');
    
    // Find matching prediction
    const match = predictions.find(p => 
      p.district.toUpperCase() === district.toUpperCase() && 
      p.predicted_crime_type.toUpperCase() === crimeType.toUpperCase() &&
      p.predicted_year === year
    );

    if (match) {
      return {
        riskScore: match.risk_score,
        hotspotPrediction: match.risk_score >= 0.7,
        confidenceScore: match.confidence_score,
        details: match
      };
    }

    // Dynamic fallback matching using crime_locations (organizer logic)
    const loc = db.findOne('crime_locations', l => 
      l.district.toUpperCase() === district.toUpperCase() &&
      l.crime_type.toUpperCase() === crimeType.toUpperCase()
    );

    if (loc) {
      const baseRisk = loc.severity === 'critical' ? 0.85 : loc.severity === 'high' ? 0.65 : loc.severity === 'medium' ? 0.45 : 0.25;
      const caseFactor = Math.min((loc.cases || 0) / 50000, 1);
      const riskScore = Math.min(baseRisk + caseFactor * 0.15, 0.99);
      const confidence = (loc.cases || 0) > 1000 ? 0.78 : (loc.cases || 0) > 500 ? 0.65 : 0.52;

      return {
        riskScore: parseFloat(riskScore.toFixed(3)),
        hotspotPrediction: riskScore >= 0.7,
        confidenceScore: parseFloat(confidence.toFixed(3)),
        details: {
          district,
          predicted_crime_type: crimeType,
          predicted_year: year,
          severity: loc.severity,
          cases: loc.cases
        }
      };
    }

    // Default return
    return {
      riskScore: 0.15,
      hotspotPrediction: false,
      confidenceScore: 0.5,
      details: null
    };
  }

  /**
   * Explain prediction results in plain language
   * @param {string} district 
   * @param {string} crimeType 
   * @returns {Object} Explanation factors
   */
  static explainPrediction(district, crimeType) {
    const pred = this.getPrediction(district, crimeType);
    
    // Analyze crime_records for district and crimeType to find trend
    const records = db.getAll('crime_records');
    const matchedRecords = records.filter(r => 
      r.act.toUpperCase().includes(crimeType.toUpperCase()) || 
      r.major_head.toUpperCase().includes(crimeType.toUpperCase())
    );

    // Compute YoY growth if data exists
    let trendText = "";
    if (matchedRecords.length > 0) {
      const recentYear = Math.max(...matchedRecords.map(r => r.year));
      const recentCases = matchedRecords.filter(r => r.year === recentYear).reduce((s, r) => s + r.current_month_count, 0);
      const prevCases = matchedRecords.filter(r => r.year === (recentYear - 1)).reduce((s, r) => s + r.current_month_count, 0);
      
      if (prevCases > 0) {
        const change = ((recentCases - prevCases) / prevCases * 100).toFixed(1);
        trendText = `${crimeType} cases ${change >= 0 ? 'increased' : 'decreased'} by ${Math.abs(change)}% in the latest recorded period (Year ${recentYear}).`;
      } else {
        trendText = `Total cases in the latest period: ${recentCases.toLocaleString()}.`;
      }
    } else {
      trendText = "No historical incident records match the category in the standard database.";
    }

    // Compute density check
    const locations = db.getAll('crime_locations');
    const districtStats = locations.filter(l => l.district.toUpperCase() === district.toUpperCase());
    const totalDistrictCases = districtStats.reduce((s, l) => s + l.cases, 0);
    const specificLoc = districtStats.find(l => l.crime_type.toUpperCase() === crimeType.toUpperCase());

    const densityText = specificLoc 
      ? `Historical density for ${crimeType} in ${district} is high with ${specificLoc.cases.toLocaleString()} registered cases.`
      : `District ${district} has ${totalDistrictCases.toLocaleString()} total historical cases across all categories.`;

    const riskLevel = pred.riskScore >= 0.75 ? 'CRITICAL' : pred.riskScore >= 0.6 ? 'HIGH' : pred.riskScore >= 0.4 ? 'MODERATE' : 'LOW';

    return {
      district,
      crimeType,
      riskScore: pred.riskScore,
      confidenceScore: pred.confidenceScore,
      riskLevel,
      factors: [
        trendText,
        densityText,
        `Organizer ML model confidence rating is ${(pred.confidenceScore * 100).toFixed(0)}%.`,
        `Assigned severity classification: ${specificLoc ? specificLoc.severity.toUpperCase() : 'MODERATE'}`
      ],
      plainLanguage: `The location "${district}" is classified as ${riskLevel} RISK (Score: ${pred.riskScore}) for "${crimeType}". This is primarily driven by historical density (${specificLoc ? specificLoc.cases : 0} cases) and model confidence of ${(pred.confidenceScore * 100).toFixed(0)}%.`
    };
  }
}

module.exports = PredictionService;
