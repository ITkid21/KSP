const Crypt = require('C:/Users/Atharva/AppData/Roaming/npm/node_modules/zcatalyst-cli/lib/authentication/crypt.js').default;
const decrypter = new Crypt('ZC_TRAM');
const fs = require('fs');
const https = require('https');

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
    console.log('CLI Refresh Token:', cred.refresh_token);

    console.log('Attempting to refresh token using accounts.zoho.in...');
    const result = await postRequest('https://accounts.zoho.in/oauth/v2/token', {
      client_id: '1000.D5IIHDXSPN2MII26AD0V61I6RMVSNM',
      client_secret: '02ee875ecfc50573e5cc8d62916ad3077be20d0f42',
      refresh_token: cred.refresh_token,
      grant_type: 'refresh_token'
    });

    console.log('Refresh Result:', result);
  } catch (err) {
    console.error('Error during refresh:', err);
  }
}

run();
