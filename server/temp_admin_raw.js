const Crypt = require('C:/Users/Atharva/AppData/Roaming/npm/node_modules/zcatalyst-cli/lib/authentication/crypt.js').default;
const decrypter = new Crypt('ZC_TRAM');
const fs = require('fs');
const https = require('https');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

function getCliCredential() {
  const config = JSON.parse(fs.readFileSync('C:/Users/Atharva/AppData/Roaming/zcatalyst-cli-nodejs/Config/zcatalyst-cli.json', 'utf8'));
  const encryptedCred = config.in.credential;
  return decrypter.decrypt(encryptedCred);
}

function postRequest(url, data, isJson = false, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const postData = isJson ? JSON.stringify(data) : new URLSearchParams(data).toString();
    const reqHeaders = {
      'Content-Type': isJson ? 'application/json' : 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData),
      ...headers
    };
    
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname,
      method: 'POST',
      headers: reqHeaders
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); } 
        catch (e) { resolve({ status: res.statusCode, data: body }); }
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
    const refreshRes = await postRequest('https://accounts.zoho.in/oauth/v2/token', {
      client_id: '1000.D5IIHDXSPN2MII26AD0V61I6RMVSNM',
      client_secret: '02ee875ecfc50573e5cc8d62916ad3077be20d0f42',
      refresh_token: cred.refresh_token,
      grant_type: 'refresh_token'
    });

    const accessToken = refreshRes.data.access_token;
    if(!accessToken) throw new Error("No access token");

    const ADMIN = {
      id: uuidv4(),
      username: 'ksp_admin',
      email: 'admin@ksp.gov.in',
      password: 'KSP@Admin2024!',
      full_name: 'System Administrator',
      badge_number: 'KSP-ADMIN-001',
      Department: 'IT Cell', // Capitalized based on schema!
      role: 'ADMIN',
    };

    const password_hash = await bcrypt.hash(ADMIN.password, 12);
    
    const now = new Date();
    const dateStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0') + ' ' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0') + ':' + String(now.getSeconds()).padStart(2,'0');
    
    const rowData = {
      id:           ADMIN.id,
      username:     ADMIN.username,
      email:        ADMIN.email,
      password_hash,
      full_name:    ADMIN.full_name,
      role:         ADMIN.role,
      Department:   ADMIN.Department, // Use capitalized key
      badge_number: ADMIN.badge_number,
      is_active:    true,
      created_at:   dateStr,
      updated_at:   dateStr,
    };

    console.log('Inserting into Catalyst...');
    const url = 'https://api.catalyst.zoho.in/baas/v1/project/43082000000013050/table/system_users/row';
    const insertRes = await postRequest(url, [rowData], true, {
      'Authorization': `Zoho-oauthtoken ${accessToken}`,
      'PROJECT_ID': '50042774083',
      'X-Catalyst-Environment': 'Development',
      'Environment': 'Development',
      'X-CATALYST-USER': 'admin',
      'Accept': 'application/vnd.catalyst.v2+json'
    });

    console.log('INSERT RESULT:', JSON.stringify(insertRes, null, 2));
    
    if(insertRes.status === 200 || insertRes.status === 201 || insertRes.data.status === 'success') {
      console.log('SUCCESS_ADMIN_CREATED');
      console.log(JSON.stringify(ADMIN, null, 2));
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

run();
