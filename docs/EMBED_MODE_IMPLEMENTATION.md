# Embed Mode Implementation Summary

## Status Note (2026-02)

This document is primarily a historical implementation snapshot for compare/embed UI behavior.

Some line references and implementation details may be out of date. In particular:

- modern OTS builds now include first-class `/api/llm/*` routes and `/api/music/*` routes for AI/music workflows
- static embed deployments still cannot run those routes directly
- embed deployments that use AI/music features require a companion proxy/service runtime (recommended: same-origin reverse proxy via host app)

## Overview
Implemented external XML comparison embed mode that allows loading two MusicXML files via URL parameters and displaying only the compare view without editor UI.

## Changes Made

### 1. ScoreEditor.tsx Modifications

#### URL Parameter Detection (lines 285-289)
```typescript
const compareLeftUrl = searchParams.get('compareLeft');
const compareRightUrl = searchParams.get('compareRight');
const leftLabel = searchParams.get('leftLabel') || 'Left';
const rightLabel = searchParams.get('rightLabel') || 'Right';
const isEmbedMode = Boolean(compareLeftUrl && compareRightUrl);
```

#### External File Loading (lines 849-891)
- Added useEffect hook to fetch external XML files
- Loads both files in parallel using fetch()
- Loads right file as main score
- Sets up compare view with both XMLs
- Handles errors with user-friendly alerts
- Shows loading state during fetch

**Bug Fix Applied:**
- Removed `handleFileUpload` from dependency array to fix "can't access lexical declaration before initialization" error
- Added eslint-disable comment for exhaustive-deps rule

#### UI Conditionals for Embed Mode
- **Toolbar hidden** (line 6063): Wrapped in `{!isEmbedMode && ...}`
- **Checkpoint sidebar hidden** (line 6169): Wrapped in `{!isEmbedMode && ...}`
- **Save checkpoint buttons hidden** (lines 7075, 7324): Wrapped in `{!isEmbedMode && ...}`
- **Overwrite arrows hidden** (line 7267): Changed condition to `{!isEmbedMode && canOverwrite && ...}`
- **"Open in Editor" buttons shown** (lines 7084, 7362): Wrapped in `{isEmbedMode && ...}` - allows users to open either score in the full editor

#### Custom Labels (lines 1114-1119)
```typescript
const compareLeftLabel = isEmbedMode
    ? (compareSwapped ? rightLabel : leftLabel)
    : (compareSwapped ? compareCheckpointTitle : 'Current');
const compareRightLabel = isEmbedMode
    ? (compareSwapped ? leftLabel : rightLabel)
    : (compareSwapped ? 'Current' : compareCheckpointTitle);
```

#### Loading Overlay (lines 7437-7445)
Full-screen loading spinner displayed while fetching external files in embed mode.

#### Open in Editor Handler (lines 2793-2804)
```typescript
const handleOpenScoreInEditor = useCallback((side: 'left' | 'right') => {
    if (!compareView) return;

    // Get the XML for the selected side
    const xml = side === 'left' ? compareLeftXml : compareRightXml;
    const label = side === 'left' ? compareLeftLabel : compareRightLabel;

    // Store XML in sessionStorage for the new tab to pick up
    const filename = `${label.replace(/[^a-zA-Z0-9]/g, '_')}.xml`;
    sessionStorage.setItem('openInEditor', JSON.stringify({ xml, filename }));

    // Open a new tab with the full editor
    window.open('/', '_blank');
}, [compareView, compareLeftXml, compareRightXml, compareLeftLabel, compareRightLabel]);
```

This handler:
1. Extracts the XML from the selected side
2. Stores it in sessionStorage with a sanitized filename
3. Opens a new browser tab to the root URL
4. The new tab picks up the XML from sessionStorage and loads it in the full editor

#### Load from Session Storage (lines 894-915)
```typescript
useEffect(() => {
    const openInEditorData = sessionStorage.getItem('openInEditor');
    if (!openInEditorData) return;

    const loadScoreFromSession = async () => {
        try {
            const { xml, filename } = JSON.parse(openInEditorData);

            // Clear the sessionStorage
            sessionStorage.removeItem('openInEditor');

            // Create a File object and load it
            const blob = new Blob([xml], { type: 'application/xml' });
            const file = new File([blob], filename);
            await handleFileUpload(file, { preserveScoreId: false, updateUrl: false });
        } catch (err) {
            console.error('Failed to load score from session:', err);
        }
    };

    loadScoreFromSession();
}, []);
```

This effect runs once on component mount, checks for XML in sessionStorage, and loads it if present. This allows seamless transfer of score data between the embed mode tab and the new editor tab.

### 2. README.md Documentation
Added comprehensive documentation including:
- URL parameter schema table
- Example URLs for basic and labeled comparisons
- Feature list
- iframe integration examples

### 3. Playwright Test Suite
Created `tests/embed-mode.spec.ts` with 13 comprehensive tests:

#### URL Parameter Tests
- ✅ Detects embed mode when both URLs present
- ✅ Does not activate with only one URL
- ✅ Uses custom labels from parameters
- ✅ Uses default labels when not specified

#### UI Visibility Tests
- ✅ Hides toolbar in embed mode
- ✅ Hides checkpoint sidebar in embed mode
- ✅ Hides save checkpoint buttons in embed mode
- ✅ Hides overwrite arrows in embed mode

#### Functionality Tests
- ✅ Shows loading state while fetching
- ✅ Handles fetch errors gracefully
- ✅ Displays compare panes with loaded scores
- ✅ Allows swapping sides in embed mode

## URL Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `compareLeft` | Yes | - | URL to left/old XML file |
| `compareRight` | Yes | - | URL to right/new XML file |
| `leftLabel` | No | "Left" | Label for left pane |
| `rightLabel` | No | "Right" | Label for right pane |

## Example Usage

### Basic Comparison
```
http://localhost:3000/?compareLeft=https://example.com/v1.xml&compareRight=https://example.com/v2.xml
```

### With Custom Labels
```
http://localhost:3000/?compareLeft=https://example.com/old.xml&compareRight=https://example.com/new.xml&leftLabel=Before&rightLabel=After
```

### iframe Embed
```html
<iframe
  src="https://your-domain.com/?compareLeft=...&compareRight=...&leftLabel=Old&rightLabel=New"
  width="100%"
  height="800px"
  frameborder="0"
></iframe>
```

## Testing

### Run Playwright Tests
```bash
npm run test:e2e -- tests/embed-mode.spec.ts
```

### Manual Testing
1. Start dev server: `npm run dev`
2. Navigate to URL with parameters
3. Verify:
   - No toolbar visible
   - No sidebar visible
   - Compare view displays full-screen
   - Custom labels appear if provided
   - Swap button works
   - No save/overwrite buttons visible

## CORS Considerations

External URLs must have proper CORS headers set to allow cross-origin requests:

```
Access-Control-Allow-Origin: *
```

For GitHub raw files, this is automatically configured.
For custom servers, ensure CORS is properly configured.

## Known Limitations

1. Both URLs must be publicly accessible
2. Files must be valid MusicXML format
3. CORS must be enabled on external servers
4. **Read-only mode**: No checkpoint/overwrite functionality in embed mode (by design - prevents "index out of bounds" errors when attempting to mutate externally loaded scores)
5. Loading errors show browser alert (future: improve UX)

## Future Enhancements

- [ ] Better error UI instead of browser alerts
- [ ] Progress indicators for large file downloads
- [ ] Support for compressed MusicXML (.mxl files)
- [ ] Option to hide/show swap button via parameter
- [ ] Embed mode detection in analytics
- [ ] Support for loading from data URLs
