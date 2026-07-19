const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const FormData = require('form-data');
const http = require('http');

const token = jwt.sign(
  { id: 'test-admin', username: 'test-admin', role: 'ADMIN', full_name: 'Test Admin' },
  'ksp_crime_intel_platform_secret_key_2024_secure',
  { expiresIn: '24h' }
);

const form = new FormData();
form.append('csv', fs.createReadStream(path.resolve(__dirname, 'data', 'crime_review.csv')), {
  filename: 'test.csv',
  contentType: 'text/csv'
});

const req = http.request({
  hostname: '127.0.0.1',
  port: 5000,
  path: '/api/import/upload',
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, ...form.getHeaders() }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('status', res.statusCode);
    console.log(data);
  });
});

form.pipe(req);
