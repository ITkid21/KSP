'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const catalyst = require('zcatalyst-sdk-node');

// Decrypt CLI session credentials
function decrypt(value, encryptionKey = 'ZC_TRAM') {
  let data = Buffer.from(value, 'hex');
  if (data.slice(16, 17).toString() !== ':') {
    return value;
  }
  const initializationVector = data.slice(0, 16);
  const password = crypto.pbkdf2Sync(encryptionKey, initializationVector.toString(), 1000, 32, 'sha512');
  const decipher = crypto.createDecipheriv('aes-256-cbc', password, initializationVector);
  data = Buffer.concat([decipher.update(data.slice(17)), decipher.final()]);
  return JSON.parse(data.toString());
}

// Helper to make POST requests
function postRequest(url, data) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const postData = new URLSearchParams(data).toString();
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve(body);
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Initializes and returns a Zoho Catalyst app instance for local execution.
 * Authenticates dynamically using current catalyst login credentials.
 */
async function initializeLocalApp() {
  // 1. Read .catalystrc to get active project ID and environment details
  const rcPath = path.resolve(__dirname, '..', '..', '.catalystrc');
  if (!fs.existsSync(rcPath)) {
    throw new Error('.catalystrc file not found at ' + rcPath);
  }
  const rc = JSON.parse(fs.readFileSync(rcPath, 'utf8'));
  const activeProjIdx = rc.actives.project || 1;
  const activeProject = rc.projects.find(p => p.idx === activeProjIdx);
  if (!activeProject) {
    throw new Error('No active project found in .catalystrc');
  }

  const projectId = activeProject.id;
  const projectKey = activeProject.domain.id; // domain ID acts as project key
  
  const activeEnvIdx = rc.actives.env || 1;
  const activeEnv = activeProject.env.find(e => e.idx === activeEnvIdx);
  const environment = activeEnv ? activeEnv.name : 'Development';

  // 2. Read zcatalyst-cli.json to get refresh token and active DC
  const appData = process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME + '/.config');
  let cliConfigPath = path.join(appData, 'zcatalyst-cli-nodejs', 'Config', 'zcatalyst-cli.json');
  if (!fs.existsSync(cliConfigPath)) {
    // Fallback for non-Windows systems
    cliConfigPath = path.join(process.env.HOME || '.', '.config', 'configstore', 'zcatalyst-cli.json');
  }

  if (!fs.existsSync(cliConfigPath)) {
    throw new Error('Catalyst CLI configuration not found. Please run "catalyst login" first.');
  }

  const cliConfig = JSON.parse(fs.readFileSync(cliConfigPath, 'utf8'));
  const activeDC = cliConfig.active_dc || 'us';
  const dcConfig = cliConfig[activeDC];
  if (!dcConfig || !dcConfig.credential) {
    throw new Error(`Credentials for active DC "${activeDC}" not found in CLI configuration. Please run "catalyst login".`);
  }

  const cred = decrypt(dcConfig.credential);
  
  // 3. Refresh Access Token
  const dcSuffix = activeDC === 'us' ? 'com' : activeDC;
  const accountsUrl = `https://accounts.zoho.${dcSuffix}/oauth/v2/token`;
  const consoleUrl = `https://api.catalyst.zoho.${dcSuffix}`;

  const refreshRes = await postRequest(accountsUrl, {
    client_id: '1000.D5IIHDXSPN2MII26AD0V61I6RMVSNM',
    client_secret: '02ee875ecfc50573e5cc8d62916ad3077be20d0f42',
    refresh_token: cred.refresh_token,
    grant_type: 'refresh_token'
  });

  if (!refreshRes.access_token) {
    throw new Error('Failed to refresh OAuth token: ' + JSON.stringify(refreshRes));
  }

  // 4. Override console origin for SDK requests
  process.env.X_ZOHO_CATALYST_CONSOLE_URL = consoleUrl;

  // 5. Initialize SDK
  return catalyst.initializeApp({
    project_id: projectId,
    project_key: projectKey,
    environment: environment,
    credential: catalyst.credential.accessToken(refreshRes.access_token)
  });
}

module.exports = {
  initializeLocalApp
};
