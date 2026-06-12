const fs = require('fs');
const content = fs.readFileSync('C:/Users/Atharva/AppData/Roaming/zcatalyst-cli-nodejs/Config/zcatalyst-cli.json', 'utf8');

// Search for project ID
const index = content.indexOf('43082000000013050');
if (index !== -1) {
  console.log('Found project ID in file at character index:', index);
  console.log('Surrounding content:', content.substring(index - 200, index + 500));
} else {
  console.log('Project ID not found in zcatalyst-cli.json');
}
