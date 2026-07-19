const http = require('http');
const payload = JSON.stringify({ username: 'admin', password: 'admin123' });
function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ statusCode: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
(async () => {
  try {
    const login = await request({ hostname: '127.0.0.1', port: 6999, path: '/api/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, payload);
    console.log('LOGIN', login.statusCode, login.body);
    if (login.statusCode === 200) {
      const data = JSON.parse(login.body);
      const token = data.token;
      const me = await request({ hostname: '127.0.0.1', port: 6999, path: '/api/auth/me', method: 'GET', headers: { Authorization: 'Bearer ' + token } });
      console.log('ME', me.statusCode, me.body);
    }
  } catch (err) {
    console.error(err && err.stack);
  }
})();