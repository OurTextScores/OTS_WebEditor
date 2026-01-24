# Testing Embed Mode with Local Files

## Quick Start

### 1. Start the Dev Server
```bash
npm run dev
```

### 2. Open Embed Mode in Browser

**Basic comparison with local files:**
```
http://localhost:3000/?compareLeft=http://localhost:3000/sample-left.xml&compareRight=http://localhost:3000/sample-right.xml
```

**With custom labels:**
```
http://localhost:3000/?compareLeft=http://localhost:3000/sample-left.xml&compareRight=http://localhost:3000/sample-right.xml&leftLabel=Version%201&rightLabel=Version%202
```

## Sample Files

Two sample MusicXML files are provided in the `public` directory:

- **`public/sample-left.xml`** - C major scale (C D E F in measure 1, G A in measure 2)
- **`public/sample-right.xml`** - C major arpeggio (C E G C5 in measure 1, B C5 in measure 2)

These files have intentional differences to demonstrate the diff highlighting feature.

## What to Verify

### Visual Checks
- ✅ No toolbar at top
- ✅ No checkpoint sidebar on left
- ✅ Full-screen compare view (no modal overlay)
- ✅ Two score panes side by side
- ✅ Custom labels appear if provided
- ✅ Diff highlighting shows differences in yellow/red/green
- ✅ Swap button in center gutter
- ✅ "📝 Open in Editor" buttons above each score pane
- ✅ No "💾 Save checkpoint" buttons
- ✅ No "→" and "←" overwrite arrows (read-only mode)

### Functional Checks
1. **Loading State**: Should see "Loading comparison..." spinner briefly
2. **Score Rendering**: Both panes should show rendered musical scores
3. **Swap Function**: Click swap button, labels and scores should exchange positions
4. **Open in Editor**: Click "📝 Open in Editor" button on either pane
   - Compare view should close
   - Full editor UI should appear (toolbar, sidebar)
   - Selected score should load in the editor
   - Score should be editable with all editor features available
5. **Scroll Sync**: Scrolling one pane should sync with the other
6. **Zoom**: Zoom controls should work for both panes

## Run Automated Tests

```bash
# Run all embed mode tests
npm run test:e2e -- tests/embed-mode.spec.ts

# Run in headed mode (see browser)
npm run test:e2e -- tests/embed-mode.spec.ts --headed

# Run specific test
npm run test:e2e -- tests/embed-mode.spec.ts -g "should hide toolbar"

# Debug mode
npm run test:e2e -- tests/embed-mode.spec.ts --debug
```

## Test Coverage

The test suite includes:
1. ✅ Embed mode detection
2. ✅ Toolbar hidden
3. ✅ Sidebar hidden
4. ✅ Save buttons hidden
5. ✅ Overwrite arrows hidden
6. ✅ Custom labels
7. ✅ Default labels
8. ✅ Loading state
9. ✅ Error handling
10. ✅ Swap functionality
11. ✅ Single URL parameter (should not activate embed mode)
12. ✅ Score pane rendering
13. ✅ "Open in Editor" buttons visible
14. ✅ Open left score in full editor
15. ✅ Open right score in full editor

## Testing with External URLs

You can also test with real external URLs (requires CORS):

**Example with GitHub raw files:**
```
http://localhost:3000/?compareLeft=https://raw.githubusercontent.com/musescore/MuseScore/master/test/data/mscx/test1.mscx&compareRight=https://raw.githubusercontent.com/musescore/MuseScore/master/test/data/mscx/test2.mscx
```

**Note:** GitHub raw files have CORS enabled, so they work well for testing.

## Creating Your Own Test Files

To add your own test files:

1. Place MusicXML files in the `public` directory
2. Access them via `http://localhost:3000/your-file.xml`
3. Use in embed mode URL:
   ```
   http://localhost:3000/?compareLeft=http://localhost:3000/your-file-1.xml&compareRight=http://localhost:3000/your-file-2.xml
   ```

## Troubleshooting

### Problem: Scores not loading
- Check browser console for errors
- Verify XML files are valid MusicXML format
- Ensure files are in `public` directory

### Problem: CORS errors with external URLs
- External server must have CORS headers enabled
- Use local files for testing instead
- Or use a CORS proxy

### Problem: White screen or crash
- Check if files are too large
- Verify XML is well-formed
- Look for JavaScript errors in console

### Problem: Tests failing
- Ensure dev server is running on port 3000
- Check that sample files exist in `public` directory
- Increase timeouts if loading is slow

## URL Encoding Reference

When using URLs with special characters, remember to encode them:

```javascript
encodeURIComponent('http://localhost:3000/sample-left.xml')
// Result: http%3A%2F%2Flocalhost%3A3000%2Fsample-left.xml
```

Or use browser encoding:
- Space → `%20`
- & → `%26`
- = → `%3D`
- ? → `%3F`

## Example iframe Integration

For embedding in another website:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Score Comparison Embed</title>
</head>
<body>
    <h1>Music Score Comparison</h1>
    <iframe
        src="http://localhost:3000/?compareLeft=http://localhost:3000/sample-left.xml&compareRight=http://localhost:3000/sample-right.xml&leftLabel=Before&rightLabel=After"
        width="100%"
        height="800px"
        frameborder="0"
        style="border: 1px solid #ddd; border-radius: 8px;"
    ></iframe>
</body>
</html>
```

Save this as `test-embed.html` and open in a browser while dev server is running.
