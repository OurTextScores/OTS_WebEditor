# OurTextScores Web Editor (Phase 0)

Browser-based music score editor using MuseScore’s engraving engine (`libmscore`) compiled to WebAssembly (via a `webmscore` fork).

## Git LFS Required

This repo stores large WASM/soundfont assets in Git LFS. If you clone without LFS, you’ll get pointer files and the app won’t run.

```bash
git lfs install
git clone https://github.com/OurTextScores/OTS_Web.git
cd OTS_Web
git lfs pull
```

## Getting Started

First, run the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Embed Mode - External XML Comparison

The score editor can be embedded as a standalone XML diff viewer by providing two external XML file URLs as URL parameters.

### URL Parameters

```
/?compareLeft=<url>&compareRight=<url>&leftLabel=<label>&rightLabel=<label>
```

| Parameter | Required | Description | Example |
|-----------|----------|-------------|---------|
| `compareLeft` | Yes | URL to left/old XML file | `https://example.com/v1.xml` |
| `compareRight` | Yes | URL to right/new XML file | `https://example.com/v2.xml` |
| `leftLabel` | No | Label for left pane (default: "Left") | `Version 1` |
| `rightLabel` | No | Label for right pane (default: "Right") | `Version 2` |

### Example Usage

**Basic comparison:**
```
http://localhost:3000/?compareLeft=https://raw.githubusercontent.com/user/repo/main/old.xml&compareRight=https://raw.githubusercontent.com/user/repo/main/new.xml
```

**With custom labels:**
```
http://localhost:3000/?compareLeft=https://example.com/old.xml&compareRight=https://example.com/new.xml&leftLabel=Before&rightLabel=After
```

### Embed Mode Features

- **Full-screen compare view**: Only the diff viewer is displayed (no editor toolbar or sidebar)
- **Visual diff highlighting**: Shows differences between scores with color-coded blocks
- **Swap functionality**: Switch left and right panes
- **Open in Editor**: Click "📝 Open in Editor" button above each score to open it in a new tab with the full editor for editing
- **Read-only compare mode**: No editing controls in compare view (checkpoint saving and overwrite features are hidden)
- **CORS support**: Can load files from external URLs (requires proper CORS headers)

### iframe Integration

You can embed the diff viewer in other web pages:

```html
<iframe
  src="https://your-domain.com/?compareLeft=https://example.com/v1.xml&compareRight=https://example.com/v2.xml&leftLabel=Old&rightLabel=New"
  width="100%"
  height="800px"
  frameborder="0"
  style="border: 1px solid #ccc; border-radius: 4px;"
></iframe>
```
