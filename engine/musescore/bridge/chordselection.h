// SPDX-License-Identifier: GPL-3.0-only
#pragma once
#include "engraving/rw/xmlreader.h"

// Moving the selection within a chord, and repeating the selection (roadmap E11), as desktop MuseScore's
// NotationInteraction::moveChordNoteSelection, selectTopOrBottomOfChord and repeatSelection.

extern "C" {

// Alt+Up/Down: the note (or rest) above or below the selected one, crossing voices and staves as Score::upAlt and
// downAlt do. `top` (Ctrl+Alt+Up/Down): the chord's top or bottom note instead. False when the selection is not a
// single note or rest (a note for `top`), or when nothing is above or below.
EMSCRIPTEN_KEEPALIVE bool selectNoteInChord(uintptr_t score_ptr, bool up, bool top, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    engraving::EngravingItem* current = score->selection().element();
    if (!current || !(current->isNote() || (!top && current->isRest()))) return false;
    engraving::EngravingItem* target = top
        ? (up ? score->upAltCtrl(engraving::toNote(current)) : score->downAltCtrl(engraving::toNote(current)))
        : (up ? score->upAlt(current) : score->downAlt(current));
    if (!target || target == current) return false;
    score->select(target, engraving::SelectType::SINGLE, target->staffIdx());
    score->updateSelection();
    score->setSelectionChanged(true);
    return true;
}

// R: the selection again, after itself. In note input a single note's chord is added again; a list selection must be
// at one tick (Score::cmdRepeatListSelection); a range is pasted at its end, as a copy. One undoable edit; false (with
// nothing changed) when the selection cannot be repeated.
EMSCRIPTEN_KEEPALIVE bool repeatSelection(uintptr_t score_ptr, int excerptId)
{
    using namespace engraving;
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    const Selection& selection = score->selection();
    if (score->noteEntryMode() && selection.isSingle()) {
        EngravingItem* el = selection.element();
        if (!el || score->inputState().endOfScore()) return false;
        Chord* chord = nullptr;
        if (el->isNote()) {
            chord = toNote(el)->chord();
        } else if (el->isRest()) {
            for (Segment* prev = toRest(el)->segment()->prev1WithElemsOnTrack(el->track()); prev;
                 prev = prev->prev1WithElemsOnTrack(el->track())) {
                if (prev->element(el->track())->isChord()) {
                    chord = toChord(prev->element(el->track()));
                    break;
                }
            }
        }
        if (!chord) return false;
        score->startCmd(TranslatableString::untranslatable("Repeat selection"));
        for (Note* note : chord->notes()) {
            NoteVal value = note->noteVal();
            score->addPitch(value, note != chord->notes()[0]);
        }
        score->endCmd();
        layoutLinked(score);
        return true;
    }
    if (selection.isList()) {
        // Only "single-tick" list selections, as desktop
        if (selection.tickStart() != selection.tickEnd()) return false;
        score->startCmd(TranslatableString::untranslatable("Repeat selection"));
        if (!score->cmdRepeatListSelection()) {
            score->endCmd(true);   // rollback
            return false;
        }
        score->endCmd();
        layoutLinked(score);
        return true;
    }
    if (!selection.isRange() || !selection.canCopy()) return false;
    const muse::ByteArray mime = selection.mimeData();
    const staff_idx_t staff = selection.staffStart();
    Segment* end = selection.endSegment();
    if (end && end->segmentType() != SegmentType::ChordRest) end = end->next1(SegmentType::ChordRest);
    if (!end) return false;
    for (track_idx_t track = staff2track(staff); track < staff2track(staff + 1); ++track) {
        EngravingItem* e = end->element(track);
        if (!e) continue;
        XmlReader xml(mime);
        ChordRest* cr = toChordRest(e);
        score->startCmd(TranslatableString::untranslatable("Repeat selection"));
        if (!score->pasteStaff(xml, cr->segment(), cr->staffIdx())) {
            score->endCmd(true);
            return false;
        }
        score->endCmd();
        layoutLinked(score);
        return true;
    }
    return false;
}

}
