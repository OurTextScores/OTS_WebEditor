import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

export async function verifyInspector(WebMscore) {
  const score = await WebMscore.load('musicxml', new Uint8Array(await readFile(new URL('./edit-fixture.musicxml', import.meta.url))));
  try {
    assert.deepEqual(await score.getSelectedElementProperties(), { selectionCount: 0, elementType: '', properties: {} });
    assert.equal(await score.setSelectedElementProperty('visible', false), false);
    await score.selectPartMeasureByIndex(0, 0);
    assert.equal(await score.selectPrevChord(), true); // last eighth note, before the rest
    const first = await score.getSelectedElementProperties();
    assert.equal(first.selectionCount, 1);
    assert.equal(first.elementType, 'Note');
    assert.equal(first.properties.visible.value, true);
    const index = (await score.getUndoInfo()).index;
    for (const [name, value] of [['unsupported', true], ['visible', 'yes'], ['offsetX', 'NaN'], ['offsetY', 20.01], ['color', '#nope']]) {
      assert.equal(await score.setSelectedElementProperty(name, value), false, `Reject invalid ${name}`);
    }
    assert.equal((await score.getUndoInfo()).index, index, 'Rejected properties must not create undo commands');
    assert.equal(await score.setSelectedElementProperty('visible', false), true);
    const hidden = await score.getSelectedElementProperties();
    assert.equal(hidden.properties.visible.value, false);
    assert.equal(hidden.properties.visible.mixed, false);
    assert.equal(hidden.properties.visible.applicableCount, 1);
    assert.equal(await score.setSelectedElementProperty('visible', false), false, 'An unchanged property must be a no-op');
    await score.selectPartMeasureByIndex(0, 0);
    const mixed = await score.getSelectedElementProperties();
    assert.equal(mixed.elementType, 'Mixed');
    assert.equal(mixed.properties.visible.mixed, true);
    assert.equal(mixed.properties.visible.value, null);
    assert.ok(mixed.properties.visible.applicableCount > 1);
    assert.equal(await score.setSelectedElementProperty('visible', false), true);
    assert.equal((await score.getSelectedElementProperties()).properties.visible.value, false);
    assert.equal(await score.undo(), true);
    await score.selectPartMeasureByIndex(0, 0);
    assert.equal((await score.getSelectedElementProperties()).properties.visible.mixed, true);
    assert.equal(await score.undo(), true);
    await score.selectPartMeasureByIndex(0, 0);
    assert.equal((await score.getSelectedElementProperties()).properties.visible.value, true);
    console.log('verified inspector schema, mixed values, validation, no-op and range undo');
    return { mixedSelection: true, invalidValuesRejected: true, undo: true };
  } finally { score.destroy(); }
}
