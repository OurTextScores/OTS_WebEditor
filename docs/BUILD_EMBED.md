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

# 2. Build embed version with CDN soundfont baked into static JS
NEXT_PUBLIC_SOUNDFONT_CDN_URL=https://cdn.ourtextscores.com/soundfonts/default.sf3 \
npm run build:embed

# 3. Restore soundfonts for local development
mv ~/soundfonts.backup public/soundfonts
```

Important:

- `NEXT_PUBLIC_SOUNDFONT_CDN_URL` is compile-time for static export builds.
- If you omit it, the built app will only try local `/soundfonts/*` fallback files.
- If a soundfont remains under `public/soundfonts/`, it will be copied into `out/`; move the
  directory out before building so the CDN asset is not vendored downstream.

#### Option 2: Full release package (with archives)

```bash
# 1. Move soundfonts out
mv public/soundfonts ~/soundfonts.backup

# 2. Build and package (creates .tar.gz and .zip in release/)
NEXT_PUBLIC_SOUNDFONT_CDN_URL=https://cdn.ourtextscores.com/soundfonts/default.sf3 \
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

## Embedding the Playback Player

The same static `index.html` provides a read-only playback surface. Select it with
`embed=player`; `embed=1` remains a compatibility alias:

```html
<iframe
  src="https://example.org/score-editor/index.html?score=%2Fscores%2Fexample.musicxml&amp;embed=player&amp;playerId=example-player&amp;parentOrigin=https%3A%2F%2Fexample.org"
  title="Playback of Example score"
  width="100%"
  height="640"
  loading="lazy"
  allow="autoplay"
></iframe>
```

The browser must be able to fetch `score` using same-origin access or suitable CORS headers.
Optional player parameters are:

- `start=<seconds>` for a finite start position, clamped to the performance duration;
- `follow=0` to disable score following initially;
- `theme=auto|light|dark`;
- `playerId=<bounded-id>` to identify host messages;
- `parentOrigin=<exact-origin>` to enable cross-origin host messaging.

The optional message API accepts commands only from `window.parent` at the exact configured
`parentOrigin`; wildcards are rejected. Commands use this versioned envelope:

```js
iframe.contentWindow.postMessage(
  {
    type: 'ots-player:command',
    version: 1,
    playerId: 'example-player',
    command: 'play', // play, pause, toggle, stop, seek, set-volume, set-follow
  },
  'https://example.org',
);
```

The player responds to the same exact origin with `ots-player:event` messages for `ready`,
`statechange`, `timeupdate`, `pagechange`, `ended`, and `error`. Seek values are milliseconds;
volume is between 0 and 1; follow is boolean. If `parentOrigin` is omitted, messaging defaults to
same-origin hosts. In-frame controls remain fully functional without the message API.

### Guardrail: Prevent Large Soundfont Files in `out/`

Before syncing `out/` into another repository (for example `OurTextScores/frontend/public/score-editor/`), verify `out/soundfonts/` is absent:

```bash
ls -la out/soundfonts 2>/dev/null || echo "OK: no out/soundfonts directory"
```

If it exists, remove it before copy:

```bash
rm -rf out/soundfonts
```

Safe sync command:

```bash
rsync -a --delete --exclude 'soundfonts/' out/ ../OurTextScores/frontend/public/score-editor/
```

## Vendoring into OurTextScores

OurTextScores embeds this editor in two separate ways:

- **Static UI**: the iframe at `OurTextScores/frontend/app/score-editor/page.tsx` loads `/score-editor/index.html`. Those static files are vendored in `OurTextScores/frontend/public/score-editor/`.
- **Companion API**: static export cannot run Next.js API routes. OurTextScores runs a separate `score_editor_api` service and proxies editor API calls through `/api/score-editor/*`.

That means updating the embedded editor usually has two parts:

1. Build the static embed export in this repository.
2. Copy the generated `out/` files into the OurTextScores vendored public directory.

From a sibling workspace layout like:

```text
workspace/
  OTS_Web/
  OurTextScores/
```

run:

```bash
cd ~/workspace/OTS_Web

NEXT_PUBLIC_SOUNDFONT_CDN_URL=https://cdn.ourtextscores.com/soundfonts/default.sf3 \
npm run build:embed

ls -la out/soundfonts 2>/dev/null || echo "OK: no out/soundfonts directory"

rsync -a --delete --exclude 'soundfonts/' \
  out/ \
  ../OurTextScores/frontend/public/score-editor/
```

The copied directory must contain `index.html`, `_next/`, and the WebAssembly/data artifacts such as:

```text
webmscore.lib.wasm
webmscore.lib.mem.wasm
webmscore.lib.data
webmscore.lib.symbols
```

(`webmscore.webpack.mjs` is not one of these -- it's the fork's JS bridge, imported from
`webmscore-fork/web-public/webmscore.webpack.mjs` and bundled into `_next/` by webpack. It
was never part of `public/`'s served-as-is static artifacts and does not need copying.)

Do not vendor `out/soundfonts/`. Keep soundfonts on a CDN or another external static host; large soundfont files can exceed GitHub file-size limits and make the host repository difficult to push.

After copying, rebuild/recreate the OurTextScores frontend image because Docker bakes `frontend/public/score-editor/` into the frontend build:

```bash
cd ~/workspace/OurTextScores
docker compose up -d --build frontend
```

If you are also running editor features that call `/api/music/*` or `/api/llm/*`, make sure the OurTextScores `score_editor_api` service mounts or uses the current editor source/runtime. For local development with the sibling checkout above, the service should point at `../OTS_Web:/app`.

## Updating the Editor API Docker Image (Production)

Production runs a pre-built Docker image for the `score_editor_api` service instead of mounting the source tree. The image is `ghcr.io/ourtextscores/ots-web-editor-api` and is built from `Dockerfile.editor-api` via the `publish-editor-api-image.yml` GitHub Actions workflow.

**Unlike the static embed, the Docker image is not rebuilt automatically when you push commits.** It is only rebuilt when you push a version tag or trigger the workflow manually.

### When you need to rebuild the image

Rebuild any time you change something that runs server-side inside `score_editor_api`:

- New or modified **API routes** under `app/api/` (e.g. adding `app/api/fetch-score/route.ts`)
- Changes to **server-side libraries** under `lib/` that are called from API routes
- Changes to **`tools/`** scripts (music21, kern conversion, etc.)
- Updates to the **WASM artifacts** (`public/webmscore.lib.*`) — these are copied into the image
- Dependency changes in `package.json` that affect server behaviour

You do **not** need to rebuild the image for changes that only affect the static embed UI (components, styles, client-side JS). Those are picked up by the `npm run build:embed` → rsync → frontend rebuild cycle above.

### How to trigger a rebuild

**Option 1 — Push a version tag** (creates a tagged release on GHCR):

```bash
cd ~/workspace/OTS_Web
git tag v<major>.<minor>.<patch>
git push origin v<major>.<minor>.<patch>
```

The `publish-editor-api-image.yml` workflow runs automatically and pushes both a versioned tag and `:latest` to GHCR.

**Option 2 — Trigger via GitHub CLI** (pushes `:latest` without a release tag):

```bash
gh workflow run publish-editor-api-image.yml --repo jhlusko/OTS_Web
```

Or trigger from the GitHub Actions UI under **Actions → Publish Editor API Image → Run workflow**.

### How to deploy the new image on the production server

After the workflow completes:

1. **Update the pinned tag** in the production `.env` file. The image tag is controlled by `OTS_EDITOR_API_IMAGE_TAG`; if it is pinned to an old version, `docker compose pull` will fetch the old image and the container will not update.

   ```bash
   # On the production server:
   grep OTS_EDITOR_API_IMAGE_TAG /opt/ourtextscores/.env   # check current value
   sed -i 's/OTS_EDITOR_API_IMAGE_TAG=.*/OTS_EDITOR_API_IMAGE_TAG=v0.7.0/' /opt/ourtextscores/.env
   ```

   Replace `v0.7.0` with the tag you just pushed. Alternatively, remove the line entirely to fall back to the `:latest` default — though an explicit tag is safer in production.

2. **Pull and recreate**:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.score-editor-image.yml pull score_editor_api
   docker compose -f docker-compose.yml -f docker-compose.score-editor-image.yml up -d --force-recreate score_editor_api
   ```

   The `--force-recreate` flag is required when the image digest changes even if the tag string stays the same (e.g. when using `:latest`).

3. **Verify** the new image is running:

   ```bash
   docker ps --format "{{.Names}}\t{{.Image}}\t{{.Status}}" | grep score_editor
   docker logs ourtextscores_score_editor_api --tail 20
   ```

   The image column should show the new tag and the logs should end with `▲ Next.js … ready`.

The relevant OurTextScores environment/build values are:

```bash
NEXT_PUBLIC_SCORE_EDITOR_URL=http://localhost:3000/score-editor
SCORE_EDITOR_API_ORIGIN=http://score_editor_api:3000
NEXT_PUBLIC_SCORE_EDITOR_API_BASE=/api/score-editor
```

These keep the browser on same-origin `/score-editor/*` assets while routing dynamic editor API calls through the host app's `/api/score-editor/*` proxy.

## VPS Compose Files Are Environment-Specific (Do NOT Auto-Sync)

**The `docker-compose*.yml` files on the OurTextScores prod VPS are hand-maintained and are
NOT copies of the repo files. Do not sync them from git — the repo versions are dev-oriented
and will break (or silently degrade the security of) production.** This is a deliberate
decision, made after an auto-sync attempt broke a deploy.

### Why the repo compose ≠ prod compose

`/opt/ourtextscores/` on the VPS is **not a git checkout**. Its compose files were authored
for production and differ from the repo's dev-oriented ones in ways that matter:

| Aspect           | Repo `docker-compose.yml` (dev)                            | Prod VPS `docker-compose.yml`                             |
| ---------------- | ---------------------------------------------------------- | --------------------------------------------------------- |
| Backend          | `build: ./backend` (needs source tree)                     | `image: ghcr.io/…/ourtextscores-backend` (pinned)         |
| Port binding     | `0.0.0.0` (e.g. `4000:4000`, `7700:7700`)                  | **`127.0.0.1:…`** (behind the reverse proxy)              |
| Services present | frontend, mailpit, minio, mongo, meili, … (full dev stack) | reduced set (no `frontend` — it's on Vercel — no mailpit) |
| Meili            | `MEILI_MASTER_KEY` defaulted                               | `MEILI_MASTER_KEY` required, `MEILI_ENV=production`       |
| Volumes          | `../mongo_data`, `../fossil_data`, …                       | prod paths (`./volumes/…`, `/mnt/pdmx`) + healthchecks    |

Two of these are actively dangerous to overwrite: the VPS has **no `./backend` source**, so a
build-based backend service fails with `path ".../backend" not found`; and the repo's
`0.0.0.0` bindings would **publicly expose** ports the VPS deliberately keeps on `127.0.0.1`.

### What this means operationally

- **`deploy-backend.yml`** (OurTextScores) only builds/pushes the **backend** image and runs
  `docker compose up -d backend` on the VPS. It does **not** copy compose files, and it does
  **not** touch `score_editor_api`.
- **Committing a `docker-compose*.yml` change to `main` does NOT deploy it.** Compose changes
  must be applied **by hand** on the VPS.
- The editor API image is likewise a **manual** rollout (see "Updating the Editor API Docker
  Image" above).

### How to change prod compose safely

1. `cd /opt/ourtextscores`
2. **Back up first:** `sudo cp docker-compose.score-editor-image.yml docker-compose.score-editor-image.yml.bk`
   (do the same for `docker-compose.yml` if editing it).
3. Edit **in place** — apply only the specific delta (e.g. adding the three API-auth env vars),
   never wholesale-replace with the repo file.
4. Recreate the affected service **with both files**:
   `docker compose -f docker-compose.yml -f docker-compose.score-editor-image.yml up -d --force-recreate score_editor_api`
5. Verify the running container: `docker compose … exec score_editor_api printenv | grep OTS_API_AUTH_TOKEN`

> **We evaluated auto-syncing compose via CI and rejected it.** The `.yml` files carry no
> secrets (only `${VAR}` interpolation from the VPS `.env`), so shipping them is _possible_,
> but the prod files are a genuinely different, hardened artifact that the repo does not model.
> Auto-copying the repo versions broke the backend deploy and would have exposed internal
> ports. If repo/prod parity is ever needed, the correct approach is to commit the **actual
> prod** compose as a dedicated `docker-compose.prod.yml` and deploy that — not to sync the
> dev files.

## Recommended Host Security Headers (Embed)

The embed is a **static export**, so it cannot emit response headers itself (and Next.js
middleware is incompatible with `output: 'export'`). The **hosting site** (OurTextScores /
its reverse proxy / Vercel) must set the security headers for the `/score-editor/*` assets.
The editor already sanitizes engine SVG output client-side (defense against a stored-XSS via
crafted score XML), but a Content-Security-Policy is the belt-and-suspenders layer.

Recommended response headers for the embedded editor's origin/path:

```
Content-Security-Policy:
  default-src 'self';
  base-uri 'self';
  object-src 'none';
  img-src 'self' data: blob: https:;
  font-src 'self' data:;
  style-src 'self' 'unsafe-inline';
  connect-src 'self' https:;              # LLM proxy, soundfont CDN, HF spaces
  worker-src 'self' blob:;
  script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline';
  frame-ancestors 'self' https://*.ourtextscores.com;   # allow the site to iframe it
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

Notes:

- `script-src` keeps `'unsafe-inline'` because a static export has no nonce mechanism; tighten
  to a nonce/hash policy only if you move off static export. `'wasm-unsafe-eval'` is required
  by the webmscore WASM runtime.
- `frame-ancestors` must list every origin that embeds the iframe (e.g. `www.` and apex
  `ourtextscores.com`), or the editor won't render inside the site.
- The **non-embed** build (the `score_editor_api` Next.js app) sets equivalent headers itself
  via `next.config.ts` `headers()` — no host action needed there.

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
   You can also set a direct file URL:
   ```bash
   NEXT_PUBLIC_SOUNDFONT_CDN_URL=https://cdn.example.com/soundfonts/default.sf3 npm run build:embed
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

LLM calls in embed builds should use a proxy:

- The app first tries same-origin `/api/llm/*` routes.
- You can force a different proxy origin with `NEXT_PUBLIC_LLM_PROXY_URL`.
- Claude/Anthropic requires a proxy because browser-direct Anthropic calls are blocked by CORS.
- OpenAI/Gemini can fall back to browser-direct calls if no proxy route exists.

### Companion API Proxy Required for Music Specialists (`/api/music/*`)

The music specialist and conversion stack now depends on server-side routes such as:

- `/api/music/convert`
- `/api/music/generate`
- `/api/music/context`
- `/api/music/artifacts/:id`

These routes require server-side execution/tooling (e.g. Python converters, artifact persistence, optional MuseScore/`abc2midi` validation) and **do not have a practical browser-direct fallback**.

Recommended embed deployment pattern:

- Host the editor UI as static files (`/score-editor/*`)
- Run a companion OTS Editor API service (Node runtime) for `/api/llm/*` and `/api/music/*`
- Reverse-proxy it through the host app (e.g. OurTextScores) under a same-origin prefix such as:
  - `/api/score-editor/llm/*`
  - `/api/score-editor/music/*`

Recommended client config direction:

- use a shared embed API base (for both LLM + music routes), e.g. `NEXT_PUBLIC_SCORE_EDITOR_API_BASE=/api/score-editor`

This avoids CORS issues and keeps embed deployments consistent with static export limitations.

### Analytics Telemetry

The editor emits client-side analytics events (e.g. `score_editor_runtime_loaded`, `score_editor_page_view`) via `POST /api/analytics/events`. The target path is controlled by `NEXT_PUBLIC_ANALYTICS_EVENTS_PATH` (default: `/api/analytics/events`).

**Same-origin iframe deployment** (e.g. OurTextScores at `/score-editor/index.html`): Analytics works automatically — the editor's fetch hits the host app's existing `/api/analytics/events` route. No additional proxy rules needed.

**Standalone / cross-origin embed**: Events are silently dropped unless the hosting page provides an endpoint at the configured path. This is by design — analytics is optional and should never block the editor UI.

**Test-embed server**: Provides an in-memory analytics stub (`POST /api/analytics/events` → 201, `GET /api/analytics/__test-log` to inspect captured events) for integration testing. See `test-embed/README.md`.

### Soundfont Not Loading

If soundfonts don't load in production:

1. Publish the compressed file before deploying a bundle that points to it. For the current
   OurTextScores asset, the expected source is `public/soundfonts/default.sf3`, 39,900,972 bytes,
   SHA-256 `5b85b6c2c61d10b2b91cddd41efcce7b25cd31c8271d511c73afafbef20b6fa3`.
   Upload it with `Content-Type: application/octet-stream` and
   `Cache-Control: public, max-age=31536000, immutable`. Configure the CDN to cache this path;
   do not release while Cloudflare still reports `DYNAMIC`.
2. Verify the CDN URL, size and cache policy:
   ```bash
   curl -I https://cdn.ourtextscores.com/soundfonts/default.sf3
   ```
   Expect `200`, `content-length: 39900972`, the immutable `cache-control` value above, and
   `cf-cache-status: HIT` after warming the URL once.
3. Verify CORS from the app origin:
   ```bash
   curl -I -H "Origin: https://www.ourtextscores.com" https://cdn.ourtextscores.com/soundfonts/default.sf3
   ```
   Response should include `access-control-allow-origin`.
4. Verify the URL is baked into the exported JS bundle:
   ```bash
   grep -Rho "https://cdn.ourtextscores.com/soundfonts/default.sf3" out/_next/static/chunks | head -n 1
   ```
5. Verify you did not accidentally ship a local bundled soundfont:
   ```bash
   ls -la out/soundfonts 2>/dev/null || echo "OK: no bundled soundfonts"
   ```

## Configuration Options

All options are set via environment variables:

| Variable                            | Description                                                              | Example                                                |
| ----------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------ |
| `BUILD_MODE`                        | Enable static export                                                     | `embed`                                                |
| `NEXT_PUBLIC_BUILD_MODE`            | Client-side build mode flag                                              | `embed`                                                |
| `NEXT_PUBLIC_SOUNDFONT_CDN_URL`     | CDN URL for soundfonts                                                   | `https://cdn.ourtextscores.com/soundfonts/default.sf3` |
| `NEXT_PUBLIC_SCORE_EDITOR_API_BASE` | Same-origin proxy base for editor API routes in embed mode (LLM + music) | `/api/score-editor`                                    |
| `NEXT_PUBLIC_ANALYTICS_EVENTS_PATH` | Path for analytics event ingestion                                       | `/api/analytics/events`                                |

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
- **Soundfont load**: 38MB additional download, started in the background as soon as a score finishes loading (not deferred to first playback), from CDN and cached by the browser. For large scores the WASM-side install is deferred until playback so it does not compete with layout; the network fetch still starts early.
- **Score loading**: Fast, scores are typically <100KB
- **Rendering**: Real-time, uses WASM for layout/rendering

## License

The MuseScore_General soundfont is free and open source. See:

- https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General_License.md
