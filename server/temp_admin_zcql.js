const Crypt = require('C:/Users/Atharva/AppData/Roaming/npm/node_modules/zcatalyst-cli/lib/authentication/crypt.js').default;
const decrypter = new Crypt('ZC_TRAM');
const fs = require('fs');
const https = require('https');
const catalyst = require('zcatalyst-sdk-node');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

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
        try { resolve(JSON.parse(body)); } catch (e) { resolve(body); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function run() {
  try {
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

    const ADMIN = {
      id: uuidv4(),
      username: 'ksp_admin',
      email: 'admin@ksp.gov.in',
      password: 'KSP@Admin2024!',
      full_name: 'System Administrator',
      badge_number: 'KSP-ADMIN-001',
      department: 'IT Cell',
      role: 'ADMIN',
    };

    const password_hash = await bcrypt.hash(ADMIN.password, 12);
    const now = new Date().toISOString();
    
    console.log('Inserting via ZCQL...');
    const insertQuery = `INSERT INTO system_users (id, username, email, password_hash, full_name, role, department, badge_number, is_active, created_at, updated_at) VALUES ('${ADMIN.id}', '${ADMIN.username}', '${ADMIN.email}', '${password_hash}', '${ADMIN.full_name}', '${ADMIN.role}', '${ADMIN.department}', '${ADMIN.badge_number}', true, '${now}', '${now}')`;
    
    const resInsert = await app.zcql().executeZCQLQuery(insertQuery);
    console.log('INSERT RESULT:', JSON.stringify(resInsert));
    
    console.log('SUCCESS_ADMIN_CREATED');
    console.log(JSON.stringify(ADMIN, null, 2));
    
    // Verify it exists:
    const res = await app.zcql().executeZCQLQuery(`SELECT * FROM system_users WHERE username = 'ksp_admin'`);
    console.log('VERIFY QUERY RESULT:', JSON.stringify(res, null, 2));
  } catch (err) {
    console.error('Error:', err);
  }
}

run();
