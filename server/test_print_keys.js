const fs = require('fs');
try {
  const config = JSON.parse(fs.readFileSync('C:/Users/Atharva/AppData/Roaming/zcatalyst-cli-nodejs/Config/zcatalyst-cli.json', 'utf8'));
  console.log('Root keys:', Object.keys(config));
  console.log('in keys:', Object.keys(config.in));
} catch (e) {
  console.error(e);
}
