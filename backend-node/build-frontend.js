const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

try {
  console.log('Starting frontend build process...');
  const frontendDir = path.join(__dirname, '../frontend');
  const publicDir = path.join(__dirname, 'public');

  // Install dependencies in frontend
  console.log('Running npm install in frontend...');
  execSync('npm install --legacy-peer-deps', { cwd: frontendDir, stdio: 'inherit' });

  // Build frontend
  console.log('Running npm run build in frontend...');
  execSync('npm run build', { cwd: frontendDir, stdio: 'inherit' });

  // Copy build to public
  console.log('Copying build output to backend public folder...');
  if (fs.existsSync(publicDir)) {
    fs.rmSync(publicDir, { recursive: true, force: true });
  }
  fs.mkdirSync(publicDir, { recursive: true });
  fs.cpSync(path.join(frontendDir, 'build'), publicDir, { recursive: true });

  console.log('Frontend build and integration completed successfully!');
} catch (error) {
  console.error('Error during frontend build process:', error);
  process.exit(1);
}
