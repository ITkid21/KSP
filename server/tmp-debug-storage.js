const jwt = require('jsonwebtoken');
const storageFallback = require('./services/storageFallback');
const userRepo = require('./repositories/userRepository');
const db = require('./data/db/users.json');
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjU3M2UxNjc3LTYzNGQtNDRjYS1hYmFhLTFhODIyNmZiMWY0OCIsInVzZXJuYW1lIjoiYWRtaW4iLCJyb2xlIjoic3VwZXJfYWRtaW4iLCJmdWxsX25hbWUiOiJTeXN0ZW0gQWRtaW5pc3RyYXRvciIsImlhdCI6MTc4MzM3NTgzMywiZXhwIjoxNzgzNDYyMjMzfQ.9f5mcvFzvIMzw-AhEHHNFQK7bsT2XBWn3OxM9m_9f1E';
const secret = require('./services/jwtService');
console.log('user rows:', db.length, db[0]);
try {
  const decoded = jwt.verify(token, secret.verify ? secret.verify : process.env.JWT_SECRET || 'ksp_crime_intel_platform_secret_key_2024_secure');
  console.log('decoded token:', decoded);
} catch (err) {
  console.error('JWT verify failed:', err.message);
}
(async () => {
  try {
    const q1 = "SELECT * FROM system_users WHERE id = '573e1677-634d-44ca-abaa-1a8226fb1f48' AND is_active = true;";
    const res1 = await storageFallback.executeQuery(null, q1);
    console.log('query1', q1, JSON.stringify(res1, null, 2));
    const q2 = "SELECT * FROM system_users WHERE id = '573e1677-634d-44ca-abaa-1a8226fb1f48' AND is_active = 1;";
    const res2 = await storageFallback.executeQuery(null, q2);
    console.log('query2', q2, JSON.stringify(res2, null, 2));
    const q3 = "SELECT * FROM users WHERE id = '573e1677-634d-44ca-abaa-1a8226fb1f48' AND is_active = 1;";
    const res3 = await storageFallback.executeQuery(null, q3);
    console.log('query3', q3, JSON.stringify(res3, null, 2));
  } catch (err) {
    console.error('fallback error', err.stack);
  }
})();