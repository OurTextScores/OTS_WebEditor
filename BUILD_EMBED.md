# Building for Embed/Export

This guide explains how to build the score editor as a static export for embedding in other websites.

## Download Pre-built Release (Easiest)

Instead of building from source, you can download pre-built releases from GitHub:

1. **Go to Releases**: https://github.com/your-username/your-repo/releases
2. **Download** the latest release (`.tar.gz` or `.zip`)
3. **Extract** and deploy to your web server

See the included README in the release for deployment instructions.

## Build From Source

If you need to build from source or customize the build:

### Quick Start

#### Option 1: Using npm scripts (Easiest)

```bash
# 1. Move soundfonts out of public/ to avoid OOM during build
mv public/soundfonts ~/soundfonts.backup

# 2. Build embed version (one command)
npm run build:embed

# 3. Restore soundfonts for local development
mv ~/soundfonts.backup public/soundfonts
```

#### Option 2: Full release package (with archives)

```bash
# 1. Move soundfonts out
mv public/soundfonts ~/soundfonts.backup

# 2. Build and package (creates .tar.gz and .zip in release/)
npm run release:prepare

# 3. Restore soundfonts
mv ~/soundfonts.backup public/soundfonts
```

#### Option 3: Manual build with custom settings

```bash
# 1. Move soundfonts out of public/ to avoid OOM during build
mv public/soundfonts ~/soundfonts.backup

# 2. Run the embed build (uses MuseScore_General from OSUOSL CDN)
NEXT_PUBLIC_SOUNDFONT_CDN_URL=https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General \
NEXT_PUBLIC_BUILD_MODE=embed \
BUILD_MODE=embed \
npm run build

# 3. Restore soundfonts for local development
mv ~/soundfonts.backup public/soundfonts
```

## Output

The build generates a static export in the `out/` directory:
- **Size**: ~38MB (without soundfonts bundled)
- **Base path**: `/score-editor` (configurable in `next.config.ts`)
- **Format**: Static HTML/JS/CSS + WASM artifacts
- **Includes**: `<base href="/score-editor/">` tag for proper path resolution when embedded

## Soundfont Configuration

### Using the Recommended CDN (MuseScore_General)

The build above uses the free MuseScore_General soundfont from OSUOSL:
- **URL**: `https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General`
- **File**: `MuseScore_General.sf3` (38MB, compressed)
- **License**: Free and open source
- **Host**: Oregon State University Open Source Lab

This is the recommended option as it requires no additional setup.

### Using a Custom CDN

If you need to use a different soundfont:

1. Upload your soundfont files to a CDN (one of these naming patterns):
   - `MuseScore_General.sf3` / `MuseScore_General.sf2`
   - `default.sf3` / `default.sf2`

2. Set `NEXT_PUBLIC_SOUNDFONT_CDN_URL` to your CDN base URL:
   ```bash
   NEXT_PUBLIC_SOUNDFONT_CDN_URL=https://cdn.example.com/soundfonts \
   NEXT_PUBLIC_BUILD_MODE=embed \
   BUILD_MODE=embed \
   npm run build
   ```

### Local Soundfonts (Development Only)

For local development, keep soundfonts in `public/soundfonts/`:
```
public/soundfonts/default.sf3
public/soundfonts/default.sf2
```

The app will try CDN URLs first (if configured), then fall back to local paths.

## Deployment

1. Build the static export using the command above
2. Deploy the `out/` directory to your hosting provider
3. The app will be accessible at `https://your-domain.com/score-editor/`

### Example: Deploy to Netlify

```bash
# Build
npm run build

# Deploy (using Netlify CLI)
netlify deploy --dir=out --prod
```

### Example: Deploy to GitHub Pages

```bash
# Build
npm run build

# Copy to gh-pages branch
cp -r out/* ../gh-pages/
cd ../gh-pages
git add .
git commit -m "Update build"
git push origin gh-pages
```

## Embedding in Another Website

After deployment, you can embed the editor in an iframe:

```html
<iframe
  src="https://your-domain.com/score-editor/"
  width="100%"
  height="800px"
  frameborder="0"
  allow="autoplay"
></iframe>
```

## Build Troubleshooting

### Out of Memory (OOM) Errors

If you get OOM errors during build:

1. **Remove soundfonts from `public/` before building** (most common cause)
   ```bash
   mv public/soundfonts ~/soundfonts.backup
   ```

2. **Increase Node.js heap size** (if still failing):
   ```bash
   NODE_OPTIONS="--max-old-space-size=8192" npm run build
   ```

3. **Check your system has enough RAM** (build requires ~2-4GB)

### API Routes Not Working in Export

API routes that require server-side logic (like LLM integration) won't work in static export mode. The build:
- Uses static JSON files for instrument templates/clefs
- Disables features that require server-side processing

LLM calls in embed builds must either:
- Call providers directly from the browser (user supplies API key), or
- Use an external proxy via `NEXT_PUBLIC_LLM_PROXY_URL`

### Soundfont Not Loading

If soundfonts don't load in production:

1. Verify the CDN URL is correct and accessible
2. Check browser console for CORS errors
3. Ensure the soundfont file exists at the CDN URL:
   ```bash
   curl -I https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General.sf3
   ```

## Configuration Options

All options are set via environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `BUILD_MODE` | Enable static export | `embed` |
| `NEXT_PUBLIC_BUILD_MODE` | Client-side build mode flag | `embed` |
| `NEXT_PUBLIC_SOUNDFONT_CDN_URL` | CDN URL for soundfonts | `https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General` |

See `.env.example` for more details.

## What Gets Included in the Build

The `out/` directory contains:
- **HTML/JS/CSS**: Next.js compiled static assets
- **WASM artifacts**:
  - `webmscore.lib.wasm` (9.4MB)
  - `webmscore.lib.mem.wasm` (5.2MB)
  - `webmscore.lib.data` (4.0MB)
  - `webmscore.lib.js` (310KB)
- **Static data**:
  - `data/clefs.json` (84KB)
  - `data/templates.json` (95KB)
- **Test scores**: Sample `.mscz` files in `test_scores/`
- **Assets**: Icons, images, etc.

## Performance Notes

- **First load**: ~20MB download (WASM + initial JS bundle)
- **Soundfont load**: 38MB additional download on first audio playback (from CDN, cached by browser)
- **Score loading**: Fast, scores are typically <100KB
- **Rendering**: Real-time, uses WASM for layout/rendering

## License

The MuseScore_General soundfont is free and open source. See:
- https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General_License.md
