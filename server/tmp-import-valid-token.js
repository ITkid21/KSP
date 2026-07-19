const http = require('http');
const jwtService = require('./services/jwtService');
const users = require('./data/db/users.json');
const admin = users.find(u => u.username === 'admin');
if (!admin) {
  console.error('Admin user not found');
  process.exit(1);
}
const token = jwtService.sign({ id: admin.id, username: admin.username, role: admin.role, full_name: admin.full_name });
console.log('Using token:', token);
const csv = 'crime_id,crime_type,latitude,longitude,district,incident_date,severity,status\n1,THEFT,12.9716,77.5946,Bangalore,2024-07-01,1,raw\n';
const boundary = '----WebKitFormBoundary' + Date.now();
const body = Buffer.concat([
  Buffer.from('--' + boundary + '\r\n'),
  Buffer.from('Content-Disposition: form-data; name="csv"; filename="valid.csv"\r\n'),
  Buffer.from('Content-Type: text/csv\r\n\r\n'),
  Buffer.from(csv, 'utf8'),
  Buffer.from('\r\n--' + boundary + '--\r\n'),
]);
function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
(async () => {
  try {
    const upload = await request({ hostname: '127.0.0.1', port: 5999, path: '/api/import/upload', method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'multipart/form-data; boundary=' + boundary, 'Content-Length': body.length } }, body);
    console.log('UPLOAD', upload.statusCode, upload.body);
  } catch (err) {
    console.error('ERROR', err && err.message);
    console.error(err && err.stack);
  }
})();