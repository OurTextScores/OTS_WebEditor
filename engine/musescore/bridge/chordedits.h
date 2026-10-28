// SPDX-License-Identifier: GPL-3.0-only
#pragma once

extern "C" {

EMSCRIPTEN_KEEPALIVE bool addNoteFromRest(uintptr_t score_ptr, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    engraving::EngravingItem* selected = score->selection().element();
    if (!selected) {
        LOGW() << "addNoteFromRest: no selection";
        return false;
    }
    if (!selected->isRest()) {
        LOGW() << "addNoteFromRest: selection is not a rest";
        return false;
    }

    engraving::Rest* rest = engraving::toRest(selected);
    engraving::Segment* segment = rest->segment();
    if (!segment) {
        LOGW() << "addNoteFromRest: rest has no segment";
        return false;
    }

    engraving::Staff* staff = rest->staff();
    if (!staff) {
        LOGW() << "addNoteFromRest: rest has no staff";
        return false;
    }

    engraving::Position pos;
    pos.segment = segment;
    pos.staffIdx = rest->staffIdx();
    pos.line = staff->middleLine(segment->tick());

    bool error = false;
    engraving::NoteVal nval = score->noteValForPosition(pos, engraving::AccidentalType::NONE, error);
    if (error) {
        LOGW() << "addNoteFromRest: failed to compute note value";
        return false;
    }

    score->startCmd(TranslatableString::untranslatable("Replace rest with note"));
    score->setNoteRest(segment, rest->track(), nval, rest->durationTypeTicks(), engraving::DirectionV::AUTO);
    score->endCmd();
    layoutLinked(score);
    return true;
}

// direction: -1 moves up, +1 moves down. Operates on whole chords/rests, as desktop does.
EMSCRIPTEN_KEEPALIVE bool moveSelectedChordRestToStaff(uintptr_t score_ptr, int direction, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score || (direction != -1 && direction != 1) || score->selection().isNone()) return false;

    std::set<engraving::ChordRest*> targets;
    for (engraving::EngravingItem* item : score->selection().uniqueElements()) {
        if (!item) continue;
        if (item->isNote()) {
            auto* chord = engraving::toNote(item)->chord();
            if (chord) targets.insert(chord);
        } else if (item->isChord() || item->isRest()) {
            targets.insert(engraving::toChordRest(item));
        }
    }
    if (targets.empty()) return false;

    score->startCmd(TranslatableString::untranslatable("Move chord or rest to staff"));
    bool changed = false;
    for (engraving::ChordRest* cr : targets) {
        const int before = cr->staffMove();
        if (direction < 0) score->moveUp(cr);
        else score->moveDown(cr);
        changed |= cr->staffMove() != before;
    }
    score->endCmd();
    if (changed) layoutLinked(score);
    return changed;
}

EMSCRIPTEN_KEEPALIVE bool flipStem(uintptr_t score_ptr, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    if (score->selection().isNone()) {
        LOGW() << "flipStem: no selection";
        return false;
    }

    std::set<engraving::Chord*> chords;
    std::vector<engraving::Note*> notes = score->selection().noteList();
    for (engraving::Note* note : notes) {
        if (note && note->chord()) {
            chords.insert(note->chord());
        }
    }

    if (chords.empty()) {
        engraving::EngravingItem* selected = score->selection().element();
        if (selected) {
            if (selected->isChord()) {
                chords.insert(engraving::toChord(selected));
            } else if (selected->isNote()) {
                chords.insert(engraving::toNote(selected)->chord());
            } else if (auto* cr = score->selection().cr()) {
                if (cr->isChord()) {
                    chords.insert(engraving::toChord(cr));
                }
            }
        }
    }

    if (chords.empty()) {
        LOGW() << "flipStem: selection is not a chord or note";
        return false;
    }

    score->startCmd(TranslatableString::untranslatable("Flip stem"));
    for (engraving::Chord* chord : chords) {
        if (!chord) {
            continue;
        }

        engraving::DirectionV currentDir = chord->stemDirection();
        engraving::DirectionV newDir;
        if (currentDir == engraving::DirectionV::UP) {
            newDir = engraving::DirectionV::DOWN;
        } else if (currentDir == engraving::DirectionV::DOWN) {
            newDir = engraving::DirectionV::UP;
        } else {
            newDir = chord->up() ? engraving::DirectionV::DOWN : engraving::DirectionV::UP;
        }
        chord->undoChangeProperty(engraving::Pid::STEM_DIRECTION, static_cast<int>(newDir));
    }
    score->endCmd();
    layoutLinked(score);
    return true;
}

static bool toggleLayoutBreak(uintptr_t score_ptr, engraving::LayoutBreakType type, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    if (score->selection().isNone()) {
        LOGW() << "toggleLayoutBreak: no selection";
        return false;
    }

    score->startCmd(TranslatableString::untranslatable("Toggle layout break"));
    score->cmdToggleLayoutBreak(type);
    score->endCmd();
    layoutLinked(score);
    return true;
}

EMSCRIPTEN_KEEPALIVE bool toggleLineBreak(uintptr_t score_ptr, int excerptId)
{
    return toggleLayoutBreak(score_ptr, engraving::LayoutBreakType::LINE, excerptId);
}

EMSCRIPTEN_KEEPALIVE bool togglePageBreak(uintptr_t score_ptr, int excerptId)
{
    return toggleLayoutBreak(score_ptr, engraving::LayoutBreakType::PAGE, excerptId);
}

EMSCRIPTEN_KEEPALIVE bool changeSelectedElementsVoice(uintptr_t id, int voice, int excerpt) {
    auto* score = getScore(id, excerpt);
    if (!score || voice < 0 || voice >= int(engraving::VOICES) || score->selection().isNone()) return false;
    score->startCmd(TranslatableString::untranslatable("Change voice"));
    score->changeSelectedElementsVoice(voice);
    score->endCmd();
    layoutLinked(score);
    return true;
}

}
