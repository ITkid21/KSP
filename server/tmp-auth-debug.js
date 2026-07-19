const jwtService = require('./services/jwtService');
const userRepo = require('./repositories/userRepository');
const storageFallback = require('./services/storageFallback');
const users = require('./data/db/users.json');
const admin = users.find(u => u.username === 'admin');
console.log('admin row', admin);
const token = jwtService.sign({ id: admin.id, username: admin.username, role: admin.role, full_name: admin.full_name });
console.log('new token', token);
try {
  const decoded = jwtService.verify(token);
  console.log('decoded token', decoded);
} catch (err) {
  console.error('verify failed', err.message);
}
(async () => {
  try {
    const user = await userRepo.findActiveById({}, admin.id);
    console.log('findActiveById result', user);
    const q = `SELECT * FROM system_users WHERE id = '${admin.id}' AND is_active = true;`;
    const res = await storageFallback.executeQuery({}, q);
    console.log('fallback query result', JSON.stringify(res, null, 2));
  } catch (err) {
    console.error(err.stack);
  }
})();