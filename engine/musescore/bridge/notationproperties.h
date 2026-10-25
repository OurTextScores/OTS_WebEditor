// SPDX-License-Identifier: GPL-3.0-only
#pragma once
// Ported from webmscore-fork/web/main.cpp; engine commands remain authoritative.
#include "selectednotes.h"
#include "engraving/dom/selectionfilter.h"
#include "engraving/editing/editdata.h"
#include "engraving/dom/segment.h"
#include "engraving/dom/input.h"
#include "engraving/dom/beam.h"
extern "C" {
EMSCRIPTEN_KEEPALIVE bool setNoteheadGroup(uintptr_t score_ptr, int noteheadGroup, int excerptId)
{
    const auto group = static_cast<engraving::NoteHeadGroup>(noteheadGroup);
    switch (group) {
    case engraving::NoteHeadGroup::HEAD_NORMAL:
    case engraving::NoteHeadGroup::HEAD_CROSS:
    case engraving::NoteHeadGroup::HEAD_TRIANGLE_UP:
    case engraving::NoteHeadGroup::HEAD_DIAMOND:
    case engraving::NoteHeadGroup::HEAD_SLASH:
        break;
    default:
        LOGW() << "setNoteheadGroup: unsupported notehead group " << noteheadGroup;
        return false;
    }

    auto* score=getScore(score_ptr, excerptId);
    if(!score) return false;
    std::vector<engraving::Note*> notes;
    for (auto* note : score->selection().noteList()) {
        if (note && note->headGroup() != group) {
            notes.push_back(note);
        }
    }
    if (notes.empty()) {
        LOGW() << "setNoteheadGroup: no eligible selected notes";
        return false;
    }

    score->startCmd(TranslatableString::untranslatable("set Notehead Group"));
    for (auto* note : notes) {
        note->undoChangeProperty(engraving::Pid::HEAD_GROUP, group);
    }
    score->endCmd();
    layoutLinked(score);
    return true;
}

EMSCRIPTEN_KEEPALIVE bool setBeamMode(uintptr_t score_ptr, int beamMode, int excerptId)
{
    const auto mode = static_cast<engraving::BeamMode>(beamMode);
    switch (mode) {
    case engraving::BeamMode::AUTO:
    case engraving::BeamMode::NONE:
    case engraving::BeamMode::BEGIN:
    // The 4.00 JS values 3/4 are named BEGIN32/BEGIN64; upstream renamed
    // them BEGIN16/BEGIN32 without changing their serialized meaning.
    case engraving::BeamMode::BEGIN16:
    case engraving::BeamMode::BEGIN32:
    case engraving::BeamMode::MID:
        break;
    default:
        LOGW() << "setBeamMode: unsupported beam mode " << beamMode;
        return false;
    }

    auto* score=getScore(score_ptr, excerptId);
    if(!score) return false;
    std::vector<engraving::ChordRest*> chordRests;
    for (auto* chordRest : score->getSelectedChordRests()) {
        if (chordRest && !chordRest->isGrace() && chordRest->beamMode() != mode) {
            chordRests.push_back(chordRest);
        }
    }
    if (chordRests.empty()) {
        LOGW() << "setBeamMode: no eligible selected chord/rests";
        return false;
    }

    // The chords of the beams being changed, including those before the selection that a split leaves behind
    Fraction start = chordRests.front()->tick(), end = chordRests.front()->endTick();
    for (auto* chordRest : chordRests) {
        const engraving::ChordRest* first = chordRest->beam() ? chordRest->beam()->elements().front() : chordRest;
        const engraving::ChordRest* last = chordRest->beam() ? chordRest->beam()->elements().back() : chordRest;
        start = std::min(start, first->tick());
        end = std::max(end, last->endTick());
    }

    score->startCmd(TranslatableString::untranslatable("set Beam Mode"));
    for (auto* chordRest : chordRests) {
        chordRest->undoChangeProperty(engraving::Pid::BEAM_MODE, mode);
    }
    score->endCmd();
    layoutLinked(score);
    // A chord leaving a beam has its stem direction computed while the old beam is still attached; beams are rebuilt
    // later in the same pass, so its stem stayed stale until a full layout (editor layout oracle). A second pass over
    // the range sees the new beams.
    score->setLayout(start, end, 0, score->nstaves() - 1);
    layoutLinked(score);
    return true;
}

// setSelectionFilter remains pending: 4.7 split the 24-bit filter and removed
// NOTES_AND_RESTS. A direct enum cast silently changes the editor's filter.

EMSCRIPTEN_KEEPALIVE bool setMultiMeasureRests(uintptr_t score_ptr, bool enabled, int excerptId)
{
    auto* score=getScore(score_ptr, excerptId);
    if(!score) return false;
    if (score->style().styleB(engraving::Sid::createMultiMeasureRests) == enabled) {
        return false;
    }
    score->startCmd(TranslatableString::untranslatable("set Multi Measure Rests"));
    score->cmdToggleMmrest();
    score->endCmd();
    layoutLinked(score);
    return true;
}

EMSCRIPTEN_KEEPALIVE bool multiMeasureRestsEnabled(uintptr_t score_ptr, int excerptId)
{
    auto* score=getScore(score_ptr, excerptId);
    if(!score) return false;
    return score->style().styleB(engraving::Sid::createMultiMeasureRests);
}

}
