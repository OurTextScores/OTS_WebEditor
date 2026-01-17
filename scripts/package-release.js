const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const OUTPUT_DIR = path.join(process.cwd(), 'out');
const RELEASE_DIR = path.join(process.cwd(), 'release');
const PACKAGE_JSON = require('../package.json');

// Get version from package.json or command line
const version = process.argv[2] || PACKAGE_JSON.version;
const archiveName = `score-editor-v${version}`;

console.log(`📦 Packaging release: ${archiveName}`);

// Check if out/ exists
if (!fs.existsSync(OUTPUT_DIR)) {
    console.error('❌ Error: out/ directory not found. Run "npm run build" first.');
    process.exit(1);
}

// Create release directory
if (!fs.existsSync(RELEASE_DIR)) {
    fs.mkdirSync(RELEASE_DIR, { recursive: true });
}

// Create tarball
const tarballPath = path.join(RELEASE_DIR, `${archiveName}.tar.gz`);
console.log('📦 Creating tarball...');
try {
    execSync(`tar -czf "${tarballPath}" -C out .`, { stdio: 'inherit' });
    const stats = fs.statSync(tarballPath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`✅ Created: ${tarballPath} (${sizeMB} MB)`);
} catch (err) {
    console.error('❌ Failed to create tarball:', err.message);
    process.exit(1);
}

// Create zip file
const zipPath = path.join(RELEASE_DIR, `${archiveName}.zip`);
const zipName = `${archiveName}.zip`;
console.log('📦 Creating zip...');
try {
    execSync(`cd out && zip -r "${path.join('..', 'release', zipName)}" . -q`, { stdio: 'inherit' });
    const stats = fs.statSync(zipPath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`✅ Created: ${zipPath} (${sizeMB} MB)`);
} catch (err) {
    console.error('❌ Failed to create zip:', err.message);
    process.exit(1);
}

// Create a README for the release
const releaseReadme = `# Score Editor v${version}

This is a static export build of the Score Editor, ready to be deployed to any web server or hosting platform.

## What's Included

- Complete static HTML/JS/CSS application
- WASM artifacts for score rendering
- Static data files (instrument templates, clefs)
- Sample test scores
- Base path: \`/score-editor\`

## Quick Start

### Option 1: Deploy to a Web Server

1. Extract this archive:
   \`\`\`bash
   tar -xzf ${archiveName}.tar.gz -d score-editor
   # or
   unzip ${archiveName}.zip -d score-editor
   \`\`\`

2. Upload the \`score-editor/\` directory to your web server

3. Access at: \`https://your-domain.com/score-editor/\`

### Option 2: Test Locally with Python

\`\`\`bash
# Extract the archive
tar -xzf ${archiveName}.tar.gz -d score-editor

# Serve with Python
cd score-editor
python3 -m http.server 8080

# Open http://localhost:8080 in your browser
\`\`\`

### Option 3: Test Locally with Node.js

\`\`\`bash
# Extract and install serve
tar -xzf ${archiveName}.tar.gz -d score-editor
npm install -g serve

# Serve the directory
serve score-editor -l 8080

# Open http://localhost:8080 in your browser
\`\`\`

## Deployment Examples

### Netlify
\`\`\`bash
tar -xzf ${archiveName}.tar.gz -d score-editor
cd score-editor
netlify deploy --prod
\`\`\`

### Vercel
\`\`\`bash
tar -xzf ${archiveName}.tar.gz -d score-editor
cd score-editor
vercel --prod
\`\`\`

### GitHub Pages
\`\`\`bash
tar -xzf ${archiveName}.tar.gz -d score-editor
cd score-editor
git init
git add .
git commit -m "Deploy v${version}"
git remote add origin https://github.com/username/repo.git
git push -u origin gh-pages
\`\`\`

### AWS S3 + CloudFront
\`\`\`bash
tar -xzf ${archiveName}.tar.gz -d score-editor
aws s3 sync score-editor/ s3://your-bucket/score-editor/ --acl public-read
\`\`\`

## Embedding

Embed in another website using an iframe:

\`\`\`html
<iframe
  src="https://your-domain.com/score-editor/"
  width="100%"
  height="800px"
  frameborder="0"
  allow="autoplay"
></iframe>
\`\`\`

## Configuration

This build is configured to:
- Load soundfonts from: \`https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General\`
- Use base path: \`/score-editor\`

## System Requirements

- Modern web browser with WebAssembly support
- HTTPS recommended (required for some features)
- ~50MB disk space

## Features

- Load and edit MuseScore (.mscz) files
- Export to MusicXML, MIDI, PDF, PNG, SVG
- Audio playback and export (requires soundfont from CDN)
- Full music notation editing
- Multiple instrument support

## License

See the main repository for license information.

## Support

For issues, questions, or contributions, visit:
https://github.com/your-username/your-repo

---

Built on: ${new Date().toISOString()}
Version: ${version}
`;

const readmePath = path.join(RELEASE_DIR, `${archiveName}-README.md`);
fs.writeFileSync(readmePath, releaseReadme);
console.log(`✅ Created: ${readmePath}`);

// Create checksums
console.log('🔐 Generating checksums...');
const checksumFile = path.join(RELEASE_DIR, `${archiveName}-checksums.txt`);
const checksums = [];

try {
    const tarSha256 = execSync(`sha256sum "${tarballPath}"`, { encoding: 'utf-8' }).trim();
    checksums.push(tarSha256);

    const zipSha256 = execSync(`sha256sum "${zipPath}"`, { encoding: 'utf-8' }).trim();
    checksums.push(zipSha256);

    fs.writeFileSync(checksumFile, checksums.join('\n') + '\n');
    console.log(`✅ Created: ${checksumFile}`);
} catch (err) {
    console.warn('⚠️  Could not generate checksums (sha256sum not available)');
}

console.log('\n✨ Release packaging complete!');
console.log('\n📋 Release artifacts:');
console.log(`   - ${path.basename(tarballPath)}`);
console.log(`   - ${path.basename(zipPath)}`);
console.log(`   - ${path.basename(readmePath)}`);
if (fs.existsSync(checksumFile)) {
    console.log(`   - ${path.basename(checksumFile)}`);
}
console.log('\n📤 Next steps:');
console.log('   1. Create a new GitHub release');
console.log('   2. Upload the files from release/ directory');
console.log('   3. Or use: gh release create v' + version + ' release/*');
