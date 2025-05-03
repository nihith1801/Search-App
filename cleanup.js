// Cleanup script to remove old start scripts
const fs = require('fs');
const path = require('path');

console.log('Cleaning up old start scripts...');

const filesToRemove = [
  'start-app.ps1',
  'start-app.bat'
];

filesToRemove.forEach(file => {
  const filePath = path.join(__dirname, file);
  
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      console.log(`Removed: ${file}`);
    } catch (err) {
      console.error(`Error removing ${file}: ${err.message}`);
    }
  } else {
    console.log(`File not found: ${file}`);
  }
});

console.log('Cleanup complete.');
console.log('');
console.log('Use the following commands to start the application:');
console.log('- Production mode: npm start');
console.log('- Development mode: npm run start:dev'); 