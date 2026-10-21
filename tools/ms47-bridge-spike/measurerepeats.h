// SPDX-License-Identifier: GPL-3.0-only
#pragma once
#include "engraving/dom/volta.h"
#include "engraving/dom/marker.h"
#include "engraving/dom/jump.h"
#include "engraving/dom/measurerepeat.h"

static engraving::BarLine* ensureEndBarLine(engraving::Measure* measure)
{
    if (!measure) {
        return nullptr;
    }

    const engraving::BarLine* existing = measure->endBarLine();
    if (existing) {
        return const_cast<engraving::BarLine*>(existing);
    }

    engraving::Segment* segment = measure->undoGetSegmentR(engraving::SegmentType::EndBarLine, measure->ticks());
    if (!segment) {
        return nullptr;
    }

    engraving::BarLine* barLine = engraving::toBarLine(segment->element(0));
    if (!barLine) {
        barLine = engraving::Factory::createBarLine(segment);
        if (!barLine) {
            return nullptr;
        }
        barLine->setParent(segment);
        barLine->setTrack(0);
        barLine->setGenerated(false);
        if (auto staff = measure->score()->staff(0)) {
            barLine->setSpanStaff(staff->barLineSpan());
            barLine->setSpanFrom(staff->barLineFrom());
            barLine->setSpanTo(staff->barLineTo());
        }
        measure->score()->undoAddElement(barLine);
    }

    return barLine;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE bool toggleRepeatStart(uintptr_t score_ptr, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    engraving::Measure* startMeasure = nullptr;
    engraving::Measure* endMeasure = nullptr;
    if (!selectionMeasureRange(score, startMeasure, endMeasure) || !startMeasure) {
        LOGW() << "toggleRepeatStart: no measure selected";
        return false;
    }

    engraving::Measure* target = startMeasure->isMMRest() ? startMeasure->mmRestFirst() : startMeasure;
    if (!target) {
        LOGW() << "toggleRepeatStart: invalid target measure";
        return false;
    }

    for (size_t staffIdx = 0; staffIdx < score->nstaves(); ++staffIdx) {
        if (target->isMeasureRepeatGroupWithPrevM(staffIdx)) {
            LOGW() << "toggleRepeatStart: cannot split measure repeat group";
            return false;
        }
    }

    const bool nextState = !target->repeatStart();
    score->startCmd(TranslatableString::untranslatable("toggleRepeatStart"));
    target->undoChangeProperty(engraving::Pid::REPEAT_START, nextState);
    score->endCmd();
    score->doLayout();
    return true;
}

EMSCRIPTEN_KEEPALIVE bool toggleRepeatEnd(uintptr_t score_ptr, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    engraving::Measure* startMeasure = nullptr;
    engraving::Measure* endMeasure = nullptr;
    if (!selectionMeasureRange(score, startMeasure, endMeasure) || !endMeasure) {
        LOGW() << "toggleRepeatEnd: no measure selected";
        return false;
    }

    engraving::Measure* target = endMeasure->isMMRest() ? endMeasure->mmRestLast() : endMeasure;
    if (!target) {
        LOGW() << "toggleRepeatEnd: invalid target measure";
        return false;
    }

    for (size_t staffIdx = 0; staffIdx < score->nstaves(); ++staffIdx) {
        if (target->isMeasureRepeatGroupWithNextM(staffIdx)) {
            LOGW() << "toggleRepeatEnd: cannot split measure repeat group";
            return false;
        }
    }

    const bool nextState = !target->repeatEnd();
    score->startCmd(TranslatableString::untranslatable("toggleRepeatEnd"));
    target->undoChangeProperty(engraving::Pid::REPEAT_END, nextState);
    score->endCmd();
    score->doLayout();
    return true;
}

EMSCRIPTEN_KEEPALIVE bool setRepeatCount(uintptr_t score_ptr, int count, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    if (count < 2) {
        LOGW() << "setRepeatCount: invalid repeat count " << count;
        return false;
    }

    engraving::Measure* startMeasure = nullptr;
    engraving::Measure* endMeasure = nullptr;
    if (!selectionMeasureRange(score, startMeasure, endMeasure) || !endMeasure) {
        LOGW() << "setRepeatCount: no measure selected";
        return false;
    }

    engraving::Measure* target = endMeasure->isMMRest() ? endMeasure->mmRestLast() : endMeasure;
    if (!target) {
        LOGW() << "setRepeatCount: invalid target measure";
        return false;
    }

    for (size_t staffIdx = 0; staffIdx < score->nstaves(); ++staffIdx) {
        if (target->isMeasureRepeatGroupWithNextM(staffIdx)) {
            LOGW() << "setRepeatCount: cannot split measure repeat group";
            return false;
        }
    }

    score->startCmd(TranslatableString::untranslatable("setRepeatCount"));
    if (!target->repeatEnd()) {
        target->undoChangeProperty(engraving::Pid::REPEAT_END, true);
    }
    target->undoChangeProperty(engraving::Pid::REPEAT_COUNT, count);
    score->endCmd();
    score->doLayout();
    return true;
}

EMSCRIPTEN_KEEPALIVE bool setBarLineType(uintptr_t score_ptr, int barLineType, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    engraving::Measure* startMeasure = nullptr;
    engraving::Measure* endMeasure = nullptr;
    if (!selectionMeasureRange(score, startMeasure, endMeasure) || !endMeasure) {
        LOGW() << "setBarLineType: no measure selected";
        return false;
    }

    engraving::Measure* target = endMeasure->isMMRest() ? endMeasure->mmRestLast() : endMeasure;
    if (!target) {
        LOGW() << "setBarLineType: invalid target measure";
        return false;
    }

    const auto type = static_cast<engraving::BarLineType>(barLineType);
    switch (type) {
    case engraving::BarLineType::NORMAL:
    case engraving::BarLineType::DOUBLE:
    case engraving::BarLineType::END:
    case engraving::BarLineType::BROKEN:
    case engraving::BarLineType::DOTTED:
    case engraving::BarLineType::REVERSE_END:
    case engraving::BarLineType::HEAVY:
    case engraving::BarLineType::DOUBLE_HEAVY:
        break;
    default:
        LOGW() << "setBarLineType: unsupported barline type " << barLineType;
        return false;
    }

    score->startCmd(TranslatableString::untranslatable("setBarLineType"));
    engraving::BarLine* barLine = ensureEndBarLine(target);
    if (!barLine) {
        score->endCmd();
    score->doLayout();
        LOGW() << "setBarLineType: failed to locate or create barline";
        return false;
    }
    barLine->undoChangeProperty(engraving::Pid::BARLINE_TYPE, engraving::PropertyValue::fromValue(type));
    score->endCmd();
    score->doLayout();
    return true;
}

EMSCRIPTEN_KEEPALIVE bool addVolta(uintptr_t score_ptr, int endingNumber, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    if (endingNumber < 1) {
        LOGW() << "addVolta: invalid ending number " << endingNumber;
        return false;
    }

    engraving::Measure* startMeasure = nullptr;
    engraving::Measure* endMeasure = nullptr;
    if (!selectionMeasureRange(score, startMeasure, endMeasure) || !startMeasure) {
        LOGW() << "addVolta: no measure selected";
        return false;
    }

    engraving::Measure* start = startMeasure->isMMRest() ? startMeasure->mmRestFirst() : startMeasure;
    engraving::Measure* end = endMeasure ? (endMeasure->isMMRest() ? endMeasure->mmRestLast() : endMeasure) : start;
    if (!start || !end) {
        LOGW() << "addVolta: invalid target range";
        return false;
    }

    engraving::Segment* startSegment = start->first(engraving::SegmentType::ChordRest);
    if (!startSegment) {
        startSegment = start->first();
    }
    engraving::Segment* endSegment = end->last();
    if (!startSegment || !endSegment) {
        LOGW() << "addVolta: missing segment for range";
        return false;
    }

    auto volta = engraving::Factory::createVolta(score->dummy());
    if (!volta) {
        LOGW() << "addVolta: Factory returned null";
        return false;
    }
    volta->endings().clear();
    volta->endings().push_back(endingNumber);
    volta->setText(String(u"%1.").arg(endingNumber));

    score->startCmd(TranslatableString::untranslatable("addVolta"));
    score->cmdAddSpanner(volta, 0, startSegment, endSegment);
    score->endCmd();
    score->doLayout();
    return true;
}

static bool insertMarker(uintptr_t score_ptr, engraving::MarkerType type, int excerptId, const char* command)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    engraving::Measure* startMeasure = nullptr;
    engraving::Measure* endMeasure = nullptr;
    if (!selectionMeasureRange(score, startMeasure, endMeasure) || !startMeasure) {
        LOGW() << command << ": no measure selected";
        return false;
    }
    auto* target = startMeasure->isMMRest() ? startMeasure->mmRestFirst() : startMeasure;
    if (!target) {
        LOGW() << command << ": invalid target measure";
        return false;
    }

    auto* marker = engraving::Factory::createMarker(score->dummy());
    if (!marker) {
        LOGW() << command << ": Factory returned null";
        return false;
    }
    marker->setMarkerType(type);
    marker->setParent(target);
    marker->setTrack(0);

    score->startCmd(TranslatableString::untranslatable(command));
    score->undoAddElement(marker);
    score->endCmd();
    score->doLayout();
    return true;
}

EMSCRIPTEN_KEEPALIVE bool addMarker(uintptr_t score_ptr, int markerType, int excerptId)
{
    const auto type = static_cast<engraving::MarkerType>(markerType);
    switch (type) {
    case engraving::MarkerType::SEGNO:
    case engraving::MarkerType::VARSEGNO:
    case engraving::MarkerType::CODA:
    case engraving::MarkerType::VARCODA:
    case engraving::MarkerType::FINE:
    case engraving::MarkerType::TOCODA:
    case engraving::MarkerType::TOCODASYM:
        break;
    default:
        LOGW() << "addMarker: unsupported marker type " << markerType;
        return false;
    }

    return insertMarker(score_ptr, type, excerptId, "addMarker");
}

EMSCRIPTEN_KEEPALIVE bool addJump(uintptr_t score_ptr, int jumpType, int excerptId)
{
    if (jumpType < 0 || jumpType > 13) return false;
    if (jumpType >= 12) {
        // The 4.00 JumpType values DCODA (12) and DDBLCODA (13) were removed upstream: "Da (Double) Coda is a
        // Marker, not a Jump" (3a42d912ae, #16294). Create the marker 4.x itself uses, a To Coda-style point.
        return insertMarker(score_ptr, jumpType == 12 ? engraving::MarkerType::DA_CODA : engraving::MarkerType::DA_DBLCODA,
                            excerptId, "addJump");
    }
    const auto type = static_cast<engraving::JumpType>(jumpType);

    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    engraving::Measure* startMeasure = nullptr;
    engraving::Measure* endMeasure = nullptr;
    if (!selectionMeasureRange(score, startMeasure, endMeasure) || !startMeasure) {
        LOGW() << "addJump: no measure selected";
        return false;
    }
    auto* target = startMeasure->isMMRest() ? startMeasure->mmRestFirst() : startMeasure;
    if (!target) {
        LOGW() << "addJump: invalid target measure";
        return false;
    }

    auto* jump = engraving::Factory::createJump(target);
    if (!jump) {
        LOGW() << "addJump: Factory returned null";
        return false;
    }
    jump->setParent(target);
    jump->setJumpType(type);
    jump->setTrack(0);

    score->startCmd(TranslatableString::untranslatable("addJump"));
    score->undoAddElement(jump);
    score->endCmd();
    score->doLayout();
    return true;
}

EMSCRIPTEN_KEEPALIVE bool addMeasureRepeat(uintptr_t score_ptr, int numMeasures, int excerptId)
{
    if (numMeasures != 1 && numMeasures != 2 && numMeasures != 4) {
        LOGW() << "addMeasureRepeat: unsupported measure count " << numMeasures;
        return false;
    }

    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    engraving::Measure* startMeasure = nullptr;
    engraving::Measure* endMeasure = nullptr;
    if (!selectionMeasureRange(score, startMeasure, endMeasure) || !startMeasure) {
        LOGW() << "addMeasureRepeat: no measure selected";
        return false;
    }
    auto* target = startMeasure->isMMRest() ? startMeasure->mmRestFirst() : startMeasure;
    if (!target || !target->prevMeasure()) {
        LOGW() << "addMeasureRepeat: the first score measure cannot repeat a previous measure";
        return false;
    }

    engraving::staff_idx_t staffIdx = score->selection().isRange() ? score->selection().staffStart() : 0;
    if (auto* chordRest = score->selection().firstChordRest()) {
        staffIdx = chordRest->staffIdx();
    }
    if (staffIdx >= score->nstaves()) {
        LOGW() << "addMeasureRepeat: invalid target staff";
        return false;
    }

    auto* measure = target;
    for (int i = 0; i < numMeasures; ++i) {
        if (!measure || measure->ticks() != target->ticks() || measure->isMeasureRepeatGroup(staffIdx)) {
            LOGW() << "addMeasureRepeat: incompatible target measure range";
            return false;
        }
        for (auto* segment = measure->first(); segment; segment = segment->next()) {
            if (!(segment->segmentType() & engraving::SegmentType::ChordRest)) {
                continue;
            }
            const auto startTrack = engraving::staff2track(staffIdx, 0);
            const auto endTrack = startTrack + engraving::VOICES;
            for (auto track = startTrack; track < endTrack; ++track) {
                auto* item = segment->element(track);
                if (item && !item->generated() && !item->isRest()) {
                    LOGW() << "addMeasureRepeat: target measures must be empty";
                    return false;
                }
            }
        }
        measure = measure->nextMeasure();
    }

    score->startCmd(TranslatableString::untranslatable("addMeasureRepeat"));
    score->cmdAddMeasureRepeat(target, numMeasures, staffIdx);
    score->endCmd();
    score->doLayout();
    return target->isMeasureRepeatGroup(staffIdx);
}

}
