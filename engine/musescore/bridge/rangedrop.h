// SPDX-License-Identifier: GPL-3.0-only
#pragma once
#include "engraving/rw/xmlreader.h"

// Range drop (roadmap E11), as desktop MuseScore's Alt+click/drag with a range selected
// (NotationViewInputController::mousePress_considerStartPasteRangeOnRelease; NotationInteraction::startDropRange,
// updateDropRange, dropRange and dropRangePosition): a copy of the selected range lands where the pointer is released.
// One difference: desktop adds time-tick anchors while dragging, so a range can start on a beat with no note; these
// anchors are made outside any undoable command, so here a range starts at a note or rest. The preview and the drop
// use the same position, so what is shown is what is pasted.

namespace rangedrop {
using namespace mu::engraving;

// As desktop's static helpers of the same names
static Measure* rangeEndMeasure(Score* score, const Fraction& endTick)
{
    Measure* endMeasure = score->tick2measure(endTick);
    if (!endMeasure) {
        endMeasure = score->lastMeasure();
        if (!endMeasure) return nullptr;
    }
    // At the start of a measure: the range ends with the one before
    if (endMeasure->tick() == endTick) return endMeasure->prevMeasure();
    return endMeasure;
}

static Segment* rangeEndSegment(Score* score, const Fraction& endTick)
{
    Segment* endSegment = score->tick2rightSegment(endTick, true, Segment::CHORD_REST_OR_TIME_TICK_TYPE);
    if (endSegment && !endSegment->enabled()) endSegment = endSegment->next1MMenabled();
    return endSegment ? endSegment : score->lastSegmentMM();
}

// The selected range, as the drop's source
struct Source {
    Fraction tick, length, timeStretch;
    staff_idx_t staff = muse::nidx;
    size_t staves = 0;
};

static bool sourceOf(Score* score, Source& source)
{
    const Selection& selection = score->selection();
    if (!selection.isRange() || !selection.canCopy()) return false;
    source.tick = selection.tickStart();
    source.length = selection.tickEnd() - selection.tickStart();
    source.staff = selection.staffStart();
    source.staves = selection.staffEnd() - selection.staffStart();
    if (source.length.isZero() || source.staves == 0) return false;
    source.timeStretch = score->staff(source.staff)->timeStretch(source.tick);
    return true;
}

// Where a dropped range starts and ends: desktop's dropRangePosition without the time-tick anchors (see above). With
// `preserveMeasureAlignment` (a click without moving) it starts as far into the target measure as it did in its own.
static bool position(Score* score, const PointF& pos, const Source& source, bool preserveMeasureAlignment,
                     staff_idx_t* targetStaff, Segment** targetStart, const Segment** targetEnd)
{
    Measure* targetStartMeasure = nullptr;
    if (!dragPositionToMeasure(pos, score, &targetStartMeasure, targetStaff)) return false;

    Fraction targetStartTick;
    if (preserveMeasureAlignment) {
        Measure* sourceStartMeasure = score->tick2measure(source.tick);
        if (!sourceStartMeasure) return false;
        targetStartTick = targetStartMeasure->tick() + (source.tick - sourceStartMeasure->tick());
        Segment* atTick = targetStartTick < targetStartMeasure->endTick()
            ? targetStartMeasure->findSegment(Segment::CHORD_REST_OR_TIME_TICK_TYPE, targetStartTick) : nullptr;
        // No note or rest at that tick (desktop would add an anchor there): place it by the pointer instead
        *targetStart = atTick ? segmentOrChordRestSegmentAtSameTick(atTick) : nullptr;
    }
    if (!*targetStart) {
        if (!dragPositionToSegment(pos, targetStartMeasure, *targetStaff, targetStart, 0.5, false)) return false;
    }
    targetStartTick = (*targetStart)->tick();
    const Fraction targetEndTick = targetStartTick + source.length;
    Measure* targetEndMeasure = rangeEndMeasure(score, targetEndTick);
    if (!targetEndMeasure) return false;
    if (targetEnd) {
        *targetEnd = rangeEndSegment(score, targetEndTick);
        if (!*targetEnd) return false;
    }
    // Every staff of the destination must have the source's time stretch (local time signatures)
    const staff_idx_t endStaff = std::min(*targetStaff + source.staves, score->nstaves());
    for (Measure* m = targetStartMeasure; m && m->tick() <= targetEndMeasure->tick(); m = m->nextMeasure()) {
        for (staff_idx_t staff = *targetStaff; staff < endStaff; ++staff) {
            if (score->staff(staff)->timeStretch(m->tick()) != source.timeStretch) return false;
        }
    }
    return true;
}

static bool canvasPoint(Score* score, int pageNumber, double x, double y, PointF& point)
{
    const auto& pages = score->pages();
    if (pageNumber < 0 || pageNumber >= int(pages.size())) return false;
    point = PointF(fromAbi(x), fromAbi(y)) + pages.at(pageNumber)->pos();   // ABI units (bridge.cpp)
    return true;
}
}

extern "C" {

// Where the selected range would land if dropped at the page point: its boxes, as getSelectionBoundingBoxes, or []
// when it cannot be dropped there (no range selected, off the music, a different local time signature).
EMSCRIPTEN_KEEPALIVE const uint8_t* rangeDropPreview(uintptr_t score_ptr, int pageNumber, double x, double y,
                                                     bool preserveMeasureAlignment, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    rangedrop::Source source;
    PointF point;
    staff_idx_t staff = muse::nidx;
    engraving::Segment* start = nullptr;
    const engraving::Segment* end = nullptr;
    String json = u"[";
    bool first = true;
    if (score && rangedrop::sourceOf(score, source) && rangedrop::canvasPoint(score, pageNumber, x, y, point)
        && rangedrop::position(score, point, source, preserveMeasureAlignment, &staff, &start, &end)) {
        appendRangeBoxes(score, start, end, staff, std::min(staff + source.staves, score->nstaves()), json, first);
    }
    json += u"]";
    return textResponse(json.toStdString());
}

// A copy of the selected range, pasted where it would land at the page point (rangeDropPreview): one undoable
// "Copy range". False, with nothing changed, when it cannot be dropped there or would start inside a tuplet.
EMSCRIPTEN_KEEPALIVE bool dropRangeAt(uintptr_t score_ptr, int pageNumber, double x, double y,
                                      bool preserveMeasureAlignment, int excerptId)
{
    using namespace engraving;
    auto* score = getScore(score_ptr, excerptId);
    rangedrop::Source source;
    PointF point;
    staff_idx_t staff = muse::nidx;
    Segment* start = nullptr;
    if (!score || !rangedrop::sourceOf(score, source) || !rangedrop::canvasPoint(score, pageNumber, x, y, point)
        || !rangedrop::position(score, point, source, preserveMeasureAlignment, &staff, &start, nullptr)) {
        return false;
    }
    if (start->isTupletSubdivisionOnStaff(staff) || start->isInsideTupletOnStaff(staff)) return false;
    const muse::ByteArray mime = score->selection().mimeData();
    XmlReader xml(mime);
    score->startCmd(TranslatableString::untranslatable("Copy range"));
    const bool pasted = score->pasteStaff(xml, start, staff);
    score->endCmd(!pasted);
    if (pasted) layoutLinked(score);
    return pasted;
}

}
