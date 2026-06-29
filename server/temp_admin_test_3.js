const Crypt = require('C:/Users/Atharva/AppData/Roaming/npm/node_modules/zcatalyst-cli/lib/authentication/crypt.js').default;
const decrypter = new Crypt('ZC_TRAM');
const fs = require('fs');
const https = require('https');
const catalyst = require('zcatalyst-sdk-node');

function getCliCredential() {
  const config = JSON.parse(fs.readFileSync('C:/Users/Atharva/AppData/Roaming/zcatalyst-cli-nodejs/Config/zcatalyst-cli.json', 'utf8'));
  const encryptedCred = config.in.credential;
  return decrypter.decrypt(encryptedCred);
}

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
      res.on('end', () => resolve(JSON.parse(body)));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

const originalRequest = https.request;
https.request = function(options, cb) {
  console.log('--- HTTPS REQUEST ---');
  console.log(options.method, options.hostname, options.path);
  console.log('Headers:', options.headers);
  return originalRequest.apply(this, arguments);
};

async function run() {
  process.env.X_ZOHO_CATALYST_CONSOLE_URL = 'https://api.catalyst.zoho.in';
  const cred = getCliCredential();
  const refreshRes = await postRequest('https://accounts.zoho.in/oauth/v2/token', {
    client_id: '1000.D5IIHDXSPN2MII26AD0V61I6RMVSNM',
    client_secret: '02ee875ecfc50573e5cc8d62916ad3077be20d0f42',
    refresh_token: cred.refresh_token,
    grant_type: 'refresh_token'
  });

  const app = catalyst.initializeApp({
    project_id: '43082000000013050',
    project_key: '50042774083', 
    environment: 'Development',
    credential: catalyst.credential.accessToken(refreshRes.access_token)
  });

  try {
    console.log('calling insertRow...');
    await app.datastore().table('system_users').insertRow({ username: 'test_123' });
  } catch(e) {
    console.log('Error from insertRow');
  }
}
run();
