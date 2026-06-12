process.env.X_ZOHO_CATALYST_CONSOLE_URL = 'https://api.catalyst.zoho.in';

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

async function run() {
  try {
    const cred = getCliCredential();
    console.log('Refreshing access token...');
    const refreshRes = await postRequest('https://accounts.zoho.in/oauth/v2/token', {
      client_id: '1000.D5IIHDXSPN2MII26AD0V61I6RMVSNM',
      client_secret: '02ee875ecfc50573e5cc8d62916ad3077be20d0f42',
      refresh_token: cred.refresh_token,
      grant_type: 'refresh_token'
    });

    if (!refreshRes.access_token) {
      throw new Error('Could not refresh token: ' + JSON.stringify(refreshRes));
    }

    console.log('Refreshed Token Success! Access Token is:', refreshRes.access_token);

    const app = catalyst.initializeApp({
      project_id: '43082000000013050',
      project_key: '50042774083', // Use domain ID from .catalystrc
      environment: 'Development',
      credential: catalyst.credential.accessToken(refreshRes.access_token)
    });

    console.log('App initialized. Querying system_users...');
    const result = await app.zcql().executeZCQLQuery('SELECT id FROM system_users LIMIT 1');
    console.log('Query success! Result:', result);
  } catch (err) {
    console.error('Error during query:', err);
  }
}

run();
