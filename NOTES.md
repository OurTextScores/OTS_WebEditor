# Development Notes

## Measure Selection Feature (select-measure branch)

### Goal
Implement a feature where clicking empty space inside a measure selects the entire measure AND all notes/rests within it, similar to MuseScore's behavior (code reference at ~/workspace/MuseScore, please review).

### Current Status: IN PROGRESS
- ✅ Branch merged with main (includes multi-selection/range selection fixes)
- ✅ Visual selection overlay now has visible blue border
- ✅ Identified root cause: STAFF_LINES element being selected instead of Measure
- ✅ Implemented navigation from STAFF_LINES to parent Measure
- ✅ Range selection successfully set (state=2, isRange=1)
- ❌ **BLOCKER:** `updateSelection()` clears the range (state changes from 2→0)

### Technical Discovery: The Root Cause

When clicking empty space in a measure:
1. `selectElementAtPoint` is called (not `selectMeasureAtPoint` - it never gets reached)
2. Hit test returns **STAFF_LINES** element (ElementType 13), not a Measure
3. STAFF_LINES needs to be converted to its parent Measure for proper selection

### Key Findings

#### Element Types in MuseScore
```
INVALID = 0
BRACKET_ITEM = 1
...
BAR_LINE = 12
STAFF_LINES = 13    ← This is what we're hitting
...
MEASURE = 82        ← This is what we need
```

#### Why `isMeasure()` Returns False
- The element being selected has `type=13` (STAFF_LINES)
- `isMeasure()` correctly returns `false` because it's not a Measure
- We thought we were selecting a Measure, but we were actually selecting StaffLines

#### How MuseScore Handles This
From `~/workspace/MuseScore/src/engraving/libmscore/score.cpp`:
- `Score::selectSingle()` checks `if (e->isMeasure())`
- If true, it calls `doSelect(e, SelectType::RANGE, staffIdx)`
- This converts the single Measure selection to a RANGE selection
- Range selections automatically include all chords/rests between start and end segments

### Implementation Attempts

#### Attempt 1: Call `selectMeasureAtPoint` after detecting empty space
**Status:** Never executed
**Issue:** `selectElementAtPoint` successfully finds STAFF_LINES and returns true, so `selectMeasureAtPoint` fallback never runs

#### Attempt 2: Use `SelectType::RANGE` in `selectMeasureAtPoint`
**Status:** Partially worked but never called
**Code:**
```cpp
score->select(measure, engraving::SelectType::RANGE, staffIdx);
```
**Issue:** This was the right approach, but the function was never being called

#### Attempt 3: Manually call `setRange()` in `selectMeasureAtPoint`
**Status:** Correct approach but never executed
**Code:**
```cpp
score->selection().setRange(firstSeg, lastSeg, staffIdx, staffIdx + 1);
score->selection().setState(engraving::SelState::RANGE);
```
**Issue:** Function never called because `selectElementAtPoint` handles the click

#### Attempt 4: Detect STAFF_LINES in `selectElementAtPoint` and convert to range
**Status:** CURRENT - Partially working but range gets cleared
**Code:**
```cpp
if (target->type() == engraving::ElementType::STAFF_LINES) {
    auto* measure = target->findMeasure();
    if (measure) {
        auto* firstSeg = measure->first(engraving::SegmentType::ChordRest);
        auto* lastSeg = measure->last();
        if (firstSeg) {
            score->selection().setRange(firstSeg, lastSeg, staffIdx, staffIdx + 1);
            score->selection().setState(engraving::SelState::RANGE);
            score->selection().setActiveTrack(staffIdx * mu::engraving::VOICES);
        }
    }
}
```

**Current Issue:** After `updateSelection()` is called, the selection state becomes NONE (state=0) with 0 elements.

### Debug Output Analysis - CRITICAL FINDING

Latest console output showing the exact moment selection is cleared:
```
[WASM DEBUG] Detected STAFF_LINES, looking for parent Measure
[WASM DEBUG] Found parent Measure, staffIdx=0
[WASM DEBUG] Measure range: firstSeg=0x138f130 lastSeg=0x10aca28
[WASM DEBUG] After setRange, before updateSelection: state=2 isRange=1  ← RANGE SET CORRECTLY
[WASM DEBUG] Before updateSelection: state=2                            ← STILL GOOD
[WASM DEBUG] After updateSelection: state=0                             ← CLEARED BY updateSelection()!
[WASM DEBUG] selectElementAtPoint result: state=0 isRange=0 elements.size=0
```

**Analysis:**
- ✅ STAFF_LINES correctly detected
- ✅ Parent Measure found with valid staffIdx=0
- ✅ First and last segments are valid pointers (non-null)
- ✅ `setRange()` successfully creates range selection (state=2, isRange=1)
- ❌ **`Score::updateSelection()` clears the range** (state changes from 2→0)

**Root Cause:** `updateSelection()` must be validating the range and rejecting it as invalid, then clearing the selection.

### Next Steps - Investigation Plan

**CONFIRMED ISSUE:** `updateSelection()` is clearing our range selection. Need to find out why.

#### Option 1: Investigate `Score::updateSelection()` (Recommended)
Look at `webmscore-fork/src/engraving/libmscore/score.cpp` - `Score::updateSelection()`:
- What validations does it perform on RANGE selections?
- Why would it clear a range with valid segments?
- Does it check measure boundaries, staff indices, or tick positions?
- Add logging inside `updateSelection()` to see exact failure point

#### Option 2: Don't Call `updateSelection()` for Range Selections
Try this in `_selectElementAtPoint`:
```cpp
if (target->type() == engraving::ElementType::STAFF_LINES) {
    // ... set up range ...
    // DON'T call updateSelection() - it clears the range
    // score->updateSelection();  // SKIP THIS
    score->setSelectionChanged(true);
    return true;
}
```

#### Option 3: Check How MuseScore's `selectRange()` Does It
In `~/workspace/MuseScore/src/engraving/libmscore/score.cpp`:
- Look at `Score::selectRange()` implementation for Measure selection
- See if it calls `updateSelection()` or skips it
- Check what additional state it sets up before/after

#### Option 4: Use `score->select()` with `SelectType::RANGE`
Instead of manually calling `setRange()`, try:
```cpp
score->deselectAll();
score->select(measure, engraving::SelectType::RANGE, staffIdx);
```
This goes through the normal selection path that might handle `updateSelection()` correctly.

**Most Likely Issue:** Range needs both `startSegment` and `endSegment` to be in valid positions, or `updateSelection()` validates tick positions and finds them invalid.

### Files Modified

#### C++ (webmscore-fork/web/main.cpp)
- `_selectElementAtPoint`: Added STAFF_LINES detection and Measure range selection
- `_getSelectionBoundingBoxes`: Added range selection support to iterate through segments
- Added extensive debug logging throughout

#### TypeScript (components/ScoreEditor.tsx)
- Added visible border to selection overlay: `border-2 border-blue-600`
- Added 'Measure' to `ELEMENT_SELECTION_CLASSES` and `ELEMENT_SELECTION_SELECTOR`
- Modified selection logic to use `getSelectionBoundingBoxes()` and re-render SVG
- Added debug logging for selection flow

#### TypeScript (lib/webmscore-loader.ts)
- Interface already includes `selectMeasureAtPoint` method

### Testing

Test file exists: `tests/measure-selection.spec.ts`

To test manually:
1. Navigate to `http://localhost:3000/?score=/test_scores/three_notes_cde.musicxml`
2. Click on empty space in a measure (between notes)
3. Expected: All notes in measure highlighted with blue borders
4. Actual: Nothing selected (selection cleared)

### Build Commands

```bash
# Rebuild WASM
cd webmscore-fork/web-public
npm run compile

# Sync to public
cd ../..
npm run sync:wasm

# Hard refresh browser to clear cache
```

### References

- MuseScore source: `~/workspace/MuseScore`
- Key file: `src/engraving/libmscore/score.cpp` - `Score::selectRange()` and `Score::selectSingle()`
- Element types: `webmscore-fork/src/engraving/types/types.h`
- Selection code: `webmscore-fork/src/engraving/libmscore/select.cpp`

### Key Insights

1. **Hit testing finds STAFF_LINES (type 13), not Measure (type 82)** - This was the breakthrough
2. **Range selections work differently than list selections** - `elements()` doesn't work for ranges
3. **`setRange()` successfully creates range selection** - state=2, isRange=1 is achieved
4. **`updateSelection()` clears the range** - Changes state from 2 (RANGE) back to 0 (NONE)
5. **MuseScore uses `SelectType::RANGE` on Measures** - We're on the right track with setRange()

### Quick Resume Point

**Current code location:** `webmscore-fork/web/main.cpp` - `_selectElementAtPoint()` around line 1494

**What's working:**
- Detecting STAFF_LINES when clicking empty space
- Finding parent Measure
- Getting valid first/last segments
- Setting range selection correctly

**What's broken:**
- `updateSelection()` immediately clears the range

**Fastest fix to try:** Comment out `score->updateSelection()` and see if selection persists without it.

### Git Commits

- `ea2cd2a`: Initial incomplete attempt (by user)
- `07e6748`: WIP improvements with debug logging
- `96c1352`: Merged main branch (multi-selection fixes)
