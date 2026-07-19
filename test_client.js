const DbscanRunner = require('./server/services/dbscanRunner');
const path = require('path');
require('dotenv').config({ path: './server/.env' });

const csvPath = path.join(__dirname, 'server', 'data', '_dbscan_test.csv');
require('fs').writeFileSync(csvPath, 'crime_id,crime_type,latitude,longitude,District,incident_date,severity,status\nC001,Theft,12.9716,77.5946,Bengaluru,2024-01-15,2,raw\nC002,Robbery,12.9800,77.5900,Bengaluru,2024-01-16,3,raw\nC003,Burglary,12.9750,77.5920,Bengaluru,2024-01-17,2,raw\nC004,Theft,13.0000,77.5800,Bengaluru,2024-01-18,1,raw\nC005,Robbery,12.9710,77.5950,Bengaluru,2024-01-19,3,raw\n');

(async () => {
  try {
    const res = await DbscanRunner.run(csvPath);
    console.log('--- RESULT ---');
    console.log('clusters count:', res.clusters.length);
    console.log('hotspots count:', res.hotspots.length);
    console.log('metrics:', res.metrics);
  } catch (err) {
    console.error('FAILED:', err.message);
  }
})();
