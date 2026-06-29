const sessionRepository = require('./repositories/sessionRepository');
const { v4: uuidv4 } = require('uuid');

// Mock req and insertRow
const req = {};
const mockSession = {
  id: uuidv4(),
  user_id: uuidv4(),
  token: 'mock-jwt-token',
  expires_at: new Date(Date.now() + 3600 * 1000), // 1 hour from now
  ip_address: '192.168.1.1',
  user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/100.0.0.0',
};

// We will stub the insertRow to prevent it from actually hitting the DB, just to see the log
const catalystService = require('./services/catalystService');
catalystService.insertRow = async () => ({ status: 'success' });

async function test() {
  await sessionRepository.create(req, mockSession);
}

test();
