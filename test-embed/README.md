# Embed Test Application

Simple local test application for verifying the embedded score editor build works correctly.

## Quick Start

### 1. Build the embed version

```bash
cd ~/workspace/OTS_Web

# Move soundfonts out to avoid OOM
mv public/soundfonts ~/soundfonts.backup

# Build embed version
npm run build:embed

# Restore soundfonts
mv ~/soundfonts.backup public/soundfonts
```

### 2. Start the test server

```bash
# Option 1: Using npm script
npm run test:embed

# Option 2: Using node directly
node test-embed/server.js

# Optional: choose a different port
PORT=8091 node test-embed/server.js
```

### 3. Open in browser

Visit: **http://localhost:8080/**

## What This Tests

This test application simulates how the score editor works when embedded in another website:

- **Main page**: `http://localhost:8080/` - Shows an iframe embedding the editor
- **Score editor**: `http://localhost:8080/score-editor/` - The actual embedded editor
- **WASM files**: Should load from `http://localhost:8080/score-editor/webmscore.lib.*`
- **Claude proxy**: `http://localhost:8080/api/llm/anthropic*` - Local Anthropic proxy for embed-mode Claude
- **Gemini proxy**: `http://localhost:8080/api/llm/gemini*` - Local Gemini proxy for embed-mode Gemini

## Expected Behavior

When working correctly, you should see:

1. The main page loads with an iframe
2. Inside the iframe, the score editor loads
3. Browser console shows:
   ```
   webmscore initialized
   GET http://localhost:8080/score-editor/webmscore.lib.wasm [200 OK]
   GET http://localhost:8080/score-editor/webmscore.lib.data [200 OK]
   GET http://localhost:8080/score-editor/webmscore.lib.mem.wasm [200 OK]
   ```

## Troubleshooting

### 404 Errors for WASM Files

If you see errors like:
```
GET http://localhost:8080/webmscore.lib.wasm [404 Not Found]
```

This means the base tag is missing or not being respected. Check:

1. **Verify base tag in HTML**:
   ```bash
   grep -o '<base[^>]*>' out/index.html
   ```
   Should show: `<base href="/score-editor/"/>`

2. **Clear browser cache**: Hard refresh with Ctrl+Shift+R

3. **Rebuild**: If base tag is missing, rebuild with `npm run build:embed`

### Server Won't Start

Make sure nothing else is using port 8080:
```bash
lsof -i :8080
```

To use a different port, set `PORT` when starting the server:
```bash
PORT=8091 node test-embed/server.js
```

## How It Works

The test server (`server.js`) routes requests:

- `http://localhost:8080/` → `test-embed/index.html` (wrapper page)
- `http://localhost:8080/score-editor/*` → `out/*` (embedded build)
- `http://localhost:8080/api/llm/anthropic*` → Anthropic API proxy
- `http://localhost:8080/api/llm/gemini*` → Gemini API proxy

This exactly simulates the setup in OurTextScores where:
- Next.js serves the main application
- Static files in `public/score-editor/` serve the embedded editor
