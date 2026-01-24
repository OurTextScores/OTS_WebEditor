# Compare View URL Parameters Design

Last updated: 2026-01-24

## Goal

Enable opening the website with two XML files to automatically load and compare them side-by-side, perfect for embedding in external tools or workflows.

## URL Parameter Options

### Option 1: Dual File Mode (Recommended)
```
/?compareLeft=<url>&compareRight=<url>&autoCompare=true
```

**Example:**
```
/?compareLeft=/scores/version1.xml&compareRight=/scores/version2.xml&autoCompare=true
```

**Pros:**
- Explicit about which file is left vs right
- Clear intent to compare
- Can add labels: `?leftLabel=Version%201&rightLabel=Version%202`

**Cons:**
- Longer URL
- Two separate downloads

### Option 2: Score + Compare Mode (Alternative)
```
/?score=<url>&compare=<url>
```

**Example:**
```
/?score=/scores/current.xml&compare=/scores/checkpoint.xml
```

**Pros:**
- Reuses existing `?score=` parameter
- Familiar pattern
- Shorter URL

**Cons:**
- Less clear which is "left" vs "right"
- Implies one is primary

### Option 3: Compare with Labels
```
/?compare=<url1>,<url2>&labels=<label1>,<label2>
```

**Example:**
```
/?compare=/v1.xml,/v2.xml&labels=Before,After
```

**Pros:**
- Very compact
- Easy to generate programmatically

**Cons:**
- Parsing comma-separated URLs can be tricky
- Order matters but isn't obvious

## Recommended Implementation: Option 1

Use explicit left/right parameters with optional labels.

### Full URL Schema

```
/?compareLeft=<url>
  &compareRight=<url>
  &leftLabel=<label>     (optional, default: "Left")
  &rightLabel=<label>    (optional, default: "Right")
  &autoOpen=true         (optional, default: false)
  &mode=embed            (optional, hides UI chrome)
```

### Examples

**Basic Compare:**
```
/?compareLeft=/scores/v1.xml&compareRight=/scores/v2.xml
```

**With Labels:**
```
/?compareLeft=/scores/v1.xml&compareRight=/scores/v2.xml&leftLabel=Version%201&rightLabel=Version%202
```

**Embedded Mode:**
```
/?compareLeft=/scores/v1.xml&compareRight=/scores/v2.xml&autoOpen=true&mode=embed
```

**With External URLs:**
```
/?compareLeft=https://example.com/score1.xml&compareRight=https://example.com/score2.xml
```

## Implementation Plan

### 1. Add URL Parameter Detection

```typescript
// In ScoreEditor component
const searchParams = useSearchParams();
const compareLeftUrl = searchParams.get('compareLeft');
const compareRightUrl = searchParams.get('compareRight');
const leftLabel = searchParams.get('leftLabel') || 'Left';
const rightLabel = searchParams.get('rightLabel') || 'Right';
const autoOpen = searchParams.get('autoOpen') === 'true';
```

### 2. Load Both Files on Mount

```typescript
useEffect(() => {
  if (!compareLeftUrl || !compareRightUrl) return;

  const loadCompareFiles = async () => {
    setCheckpointBusy(true);
    try {
      // Load left file as "checkpoint"
      const leftResponse = await fetch(compareLeftUrl);
      const leftXml = await leftResponse.text();

      // Load right file as "current" score
      const rightResponse = await fetch(compareRightUrl);
      const rightXml = await rightResponse.text();
      const rightBlob = new Blob([rightXml], { type: 'application/xml' });
      const rightFile = new File([rightBlob], 'right.xml');

      // Load right file into main score
      await handleFileUpload(rightFile, { preserveScoreId: false, updateUrl: false });

      // Set up compare view with both XMLs
      setCompareView({
        title: leftLabel,
        currentXml: rightXml,
        checkpointXml: leftXml,
      });

    } catch (err) {
      console.error('Failed to load compare files:', err);
      alert('Failed to load comparison files.');
    } finally {
      setCheckpointBusy(false);
    }
  };

  loadCompareFiles();
}, [compareLeftUrl, compareRightUrl]);
```

### 3. Handle Embed Mode (Optional)

Add a minimal UI mode for embedding:

```typescript
const embedMode = searchParams.get('mode') === 'embed';

// In render:
{!embedMode && <Toolbar ... />}
{!embedMode && <CheckpointPanel ... />}
```

**Embed mode hides:**
- Toolbar
- Checkpoint sidebar
- New score dialog
- Other UI chrome

**Embed mode shows:**
- Compare view only
- Close button returns to blank state

### 4. Support Query Param Refresh

Allow updating files via URL change:

```typescript
// Watch for URL param changes
useEffect(() => {
  // Clear existing state when params change
  if (prevCompareLeftUrl !== compareLeftUrl || prevCompareRightUrl !== compareRightUrl) {
    setCompareView(null);
    // Reload...
  }
}, [compareLeftUrl, compareRightUrl]);
```

## Security Considerations

### CORS & Same-Origin

- ✅ Same-origin URLs work by default
- ⚠️ External URLs require CORS headers
- 🔒 Consider allowlist for production

### File Size Limits

- Set maximum file size (e.g., 10MB)
- Show progress for large files
- Timeout after 30 seconds

### URL Validation

```typescript
const isValidUrl = (url: string) => {
  try {
    const parsed = new URL(url, window.location.origin);
    // Allow same-origin or specific domains
    return parsed.origin === window.location.origin ||
           ALLOWED_DOMAINS.includes(parsed.origin);
  } catch {
    return false;
  }
};
```

## User Experience

### Loading States

1. **Initial Load**: Show spinner with "Loading comparison..."
2. **Error State**: Show error message with retry button
3. **Success**: Automatically open compare view (if `autoOpen=true`)

### Error Handling

**Possible Errors:**
- Network error (file not found)
- Invalid MusicXML
- CORS error
- File too large

**UI Response:**
- Show error message in modal
- Provide "Try Again" button
- Log details to console
- Fallback to normal mode

### Empty State

If compare params are invalid/missing:
- Don't break normal flow
- Allow user to load files normally
- Log warning to console

## Testing

### Test Cases

1. **Basic compare**: Two valid same-origin URLs
2. **With labels**: Custom labels display correctly
3. **Embed mode**: UI chrome hidden
4. **Auto-open**: Compare view opens immediately
5. **Invalid URL**: Error handling works
6. **CORS error**: Clear error message
7. **Large files**: Progress indicator shows
8. **URL update**: New params trigger reload

### Manual Testing URLs

```bash
# Basic
http://localhost:3000/?compareLeft=/test_scores/score1.xml&compareRight=/test_scores/score2.xml

# With labels
http://localhost:3000/?compareLeft=/test_scores/score1.xml&compareRight=/test_scores/score2.xml&leftLabel=Before&rightLabel=After

# Embedded
http://localhost:3000/?compareLeft=/test_scores/score1.xml&compareRight=/test_scores/score2.xml&autoOpen=true&mode=embed
```

## Future Enhancements

### Phase 2: Advanced Features

1. **Base64 Encoded XML**: For short XMLs
   ```
   /?compareData=<base64-left>,<base64-right>
   ```

2. **Diff Highlighting Config**: Control colors
   ```
   /?diffColors=red,green
   ```

3. **Read-Only Mode**: Disable editing
   ```
   /?readonly=true
   ```

4. **Focus on Specific Measure**: Jump to measure
   ```
   /?focusMeasure=42
   ```

5. **Export Diff**: Download comparison as PDF
   ```
   ?exportFormat=pdf
   ```

## Integration Examples

### External Tool Integration

**CI/CD Pipeline:**
```bash
# Compare before/after in PR
COMPARE_URL="https://score-editor.app/?compareLeft=${BEFORE_URL}&compareRight=${AFTER_URL}&autoOpen=true"
gh pr comment --body "View changes: $COMPARE_URL"
```

**Desktop App:**
```javascript
// Electron app
const compareUrl = `file://${appPath}/index.html?compareLeft=${file1}&compareRight=${file2}&mode=embed`;
window.open(compareUrl);
```

**Web Integration:**
```html
<iframe
  src="https://score-editor.app/?compareLeft=/v1.xml&compareRight=/v2.xml&mode=embed"
  width="100%"
  height="800px"
></iframe>
```

## Implementation Checklist

- [ ] Add URL parameter detection
- [ ] Implement file loading from URLs
- [ ] Set up compare view state
- [ ] Handle loading states
- [ ] Add error handling
- [ ] Implement embed mode
- [ ] Add URL validation
- [ ] Add file size limits
- [ ] Create test cases
- [ ] Update documentation
- [ ] Add examples to README

## Files to Modify

1. `components/ScoreEditor.tsx` - Main implementation
2. `README.md` - Document URL parameters
3. `tests/compare-url-params.spec.ts` - New test file

## Estimated Effort

- **Basic implementation**: 2-3 hours
- **With embed mode**: 4-5 hours
- **With all enhancements**: 6-8 hours
