# Creating a Release

This guide is for maintainers creating new releases.

## Automated Release (Recommended)

The easiest way to create a release is to push a version tag. GitHub Actions will automatically build and create the release.

### Steps

1. **Update version in package.json**:
   ```bash
   npm version patch  # or minor, or major
   # This creates a commit and tag
   ```

2. **Push the tag**:
   ```bash
   git push origin main --tags
   ```

3. **GitHub Actions will**:
   - Build the static export
   - Package as `.tar.gz` and `.zip`
   - Create SHA256 checksums
   - Create GitHub release with all artifacts
   - Add release notes automatically

4. **Edit the release** (optional):
   - Go to GitHub releases
   - Edit the release notes as needed
   - Highlight new features or changes

## Manual Release

If you prefer to create a release manually or need to customize the build:

### Prerequisites

- Ensure soundfonts are moved out of `public/` to avoid OOM:
  ```bash
  mv public/soundfonts ~/soundfonts.backup
  ```

### Build and Package

```bash
# Option 1: Use the convenience script (builds and packages)
npm run release:prepare

# Option 2: Step by step
npm run build:embed
npm run package:release
```

This creates the following files in `release/`:
- `score-editor-v0.1.0.tar.gz` - Tarball archive
- `score-editor-v0.1.0.zip` - Zip archive
- `score-editor-v0.1.0-README.md` - Instructions for users
- `score-editor-v0.1.0-checksums.txt` - SHA256 checksums

### Create GitHub Release

Using GitHub CLI (`gh`):

```bash
gh release create v0.1.0 \
  release/score-editor-v0.1.0.tar.gz \
  release/score-editor-v0.1.0.zip \
  release/score-editor-v0.1.0-README.md \
  release/score-editor-v0.1.0-checksums.txt \
  --title "Score Editor v0.1.0" \
  --notes "Release notes here"
```

Or manually via GitHub web interface:
1. Go to https://github.com/your-username/your-repo/releases
2. Click "Draft a new release"
3. Create a new tag (e.g., `v0.1.0`)
4. Upload the files from `release/`
5. Add release notes
6. Publish

### Restore Soundfonts

```bash
mv ~/soundfonts.backup public/soundfonts
```

## Version Numbering

We follow [Semantic Versioning](https://semver.org/):

- **Patch** (`0.1.X`): Bug fixes, small changes
- **Minor** (`0.X.0`): New features, backwards compatible
- **Major** (`X.0.0`): Breaking changes

Use npm version commands:
```bash
npm version patch  # 0.1.0 -> 0.1.1
npm version minor  # 0.1.0 -> 0.2.0
npm version major  # 0.1.0 -> 1.0.0
```

## Release Checklist

Before creating a release:

- [ ] All tests pass (`npm test`)
- [ ] Code is linted (`npm run lint`)
- [ ] WASM artifacts are up to date (`npm run sync:wasm`)
- [ ] Static data is generated (`npm run generate:data`)
- [ ] CHANGELOG.md is updated (if you maintain one)
- [ ] Version is bumped in package.json
- [ ] Soundfonts are moved out of `public/` directory

After creating a release:

- [ ] Test the release artifacts by downloading and extracting them
- [ ] Verify the bundled app works correctly
- [ ] Update documentation if needed
- [ ] Announce the release (if applicable)

## Testing a Release Locally

Before publishing, test the packaged release:

```bash
# Build and package
npm run release:prepare

# Extract to a test directory
mkdir -p /tmp/score-editor-test
tar -xzf release/score-editor-v0.1.0.tar.gz -C /tmp/score-editor-test

# Serve and test
cd /tmp/score-editor-test
python3 -m http.server 8080

# Open http://localhost:8080 and test functionality
```

## Troubleshooting

### OOM Error During Build

Move soundfonts out:
```bash
mv public/soundfonts ~/soundfonts.backup
```

Or increase Node heap size:
```bash
NODE_OPTIONS="--max-old-space-size=8192" npm run build:embed
```

### Missing WASM Files

Ensure WASM artifacts are present:
```bash
npm run sync:wasm
```

### Release Script Fails

Check required tools are installed:
- `tar` (for creating `.tar.gz`)
- `zip` (for creating `.zip`)
- `sha256sum` (for checksums)

On macOS, you may need to install GNU tar:
```bash
brew install gnu-tar
```

## Advanced: Custom CDN Configuration

To build with a different soundfont CDN:

```bash
NEXT_PUBLIC_SOUNDFONT_CDN_URL=https://your-cdn.com/soundfonts \
NEXT_PUBLIC_BUILD_MODE=embed \
BUILD_MODE=embed \
npm run build

npm run package:release
```

## Questions?
- Open an issue for questions or problems
