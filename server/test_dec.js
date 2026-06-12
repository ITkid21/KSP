const Crypt = require('C:/Users/Atharva/AppData/Roaming/npm/node_modules/zcatalyst-cli/lib/authentication/crypt.js').default;
const decrypter = new Crypt('ZC_TRAM');
const fs = require('fs');

try {
  const config = JSON.parse(fs.readFileSync('C:/Users/Atharva/AppData/Roaming/zcatalyst-cli-nodejs/Config/zcatalyst-cli.json', 'utf8'));
  const encryptedCred = config.in.credential;
  const dec = decrypter.decrypt(encryptedCred);
  console.log('Decrypted credential:', JSON.stringify(dec, null, 2));
} catch (e) {
  console.error('Error decrypting:', e);
}
