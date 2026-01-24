# Compare Embed Mode - External XML Diff Viewer

Last updated: 2026-01-24

## Purpose

Enable the score editor to be embedded as a standalone XML diff viewer for the OurTextScores repository, replacing the current musical diff section.

## Requirements

1. ✅ Load two external XML files via URL parameters
2. ✅ Display only the compare view (no score editor UI)
3. ✅ Show visual diff highlighting (no overwrite/checkpoint features)
4. ✅ Support external URLs with CORS
5. ✅ Minimal UI - just the diff view

## URL Schema

```
/?compareLeft=<url>&compareRight=<url>&leftLabel=<label>&rightLabel=<label>
```

### Parameters

| Parameter | Required | Description | Example |
|-----------|----------|-------------|---------|
| `compareLeft` | Yes | URL to left/old XML file | `https://example.com/v1.xml` |
| `compareRight` | Yes | URL to right/new XML file | `https://example.com/v2.xml` |
| `leftLabel` | No | Label for left pane | `Version 1` |
| `rightLabel` | No | Label for right pane | `Version 2` |

### Example URLs

**Basic:**
```
/?compareLeft=https://raw.githubusercontent.com/user/repo/main/old.xml&compareRight=https://raw.githubusercontent.com/user/repo/main/new.xml
```

**With Labels:**
```
/?compareLeft=https://example.com/old.xml&compareRight=https://example.com/new.xml&leftLabel=Before&rightLabel=After
```

## UI in Embed Mode

### Show:
- ✅ Compare view modal (full screen)
- ✅ Left and right score panes with diff highlighting
- ✅ Swap button in gutter
- ✅ Part information below each pane
- ✅ Gutter with diff blocks

### Hide:
- ❌ Toolbar
- ❌ Checkpoint panel
- ❌ Checkpoint save buttons
- ❌ Overwrite arrows
- ❌ File upload
- ❌ New score dialog
- ❌ All editing controls

### Simplified Compare View:
- Remove "Save checkpoint" buttons
- Remove overwrite arrows (→ and ←)
- Keep swap button
- Keep close button (returns to blank state)
- Keep diff highlighting
- Keep measure alignment visualization

## Implementation Plan

### Phase 1: URL Parameter Detection & File Loading

```typescript
// Detect embed mode
const compareLeftUrl = searchParams.get('compareLeft');
const compareRightUrl = searchParams.get('compareRight');
const isEmbedMode = Boolean(compareLeftUrl && compareRightUrl);
const leftLabel = searchParams.get('leftLabel') || 'Left';
const rightLabel = searchParams.get('rightLabel') || 'Right';
```

### Phase 2: Load External Files

```typescript
useEffect(() => {
  if (!compareLeftUrl || !compareRightUrl) return;

  const loadExternalCompare = async () => {
    setCheckpointBusy(true);
    try {
      // Load both files in parallel
      const [leftResponse, rightResponse] = await Promise.all([
        fetch(compareLeftUrl),
        fetch(compareRightUrl),
      ]);

      if (!leftResponse.ok || !rightResponse.ok) {
        throw new Error('Failed to fetch files');
      }

      const leftXml = await leftResponse.text();
      const rightXml = await rightResponse.text();

      // Load right file as main score
      const rightBlob = new Blob([rightXml], { type: 'application/xml' });
      const rightFile = new File([rightBlob], 'right.xml');
      await handleFileUpload(rightFile, { preserveScoreId: false, updateUrl: false });

      // Set up compare view
      setCompareView({
        title: leftLabel,
        currentXml: rightXml,
        checkpointXml: leftXml,
      });

    } catch (err) {
      console.error('Failed to load comparison:', err);
      alert(`Failed to load files:\n${err.message}`);
    } finally {
      setCheckpointBusy(false);
    }
  };

  loadExternalCompare();
}, [compareLeftUrl, compareRightUrl]);
```

### Phase 3: Conditional UI Rendering

```typescript
// In render
return (
  <div className="flex flex-col h-screen">
    {!isEmbedMode && (
      <Toolbar ... />
    )}

    <div className="flex flex-1 min-h-0">
      {!isEmbedMode && (
        <CheckpointPanel ... />
      )}

      <div className="flex-1">
        {/* Main content */}
      </div>
    </div>

    {compareView && (
      <CompareViewModal isEmbedMode={isEmbedMode} />
    )}
  </div>
);
```

### Phase 4: Simplified Compare View for Embed Mode

```typescript
// In compare view modal
{compareView && (
  <div className={isEmbedMode ? 'fixed inset-0' : 'fixed bottom-0 left-0 right-0'}>
    <div className="compare-view">
      {/* Header - always show */}
      <div className="header">
        <h2>Compare</h2>
        <button onClick={() => setCompareView(null)}>Close</button>
      </div>

      {/* Score panes */}
      <div className="panes">
        <div className="left-pane">
          <div className="header">
            <span>{leftLabel}</span>
            {!isEmbedMode && (
              <button>💾 Save checkpoint</button>
            )}
          </div>
          {/* Score content */}
        </div>

        <div className="gutter">
          <button onClick={handleSwap}>⇄ Swap</button>
          {/* Diff blocks */}
          {!isEmbedMode && (
            {/* Overwrite arrows */}
          )}
        </div>

        <div className="right-pane">
          {/* Same as left */}
        </div>
      </div>
    </div>
  </div>
)}
```

## Security & Error Handling

### CORS Support
```typescript
// Fetch with proper headers
const response = await fetch(url, {
  mode: 'cors',
  headers: {
    'Accept': 'application/xml, text/xml, application/xhtml+xml',
  },
});
```

### Error States
- **Network error**: "Failed to load files. Check URLs and CORS settings."
- **Invalid XML**: "Invalid MusicXML format in one or both files."
- **404**: "One or both files not found."
- **CORS error**: "CORS error. Server must allow cross-origin requests."

### Loading State
```typescript
{isEmbedMode && checkpointBusy && (
  <div className="fixed inset-0 flex items-center justify-center bg-white">
    <div className="text-center">
      <div className="spinner" />
      <p>Loading comparison...</p>
    </div>
  </div>
)}
```

## Integration with OurTextScores

### Markdown Usage

Replace musical diff section with iframe:

```markdown
## Musical Diff

<iframe
  src="https://your-score-editor.app/?compareLeft=https://raw.githubusercontent.com/user/OurTextScores/main/old/score.xml&compareRight=https://raw.githubusercontent.com/user/OurTextScores/main/new/score.xml&leftLabel=Previous&rightLabel=Current"
  width="100%"
  height="800px"
  frameborder="0"
  style="border: 1px solid #ccc; border-radius: 4px;"
></iframe>
```

### Dynamic Generation

```javascript
// In OurTextScores build script
function generateDiffIframe(oldPath, newPath, oldLabel, newLabel) {
  const baseUrl = 'https://your-score-editor.app';
  const params = new URLSearchParams({
    compareLeft: oldPath,
    compareRight: newPath,
    leftLabel: oldLabel,
    rightLabel: newLabel,
  });

  return `<iframe src="${baseUrl}?${params}" width="100%" height="800px"></iframe>`;
}
```

## Testing

### Test Cases

1. ✅ Load two valid external XMLs
2. ✅ Display diff highlighting correctly
3. ✅ Swap functionality works
4. ✅ Custom labels display
5. ✅ Close button returns to blank state
6. ✅ CORS errors handled gracefully
7. ✅ Invalid XML shows error
8. ✅ 404 errors handled
9. ✅ No checkpoint UI visible
10. ✅ No overwrite controls visible

### Manual Test URLs

```bash
# Test with public GitHub files
http://localhost:3000/?compareLeft=https://raw.githubusercontent.com/user/repo/commit1/score.xml&compareRight=https://raw.githubusercontent.com/user/repo/commit2/score.xml

# Test with local files (requires CORS setup)
http://localhost:3000/?compareLeft=http://localhost:8000/v1.xml&compareRight=http://localhost:8000/v2.xml
```

## Files to Modify

1. ✅ `components/ScoreEditor.tsx` - Main implementation
2. ✅ `COMPARE_EMBED_MODE.md` - This document
3. ✅ `tests/compare-embed.spec.ts` - New test file
4. ✅ `README.md` - Add embed mode documentation

## Implementation Checklist

- [ ] Add URL parameter detection for compareLeft/compareRight
- [ ] Implement external file loading with CORS
- [ ] Add loading state for embed mode
- [ ] Conditionally hide UI elements in embed mode
- [ ] Remove checkpoint/overwrite features from embed compare view
- [ ] Add error handling for fetch failures
- [ ] Test with external URLs
- [ ] Update README with embed mode docs
- [ ] Create Playwright test for embed mode

## CSS Considerations

### Full Screen Compare in Embed Mode

```css
/* When in embed mode, compare view fills entire viewport */
.compare-view-embed {
  position: fixed;
  inset: 0;
  z-index: 1;
}

/* Remove modal backdrop in embed mode */
.compare-view-embed .backdrop {
  display: none;
}

/* Adjust header */
.compare-view-embed .header {
  position: sticky;
  top: 0;
  z-index: 10;
}
```

## Deployment Considerations

### CORS Headers

The deployed app must send CORS headers to allow embedding:

```
Access-Control-Allow-Origin: *
X-Frame-Options: ALLOWALL
Content-Security-Policy: frame-ancestors *
```

### CDN Caching

For external XML files, consider caching strategy:
- Cache-Control headers
- ETags for conditional requests
- Handle stale content appropriately

## Future Enhancements

1. **Direct XML in URL**: Base64 encode small XMLs in URL params
2. **Diff export**: Export diff view as image/PDF
3. **Measure focus**: Jump to specific measure number
4. **Read-only indicators**: Show that editing is disabled
5. **Loading progress**: Show progress bar for large files
6. **Retry mechanism**: Allow user to retry failed loads

## Estimated Effort

- **Core implementation**: 3-4 hours
- **Testing & debugging**: 1-2 hours
- **Documentation**: 1 hour
- **Total**: 5-7 hours
