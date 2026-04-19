#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const versionFilePath = path.join(__dirname, '..', 'src', 'version.ts');

// Read the current version file
const content = fs.readFileSync(versionFilePath, 'utf8');

// Extract current version (e.g., '1.0.0')
const versionMatch = content.match(/APP_VERSION = '(\d+)\.(\d+)\.(\d+)'/);
if (!versionMatch) {
  console.error('Could not find APP_VERSION in version.ts');
  process.exit(1);
}

const major = parseInt(versionMatch[1], 10);
const minor = parseInt(versionMatch[2], 10);
const patch = parseInt(versionMatch[3], 10);

// Increment patch version
const newPatch = patch + 1;
const newVersion = `${major}.${minor}.${newPatch}`;

// Update the file with new version
const newContent = content.replace(
  /APP_VERSION = '\d+\.\d+\.\d+'/,
  `APP_VERSION = '${newVersion}'`
);

fs.writeFileSync(versionFilePath, newContent, 'utf8');

console.log(`Version incremented: ${major}.${minor}.${patch} -> ${newVersion}`);
