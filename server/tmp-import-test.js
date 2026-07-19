const http = require('http');
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjU3M2UxNjc3LTYzNGQtNDRjYS1hYmFhLTFhODIyNmZiMWY0OCIsInVzZXJuYW1lIjoiYWRtaW4iLCJyb2xlIjoic3VwZXJfYWRtaW4iLCJmdWxsX25hbWUiOiJTeXN0ZW0gQWRtaW5pc3RyYXRvciIsImlhdCI6MTc4MzM3NTgzMywiZXhwIjoxNzgzNDYyMjMzfQ.9f5mcvFzvIMzw-AhEHHNFQK7bsT2XBWn3OxM9m_9f1E';
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
    if (upload.statusCode !== 200) return;
    const uploadJson = JSON.parse(upload.body);
    const payload = JSON.stringify({ file_id: uploadJson.file_id, folder_id: uploadJson.folder_id, filename: 'valid.csv', skip_duplicates: false });
    const validate = await request({ hostname: '127.0.0.1', port: 5999, path: '/api/import/validate', method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, payload);
    console.log('VALIDATE', validate.statusCode, validate.body);
    if (validate.statusCode !== 200) return;
    const start = await request({ hostname: '127.0.0.1', port: 5999, path: '/api/import/start', method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, payload);
    console.log('START', start.statusCode, start.body);
  } catch (err) {
    console.error('ERROR', err && err.message);
    console.error(err && err.stack);
  }
})();