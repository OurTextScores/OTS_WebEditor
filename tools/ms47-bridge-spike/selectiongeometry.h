// SPDX-License-Identifier: GPL-3.0-only
#pragma once
#include "engraving/dom/system.h"
#include "engraving/dom/staff.h"

struct RangeSection {
    const engraving::System* system = nullptr;
    const engraving::Segment* startSegment = nullptr;
    const engraving::Segment* endSegment = nullptr;
};

static std::vector<RangeSection> splitRangeBySections(const engraving::Segment* rangeStartSegment,
                                                      const engraving::Segment* rangeEndSegment)
{
    std::vector<RangeSection> sections;
    if (!rangeStartSegment || !rangeEndSegment) {
        return sections;
    }

    const engraving::Segment* startSegment = rangeStartSegment;
    const engraving::Fraction rangeEndTick = rangeEndSegment->tick();

    for (const engraving::Segment* segment = startSegment;
         segment && segment != rangeEndSegment && segment->tick() < rangeEndTick;) {
        const engraving::System* currentSegmentSystem = segment->measure()->system();

        const engraving::Segment* nextSegment = segment->next1MMenabled();
        while (nextSegment && !nextSegment->visible()) {
            nextSegment = nextSegment->next1MMenabled();
        }

        if (!nextSegment) {
            sections.push_back({ currentSegmentSystem, startSegment, segment });
            break;
        }

        const engraving::System* nextSegmentSystem = nextSegment->measure()->system();
        if (!nextSegmentSystem) {
            const engraving::Measure* mmr = nextSegment->measure()->coveringMMRestOrThis();
            if (mmr) {
                nextSegmentSystem = mmr->system();
            }
            if (!nextSegmentSystem) {
                break;
            }
        }

        if (nextSegmentSystem != currentSegmentSystem || nextSegment->tick() >= rangeEndTick) {
            sections.push_back({ currentSegmentSystem, startSegment, segment });
            startSegment = nextSegment;
        }

        segment = nextSegment;
    }

    return sections;
}

static engraving::staff_idx_t rangeFirstVisibleStaffIdx(const engraving::Score* score,
                                                        const engraving::System* system,
                                                        engraving::staff_idx_t startStaffIndex)
{
    for (engraving::staff_idx_t i = startStaffIndex; i < score->nstaves(); ++i) {
        if (system->staff(i) && system->staff(i)->show()) {
            return i;
        }
    }
    return muse::nidx;
}

static engraving::staff_idx_t rangeLastVisibleStaffIdx(const engraving::System* system,
                                                       engraving::staff_idx_t endStaffIndex)
{
    for (int i = static_cast<int>(endStaffIndex) - 1; i >= 0; --i) {
        if (system->staff(i) && system->staff(i)->show()) {
            return static_cast<engraving::staff_idx_t>(i);
        }
    }
    return muse::nidx;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE const uint8_t* getSelectionBoundingBox(uintptr_t score_ptr, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return textResponse("Invalid score or excerpt", 1);

    // Try multiple ways to get the selected element
    mu::engraving::EngravingItem* el = score->selection().element();

    // If element() returns null, try getting from the elements list
    if (!el && !score->selection().elements().empty()) {
        el = score->selection().elements().front();
    }

    // Still null? Try activeCR
    if (!el) {
        el = score->selection().activeCR();
    }

    if (!el) {
        return textResponse("");
    }

    // Get page position and bounding box
    muse::PointF pagePosition = el->pagePos();
    muse::RectF bbox = el->ldata()->bbox();

    // Find which page this element is on
    int pageNumber = 0;
    const auto& pages = score->pages();
    for (size_t i = 0; i < pages.size(); ++i) {
        if (el->findAncestor(mu::engraving::ElementType::PAGE) == pages[i]) {
            pageNumber = static_cast<int>(i);
            break;
        }
    }

    // Build JSON string using mu::String
    String json = String(u"{\"page\":%1,\"x\":%2,\"y\":%3,\"width\":%4,\"height\":%5}")
        .arg(pageNumber)
        .arg(pagePosition.x())
        .arg(pagePosition.y())
        .arg(bbox.width())
        .arg(bbox.height());


    return textResponse(json.toStdString());
}

EMSCRIPTEN_KEEPALIVE const uint8_t* getSelectionBoundingBoxes(uintptr_t score_ptr, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return textResponse("Invalid score or excerpt", 1);
    const auto& sel = score->selection();


    String json = u"[";
    bool first = true;

    // Handle range selections (like when a measure is selected)
    if (sel.isRange()) {
        auto* startSeg = sel.startSegment();
        auto* endSeg = sel.endSegment();
        const auto staffStart = sel.staffStart();
        const auto staffEnd = sel.staffEnd();

        // A range running to the end of the score has a null endSegment; the last
        // segment of the score closes it.
        if (startSeg && !endSeg) {
            endSeg = score->lastSegment();
        }

        if (startSeg && endSeg && startSeg->tick() <= endSeg->tick()) {
            for (const RangeSection& section : splitRangeBySections(startSeg, endSeg)) {
                if (!section.system || !section.startSegment || !section.endSegment) {
                    continue;
                }

                const auto firstStaff = rangeFirstVisibleStaffIdx(score, section.system, staffStart);
                const auto lastStaff = rangeLastVisibleStaffIdx(section.system, staffEnd);
                if (firstStaff == muse::nidx || lastStaff == muse::nidx || firstStaff > lastStaff) {
                    continue;
                }

                const engraving::SysStaff* segmentFirstStaff = section.system->staff(firstStaff);
                const engraving::SysStaff* segmentLastStaff = section.system->staff(lastStaff);
                const engraving::Staff* scoreFirstStaff = score->staff(firstStaff);
                const engraving::Staff* scoreLastStaff = score->staff(lastStaff);
                if (!segmentFirstStaff || !segmentLastStaff || !scoreFirstStaff || !scoreLastStaff) {
                    continue;
                }

                const engraving::Fraction zeroTick = engraving::Fraction(0, 1);
                const double standardStaffHeight = 4 * scoreFirstStaff->spatium(zeroTick);
                const double firstStaffHeight = scoreFirstStaff->staffHeight();
                const double lastStaffHeight = scoreLastStaff->staffHeight();

                // Short staves (e.g. single-line percussion) are centred within the
                // height a standard 5-line staff would occupy, so the rectangle stays
                // a consistent size rather than collapsing onto the lines.
                double topY = 0.0;
                if (firstStaffHeight < standardStaffHeight) {
                    topY -= 0.5 * (standardStaffHeight - firstStaffHeight);
                }
                double bottomY = lastStaffHeight;
                if (lastStaffHeight < standardStaffHeight) {
                    bottomY += 0.5 * (standardStaffHeight - lastStaffHeight);
                }

                double x1 = section.startSegment->pagePos().x();
                const double x2 = section.endSegment->pageBoundingRect().right();
                const double padding = 0.5 * scoreFirstStaff->spatium(startSeg->tick());
                const double y1 = topY + segmentFirstStaff->y() + section.startSegment->pagePos().y() - padding;
                const double y2 = bottomY + segmentLastStaff->y() + section.endSegment->pagePos().y() + padding;

                // Starting on a measure's first segment selects the whole bar, so the
                // rectangle should begin at the barline rather than at the first note.
                if (section.startSegment->measure()->firstEnabled() == section.startSegment) {
                    x1 = section.startSegment->measure()->pagePos().x();
                }

                int pageNumber = 0;
                const auto* page = section.system->page();
                const auto& pages = score->pages();
                for (size_t i = 0; i < pages.size(); ++i) {
                    if (page == pages[i]) {
                        pageNumber = static_cast<int>(i);
                        break;
                    }
                }

                if (!first) {
                    json += u",";
                }
                first = false;

                json += String(u"{\"page\":%1,\"x\":%2,\"y\":%3,\"width\":%4,\"height\":%5}")
                    .arg(pageNumber)
                    .arg(x1)
                    .arg(y1)
                    .arg(x2 - x1)
                    .arg(y2 - y1);
            }
        }
    } else {
        // Handle list selections (individual elements)
        const auto& elements = sel.elements();

        for (auto* el : elements) {
            if (!el) continue;

            // For Chords, use the first note's bounding box (noteheads are child elements)
            muse::RectF pageBbox;
            if (el->isChord()) {
                auto* chord = static_cast<engraving::Chord*>(el);
                if (!chord->notes().empty()) {
                    // Use the first note's bounding box
                    pageBbox = chord->notes()[0]->pageBoundingRect();
                } else {
                    // Fallback to chord's own bbox
                    pageBbox = el->pageBoundingRect();
                }
            } else {
                // For rests and other elements, use their own bbox
                pageBbox = el->pageBoundingRect();
            }

            // Find which page this element is on
            int pageNumber = 0;
            const auto& pages = score->pages();
            for (size_t i = 0; i < pages.size(); ++i) {
                if (el->findAncestor(mu::engraving::ElementType::PAGE) == pages[i]) {
                    pageNumber = static_cast<int>(i);
                    break;
                }
            }

            if (!first) {
                json += u",";
            }
            first = false;

            json += String(u"{\"page\":%1,\"x\":%2,\"y\":%3,\"width\":%4,\"height\":%5}")
                .arg(pageNumber)
                .arg(pageBbox.x())
                .arg(pageBbox.y())
                .arg(pageBbox.width())
                .arg(pageBbox.height());
        }
    }

    json += u"]";
    return textResponse(json.toStdString());
}

}

static bool partStaffRange(const engraving::Part* part, engraving::staff_idx_t& staffStart, engraving::staff_idx_t& staffEnd)
{
    staffStart = muse::nidx;
    staffEnd = muse::nidx;

    if (!part) {
        return false;
    }

    const auto& staves = part->staves();
    if (staves.empty()) {
        return false;
    }

    staffStart = staves.front()->idx();
    staffEnd = staffStart + 1;

    for (const auto* staff : staves) {
        if (!staff) {
            continue;
        }
        const auto idx = staff->idx();
        if (idx < staffStart) {
            staffStart = idx;
        }
        if (idx + 1 > staffEnd) {
            staffEnd = idx + 1;
        }
    }

    return staffStart != muse::nidx && staffEnd != muse::nidx;
}

extern "C" {
EMSCRIPTEN_KEEPALIVE const uint8_t* staffSystemBands(uintptr_t score_ptr, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return textResponse("Invalid score or excerpt", 1);

    String json = u"[";
    bool first = true;

    const auto& pages = score->pages();
    for (size_t pageIdx = 0; pageIdx < pages.size(); ++pageIdx) {
        const engraving::Page* page = pages[pageIdx];
        if (!page) {
            continue;
        }
        const auto& systems = page->systems();
        for (size_t systemIdx = 0; systemIdx < systems.size(); ++systemIdx) {
            const engraving::System* system = systems[systemIdx];
            if (!system) {
                continue;
            }

            const auto& parts = score->parts();
            for (size_t partIdx = 0; partIdx < parts.size(); ++partIdx) {
                engraving::staff_idx_t staffStart = muse::nidx;
                engraving::staff_idx_t staffEnd = muse::nidx;
                if (!partStaffRange(parts.at(partIdx), staffStart, staffEnd)) {
                    continue;
                }

                // Search only within this part's own staves. The range* helpers clamp a
                // selection to visible staves and will happily walk into a neighbouring
                // part, so with "hide empty staves" they hand back another part's staff
                // and every band below the hidden one shifts by a staff.
                auto firstStaff = muse::nidx;
                auto lastStaff = muse::nidx;
                for (auto idx = staffStart; idx < staffEnd && idx < score->nstaves(); ++idx) {
                    const engraving::SysStaff* candidate = system->staff(idx);
                    if (!candidate || !candidate->show()) {
                        continue;
                    }
                    if (firstStaff == muse::nidx) {
                        firstStaff = idx;
                    }
                    lastStaff = idx;
                }
                if (firstStaff == muse::nidx || lastStaff == muse::nidx || firstStaff > lastStaff) {
                    // This part is not shown in this system; emitting a band anyway would
                    // put a highlight on whatever staff happens to occupy that space.
                    continue;
                }

                const engraving::SysStaff* sysFirst = system->staff(firstStaff);
                const engraving::SysStaff* sysLast = system->staff(lastStaff);
                const engraving::Staff* scoreFirst = score->staff(firstStaff);
                const engraving::Staff* scoreLast = score->staff(lastStaff);
                if (!sysFirst || !sysLast || !scoreFirst || !scoreLast) {
                    continue;
                }

                // Take the geometry from the StaffLines the renderer actually draws.
                // SysStaff::y() reads _bbox, which is not the post-System::layout2 position
                // (_yPos is, and has no accessor), so it reports evenly spaced staves even
                // where layout stretched one of them -- which is exactly the case this
                // export exists to handle.
                engraving::Measure* systemMeasure = system->firstMeasure();
                if (!systemMeasure) {
                    continue;
                }
                const engraving::StaffLines* firstLines = systemMeasure->staffLines(firstStaff);
                const engraving::StaffLines* lastLines = systemMeasure->staffLines(lastStaff);
                if (!firstLines || !lastLines) {
                    continue;
                }

                const muse::RectF firstRect = firstLines->pageBoundingRect();
                const muse::RectF lastRect = lastLines->pageBoundingRect();

                const engraving::Fraction zeroTick = engraving::Fraction(0, 1);
                const double standardStaffHeight = 4 * scoreFirst->spatium(zeroTick);

                // Short staves (single-line percussion) are centred in the height a
                // standard 5-line staff would occupy, so bands stay a consistent size.
                double y1 = firstRect.top();
                if (firstRect.height() < standardStaffHeight) {
                    y1 -= 0.5 * (standardStaffHeight - firstRect.height());
                }
                double y2 = lastRect.bottom();
                if (lastRect.height() < standardStaffHeight) {
                    y2 += 0.5 * (standardStaffHeight - lastRect.height());
                }

                if (!first) {
                    json += u",";
                }
                first = false;

                json += String(u"{\"page\":%1,\"system\":%2,\"partIndex\":%3,\"y\":%4,\"height\":%5}")
                    .arg(static_cast<int>(pageIdx))
                    .arg(static_cast<int>(systemIdx))
                    .arg(static_cast<int>(partIdx))
                    .arg(y1)
                    .arg(y2 - y1);
            }
        }
    }

    json += u"]";
    return textResponse(json.toStdString());
}
}
