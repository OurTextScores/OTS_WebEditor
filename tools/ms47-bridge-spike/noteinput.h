// SPDX-License-Identifier: GPL-3.0-only
#pragma once
#include "engraving/dom/stafftype.h"
#include "engraving/dom/instrument.h"
#include "engraving/dom/stringdata.h"
#include "engraving/dom/drumset.h"

static engraving::ChordRest* chordRestForNoteInputStart(engraving::EngravingItem* item)
{
    if (!item) {
        return nullptr;
    }
    if (item->isNote()) {
        return engraving::toNote(item)->chord();
    }
    return item->isChordRest() ? engraving::toChordRest(item) : nullptr;
}

static engraving::ChordRest* resolveNoteInputStartPosition(Score* score)
{
    auto& inputState = score->inputState();
    engraving::EngravingItem* selected = score->selection().element();
    engraving::ChordRest* chordRest = chordRestForNoteInputStart(selected);
    if (!chordRest) {
        chordRest = score->selection().firstChordRest();
    }

    engraving::track_idx_t track = inputState.track();
    if (track == muse::nidx) {
        track = selected && selected->staffIdx() != muse::nidx
            ? selected->staffIdx() * engraving::VOICES
            : 0;
    }

    if (!chordRest && inputState.segment()) {
        chordRest = chordRestForNoteInputStart(inputState.segment()->element(track));
    }
    if (!chordRest && inputState.lastSegment()) {
        chordRest = chordRestForNoteInputStart(inputState.lastSegment()->element(track));
    }
    if (!chordRest) {
        track = engraving::trackZeroVoice(track);
        const engraving::Fraction tick = selected
            ? selected->tick()
            : engraving::Fraction(0, 1);
        chordRest = score->searchNote(tick, track);
        if (!chordRest) {
            chordRest = score->searchNote(engraving::Fraction(0, 1), track);
        }
    }
    return chordRest;
}

#include "engraving/dom/hook.h"

static muse::RectF inputSegmentContentRect(const Segment* segment, track_idx_t track)
{
    RectF result;

    const EngravingItem* el = segment->element(track);
    if (!el) {
        return result;
    }

    if (el->isChord()) {
        const Chord* chord = toChord(el);
        for (const Note* note: chord->notes()) {
            result.unite(note->ldata()->bbox().translated(note->pos()));
        }

        if (Hook* hook = chord->hook()) {
            result.unite(hook->ldata()->bbox().translated(hook->pos()));
        }
    } else if (el->isRest() && !toRest(el)->isFullMeasureRest()) {
        result.unite(el->ldata()->bbox());
    }

    return result;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE bool setDurationType(uintptr_t score_ptr, int durationType, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    auto* el = score->selection().element();
    if (!el) {
        LOGW() << "setDurationType: no element selected";
        return false;
    }
    if (el->isNote()) {
        el = el->parentItem();
    }
    if (!el || !el->isChordRest()) {
        LOGW() << "setDurationType: selection is not chord/rest";
        return false;
    }

    if (durationType < static_cast<int>(engraving::DurationType::V_LONG)
        || durationType >= static_cast<int>(engraving::DurationType::V_ZERO)) {
        LOGW() << "setDurationType: invalid duration type " << durationType;
        return false;
    }

    auto cr = toChordRest(el);
    engraving::TDuration d(static_cast<engraving::DurationType>(durationType));
    d.setDots(0);
    if (!d.isValid() || d.isMeasure()) {
        LOGW() << "setDurationType: resulting duration invalid";
        return false;
    }

    score->startCmd(TranslatableString::untranslatable("Change duration"));
    if (cr->isChord() && (toChord(cr)->noteType() != engraving::NoteType::NORMAL)) {
        score->undoChangeChordRestLen(cr, d);
    } else {
        score->changeCRlen(cr, d);
    }
    score->inputState().setDuration(d);
    score->inputState().setRest(cr->isRest());
    score->endCmd();
    layoutLinked(score);
    return true;
}

EMSCRIPTEN_KEEPALIVE bool setNoteEntryMode(uintptr_t score_ptr, bool enabled, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    auto& inputState = score->inputState();
    if (enabled) {
        engraving::ChordRest* start = resolveNoteInputStartPosition(score);
        if (!start) {
            LOGW() << "setNoteEntryMode: no logical note input start position";
            return false;
        }

        engraving::EngravingItem* selectionItem = start;
        if (start->isChord()) {
            selectionItem = engraving::toChord(start)->upNote();
        }
        score->select(selectionItem, engraving::SelectType::SINGLE, start->staffIdx());
        inputState.setTrack(start->track());
        inputState.setSegment(start->segment());
        auto duration = start->durationType();
        if (duration.isMeasure()) {
            duration = engraving::TDuration(start->measure()->timesig());
        }
        inputState.setDuration(duration);
        // Match desktop's initial tablature string, including entry from a rest.
        if (start->staff()->isTabStaff(inputState.tick())) {
            inputState.setString(selectionItem->isNote() ? toNote(selectionItem)->string() : 0);
        }

        // Match NotationNoteInput::startNoteInput(): entering note input always
        // starts in note (not rest) mode with no carried accidental.
        inputState.setRest(false);
        inputState.setAccidentalType(engraving::AccidentalType::NONE);
        if (inputState.noteEntryMethod() == engraving::NoteEntryMethod::UNKNOWN) {
            inputState.setNoteEntryMethod(engraving::NoteEntryMethod::BY_NOTE_NAME);
        }
    }
    inputState.setNoteEntryMode(enabled);
    if (enabled && !inputState.duration().isValid()) {
        inputState.setDuration(engraving::TDuration(engraving::DurationType::V_QUARTER));
    }
    return true;
}

EMSCRIPTEN_KEEPALIVE bool setInputStateFromSelection(uintptr_t score_ptr, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    auto* el = score->selection().element();
    if (el && el->isNote()) {
        el = el->parentItem();
    }
    auto* cr = el && el->isChordRest() ? engraving::toChordRest(el) : score->selection().cr();
    if (!cr) {
        LOGW() << "setInputStateFromSelection: no chord/rest selected";
        return false;
    }

    score->inputState().setTrack(cr->track());
    score->inputState().setSegment(cr->segment());
    auto duration = cr->durationType();
    if (duration.isMeasure()) {
        duration = engraving::TDuration(cr->measure()->timesig());
    }
    score->inputState().setDuration(duration);
    score->inputState().setRest(cr->isRest());
    return true;
}

EMSCRIPTEN_KEEPALIVE bool setInputAccidentalType(uintptr_t score_ptr, int accidentalType, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    if (accidentalType < 0 || accidentalType >= static_cast<int>(engraving::AccidentalType::END)) {
        LOGW() << "setInputAccidentalType: invalid accidental type " << accidentalType;
        return false;
    }
    score->inputState().setAccidentalType(static_cast<engraving::AccidentalType>(accidentalType));
    score->inputState().setRest(false);
    return true;
}

EMSCRIPTEN_KEEPALIVE bool setInputDurationType(uintptr_t score_ptr, int durationType, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    if (durationType < static_cast<int>(engraving::DurationType::V_LONG)
        || durationType >= static_cast<int>(engraving::DurationType::V_ZERO)) {
        LOGW() << "setInputDurationType: invalid duration type " << durationType;
        return false;
    }

    engraving::TDuration d(static_cast<engraving::DurationType>(durationType));
    d.setDots(0);
    if (!d.isValid() || d.isMeasure()) {
        LOGW() << "setInputDurationType: invalid duration selection";
        return false;
    }

    score->inputState().setDuration(d);
    return true;
}

EMSCRIPTEN_KEEPALIVE bool toggleInputDot(uintptr_t score_ptr, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    auto duration = score->inputState().duration();
    const int nextDots = duration.dots() > 0 ? 0 : 1;
    score->inputState().setDots(nextDots);
    return true;
}

EMSCRIPTEN_KEEPALIVE bool putNote(uintptr_t score_ptr, int pageNumber, double x, double y, bool replace, bool insert, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    const auto& pages = score->pages();

    if (pageNumber < 0 || pageNumber >= (int)pages.size()) {
        LOGW() << "putNote: invalid page index " << pageNumber;
        return false;
    }
    if (!score->inputState().noteEntryMode()) {
        LOGW() << "putNote: not in note entry mode";
        return false;
    }

    engraving::Page* page = pages.at(pageNumber);
    // Score::getPosition expects canvas coordinates; accept either canvas or
    // page-local input (mirrors the tolerant hit-testing used for selection).
    muse::PointF pos(x, y);
    const muse::RectF canvasRect = page->ldata()->bbox().translated(page->pos());
    if (!canvasRect.contains(pos)) {
        const muse::PointF shifted = pos + page->pos();
        if (canvasRect.contains(shifted)) {
            pos = shifted;
        }
    }

    score->startCmd(TranslatableString::untranslatable("Enter note"));
    const auto ret = score->putNote(pos, replace, insert);
    score->endCmd();
    layoutLinked(score);
    return ret.success();
}

EMSCRIPTEN_KEEPALIVE bool enterRest(uintptr_t score_ptr, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    auto& is = score->inputState();
    if (is.track() == muse::nidx) {
        LOGW() << "enterRest: input track invalid";
        return false;
    }
    if (!is.segment()) {
        if (!setInputStateFromSelection(score_ptr, excerptId)) {
            LOGW() << "enterRest: no input segment";
            return false;
        }
    }
    auto duration = is.duration();
    if (!duration.isValid() || duration.isMeasure()) {
        duration = engraving::TDuration(engraving::DurationType::V_QUARTER);
        is.setDuration(duration);
    }
    score->startCmd(TranslatableString::untranslatable("Enter rest"));
    score->enterRest(duration);
    score->endCmd();
    layoutLinked(score);
    return true;
}

EMSCRIPTEN_KEEPALIVE bool setVoice(uintptr_t score_ptr, int voiceIndex, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    if (voiceIndex < 0 || voiceIndex > 3) {
        LOGW() << "setVoice: invalid voice index " << voiceIndex;
        return false;
    }
    auto& inputState = score->inputState();
    if (inputState.track() == muse::nidx || !inputState.segment()) {
        if (!setInputStateFromSelection(score_ptr, excerptId)) {
            LOGW() << "setVoice: no selection to seed input state";
            return false;
        }
    }
    // Use input state to set current voice
    score->inputState().setVoice(voiceIndex);
    return true;
}

EMSCRIPTEN_KEEPALIVE bool setNoteEntryMethod(uintptr_t id, int method, int excerpt) {
    auto* score = getScore(id, excerpt);
    static constexpr engraving::NoteEntryMethod methods[] = {
        engraving::NoteEntryMethod::UNKNOWN, engraving::NoteEntryMethod::BY_NOTE_NAME,
        engraving::NoteEntryMethod::REPITCH, engraving::NoteEntryMethod::RHYTHM,
        engraving::NoteEntryMethod::REALTIME_AUTO, engraving::NoteEntryMethod::REALTIME_MANUAL,
        engraving::NoteEntryMethod::TIMEWISE
    };
    if (!score || method < 0 || method >= int(std::size(methods))) return false;
    score->inputState().setNoteEntryMethod(methods[method]);
    return true;
}
EMSCRIPTEN_KEEPALIVE bool addPitchByStep(uintptr_t id, int note, bool addToChord, bool insert, int excerpt) {
    auto* score = getScore(id, excerpt);
    if (!score || note < 0 || note > 6) return false;
    auto& input = score->inputState();
    if ((!input.noteEntryMode() || !input.segment()) && !setInputStateFromSelection(id, excerpt)) return false;
    if (input.track() == muse::nidx || !input.segment()) return false;
    engraving::NoteInputParams params;
    if (const auto* drums = input.drumset()) {
        const char letter[] = { "CDEFGAB"[note], 0 };
        params.drumPitch = drums->pitchForShortcut(String::fromUtf8(letter));
        if (params.drumPitch < 0) return false;
    } else if (!score->resolveNoteInputParams(note, addToChord, params)) {
        return false;
    }
    score->startCmd(TranslatableString::untranslatable(addToChord ? "Add note to chord" : "Enter note"));
    score->cmdAddPitch(params, addToChord, insert);
    score->endCmd();
    layoutLinked(score);
    return true;
}

EMSCRIPTEN_KEEPALIVE const uint8_t* getNoteInputCursorRect(uintptr_t score_ptr, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return textResponse("Invalid score or excerpt", 1);
    const auto& inputState = score->inputState();
    if (!inputState.noteEntryMode() || !inputState.segment()) {
        return textResponse("");
    }

    const engraving::Segment* segment = inputState.segment();
    const engraving::System* system = segment->measure()->system();
    if (!system || !system->page()) {
        return textResponse("");
    }

    const engraving::track_idx_t track = inputState.track() == muse::nidx ? 0 : inputState.track();
    const engraving::staff_idx_t staffIdx = track / engraving::VOICES;
    const engraving::Staff* staff = score->staff(staffIdx);
    if (!staff) {
        return textResponse("");
    }

    // Desktop cursor geometry, kept page-local for the existing JS contract.
    const double globalSpatium = score->style().spatium();

    const mu::engraving::StaffType* staffType = staff->staffType(inputState.tick());
    const bool isTabStaff = staffType->isTabStaff();
    const double localSpatium = staffType->spatium();

    const double defaultWidth = score->noteHeadWidth() * localSpatium / globalSpatium;

    const RectF segmentContentRect = inputSegmentContentRect(segment, track);
    double x = segmentContentRect.x() + segment->pagePos().x();

    const mu::engraving::Millimetre barNoteDist = score->style().styleMM(mu::engraving::Sid::barNoteDistance);
    if (segment->x() < barNoteDist) {
        x += barNoteDist - segment->x();
    }

    double y = system->staffCanvasYpage(staffIdx);
    double w = segmentContentRect.width() > 0 ? segmentContentRect.width() : defaultWidth;
    double h = 0.0;

    double sideMargin = 0.0;

    if (isTabStaff) {
        const double minWidth = 2.0 * globalSpatium;
        sideMargin = std::max(0.3 * globalSpatium, 0.5 * (minWidth - w));
    } else {
        sideMargin = 0.5 * globalSpatium;
    }

    // Don't extend further to the left than the center between the current and previous segment
    const engraving::Segment* prevSeg = segment->prev1WithElemsOnTrack(track, engraving::SegmentType::ChordRest);
    if (prevSeg && prevSeg->measure() == segment->measure()) {
        const RectF prevSegContentRect = inputSegmentContentRect(prevSeg, track);
        if (prevSegContentRect.width() > 0) {
            const double centerBetweenPrevSegRightAndCurrSegLeft = (prevSeg->pagePos().x() + prevSegContentRect.right() + x) * 0.5;
            sideMargin = std::min(sideMargin, x - centerBetweenPrevSegRightAndCurrSegLeft);
        }
    }

    x -= sideMargin;
    w += 2 * sideMargin;

    const double yOffset = staffType->yoffset().val() * localSpatium;
    y += yOffset;

    const int inputStateStringsCount = inputState.string();
    const int instrumentStringsCount = static_cast<int>(staff->part()->instrument()->stringData()->strings());

    const double lineDist = staffType->lineDistance().val() * localSpatium;

    if (isTabStaff && inputStateStringsCount >= 0 && inputStateStringsCount <= instrumentStringsCount) {
        h = lineDist;
        y += staffType->physStringToYOffset(inputStateStringsCount) * localSpatium;
        y -= (staffType->onLines() ? lineDist * 0.5 : lineDist);
    } else {
        const double skylineMargin = 0.75 * localSpatium;
        const int lines = staffType->lines();

        h = (lines - 1) * lineDist + 2 * skylineMargin;
        y -= skylineMargin;
    }

    int pageNumber = 0;
    const auto& pages = score->pages();
    for (size_t i = 0; i < pages.size(); ++i) {
        if (pages[i] == system->page()) {
            pageNumber = static_cast<int>(i);
            break;
        }
    }

    muse::JsonObject result;
    result.set("page", pageNumber);
    result.set("x", x);
    result.set("y", y);
    result.set("width", w);
    result.set("height", h);
    result.set("voice", static_cast<int>(track % engraving::VOICES));
    return response(muse::JsonDocument(result).toJson(muse::JsonDocument::Format::Compact));
}

}
