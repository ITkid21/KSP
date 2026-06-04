const fs = require('fs');
const path = require('path');

const src = path.resolve(__dirname, '..', '..', 'client', 'dist');
const dest = path.resolve(__dirname, '..', 'dist');
const rootDest = path.resolve(__dirname, '..', '..', 'dist');

function copyFolderSync(from, to) {
  if (!fs.existsSync(from)) {
    console.error(`Source directory ${from} does not exist!`);
    process.exit(1);
  }
  if (fs.existsSync(to)) {
    fs.rmSync(to, { recursive: true, force: true });
  }
  fs.mkdirSync(to, { recursive: true });
  fs.readdirSync(from).forEach(element => {
    const fromPath = path.join(from, element);
    const toPath = path.join(to, element);
    if (fs.lstatSync(fromPath).isDirectory()) {
      copyFolderSync(fromPath, toPath);
    } else {
      fs.copyFileSync(fromPath, toPath);
    }
  });
}

console.log(`Copying client/dist to server/dist...`);
copyFolderSync(src, dest);
console.log(`Copying client/dist to root/dist...`);
copyFolderSync(src, rootDest);
console.log('Copy complete!');
