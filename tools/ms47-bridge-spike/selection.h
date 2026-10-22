// SPDX-License-Identifier: GPL-3.0-only
#pragma once
#include "engraving/dom/stafflines.h"
#include "engraving/infrastructure/imimedata.h"


static bool selectMeasureRange(Score* score, engraving::Measure* measure, engraving::staff_idx_t staffIdx)
{
    if (!measure || staffIdx == muse::nidx) {
        return false;
    }

    engraving::Measure* m = measure;
    const engraving::Fraction tick = m->tick();
    const engraving::Fraction etick = tick + m->ticks();
    engraving::Segment* startSegment = m->tick2segment(tick);
    if (!startSegment) {
        startSegment = m->first(engraving::SegmentType::ChordRest);
    }
    if (!startSegment) {
        return false;
    }
    engraving::Segment* endSegment = (m == score->lastMeasure()) ? nullptr : m->last();

    auto& selection = score->selection();
    if (selection.isNone() || (selection.isList() && !selection.isSingle())) {
        if (selection.isList()) {
            score->deselectAll();
        }
        selection.setRange(startSegment, endSegment, staffIdx, staffIdx + 1);
    } else if (selection.isRange()) {
        selection.extendRangeSelection(startSegment, endSegment, staffIdx, tick, etick);
    } else if (selection.isSingle()) {
        engraving::EngravingItem* oe = selection.element();
        if (oe && (oe->isNote() || oe->isChordRest())) {
            if (oe->isNote()) {
                oe = oe->parentItem();
            }
            engraving::ChordRest* cr = engraving::toChordRest(oe);
            const engraving::Fraction oetick = cr->segment()->tick();
            engraving::Segment* rangeStart = cr->segment();
            engraving::Segment* rangeEnd = m->last();
            if (tick < oetick) {
                rangeStart = m->tick2segment(tick);
                if (etick <= oetick) {
                    const auto st = engraving::SegmentType::ChordRest | engraving::SegmentType::EndBarLine | engraving::SegmentType::Clef;
                    rangeEnd = cr->nextSegmentAfterCR(st);
                }
            }
            engraving::staff_idx_t staffStart = staffIdx;
            engraving::staff_idx_t endStaff = staffIdx + 1;
            if (staffStart > cr->staffIdx()) {
                staffStart = cr->staffIdx();
            } else if (cr->staffIdx() >= endStaff) {
                endStaff = cr->staffIdx() + 1;
            }
            selection.setRange(rangeStart, rangeEnd, staffStart, endStaff);
        } else {
            score->deselectAll();
            selection.setRange(startSegment, endSegment, staffIdx, staffIdx + 1);
        }
    } else {
        return false;
    }
    selection.updateSelectedElements();
    selection.setActiveTrack(staffIdx * mu::engraving::VOICES);
    return true;
}

static bool elementLower(const engraving::EngravingItem* e1, const engraving::EngravingItem* e2)
{
    if (!e1->selectable()) {
        return false;
    }
    if (!e2->selectable()) {
        return true;
    }
    return e1->z() < e2->z();
}

static engraving::EngravingItem* pickTopmostTextItem(std::vector<engraving::EngravingItem*>& items)
{
    if (items.empty()) {
        return nullptr;
    }

    std::sort(items.begin(), items.end(), elementLower);
    for (auto it = items.rbegin(); it != items.rend(); ++it) {
        engraving::EngravingItem* item = *it;
        if (!item) {
            continue;
        }
        if (item->isPage()) {
            continue;
        }
        if (item->isTextBase()) {
            return item;
        }
    }

    return nullptr;
}

static engraving::EngravingItem* pickTopmostSelectableItem(std::vector<engraving::EngravingItem*>& items)
{
    if (items.empty()) {
        return nullptr;
    }

    std::sort(items.begin(), items.end(), elementLower);
    // Prefer a concrete element (e.g. a title/frame text) over the frame box that
    // contains it. A VBox/HBox/TBox spans the whole frame, so without this it
    // swallows clicks meant for the text inside it — which then can't be edited
    // (setSelectedText needs a TextBase selected, not the box).
    engraving::EngravingItem* boxFallback = nullptr;
    for (auto it = items.rbegin(); it != items.rend(); ++it) {
        engraving::EngravingItem* item = *it;
        if (!item || item->isPage() || !item->selectable()) {
            continue;
        }
        if (item->isBox()) {
            if (!boxFallback) {
                boxFallback = item;
            }
            continue;
        }
        return item;
    }

    return boxFallback;
}

static std::vector<engraving::EngravingItem*> selectableItemsAtPoint(engraving::Page* page, const muse::PointF& pt)
{
    if (!page) {
        return {};
    }

    auto items = page->items(pt);
    if (!items.empty()) {
        return items;
    }

    const muse::PointF localPt = pt - page->pos();
    items = page->items(localPt);
    if (!items.empty()) {
        return items;
    }

    constexpr double kHitRadii[] = { 1.5, 3.0, 6.0, 10.0 };
    for (double radius : kHitRadii) {
        const muse::RectF globalRect(pt.x() - radius, pt.y() - radius, radius * 2.0, radius * 2.0);
        items = page->items(globalRect);
        if (!items.empty()) {
            return items;
        }

        const muse::RectF localRect(localPt.x() - radius, localPt.y() - radius, radius * 2.0, radius * 2.0);
        items = page->items(localRect);
        if (!items.empty()) {
            return items;
        }
    }

    return {};
}

static bool selectMeasureAtPointImpl(uintptr_t score_ptr, int pageNumber, double x, double y,
                                     bool replace, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    const auto& pages = score->pages();

    if (pageNumber < 0 || pageNumber >= (int)pages.size()) {
        LOGW() << "selectMeasureAtPoint: invalid page index " << pageNumber;
        return false;
    }

    engraving::Page* page = pages.at(pageNumber);
    const muse::PointF pt(x, y);
    const muse::PointF canvasPt = pt + page->pos();


    engraving::staff_idx_t staffIdx = muse::nidx;
    engraving::Segment* segment = nullptr;
    muse::PointF offset;
    engraving::Measure* measure = score->pos2measure(canvasPt, &staffIdx, nullptr, &segment, &offset);


    if (!measure || staffIdx == muse::nidx) {
        return false;
    }

    auto* staffLines = measure->staffLines(staffIdx);

    if (!staffLines || !staffLines->canvasBoundingRect().contains(canvasPt)) {
        return false;
    }

    if (replace) {
        score->deselectAll();
    }

    if (!selectMeasureRange(score, measure, staffIdx)) {
        return false;
    }

    score->updateSelection();
    score->setSelectionChanged(true);

    return true;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE bool selectTextElementAtPoint(uintptr_t score_ptr, int pageNumber, double x, double y, int excerptId)
{
    x = fromAbi(x); y = fromAbi(y);   // ABI units (bridge.cpp)
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    const auto& pages = score->pages();

    if (pageNumber < 0 || pageNumber >= (int)pages.size()) {
        LOGW() << "selectTextElementAtPoint: invalid page index " << pageNumber;
        return false;
    }

    engraving::Page* page = pages.at(pageNumber);
    const muse::PointF pt(x, y);

    auto items = selectableItemsAtPoint(page, pt);
    engraving::EngravingItem* target = pickTopmostTextItem(items);
    if (!target) {
        return false;
    }

    score->deselectAll();
    score->select(target, engraving::SelectType::SINGLE, target->staffIdx());
    score->updateSelection();
    score->setSelectionChanged(true);
    return true;
}

EMSCRIPTEN_KEEPALIVE bool selectElementAtPoint(uintptr_t score_ptr, int pageNumber, double x, double y, int excerptId)
{
    x = fromAbi(x); y = fromAbi(y);   // ABI units (bridge.cpp)
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    const auto& pages = score->pages();

    if (pageNumber < 0 || pageNumber >= (int)pages.size()) {
        LOGW() << "selectElementAtPoint: invalid page index " << pageNumber;
        return false;
    }

    engraving::Page* page = pages.at(pageNumber);
    const muse::PointF pt(x, y);

    auto items = selectableItemsAtPoint(page, pt);
    if (items.empty()) {
        return false;
    }

    engraving::EngravingItem* target = pickTopmostSelectableItem(items);

    if (!target) {
        return false;
    }

    bool manuallySetRange = false;
    score->deselectAll();

    // Staff-line hits select the enclosing measure as a range.
    if (target->type() == engraving::ElementType::STAFF_LINES) {
        auto* measure = target->findMeasure();
        if (measure) {
            auto staffIdx = target->staffIdx();
            if (selectMeasureRange(score, measure, staffIdx)) {
                manuallySetRange = true;
            }
        } else {
            score->select(target, engraving::SelectType::SINGLE, target->staffIdx());
        }
    } else if (target->type() == engraving::ElementType::MEASURE) {
        // Direct Measure selection (in case we ever hit this)
        auto* measure = static_cast<engraving::Measure*>(target);
        auto staffIdx = target->staffIdx();
        if (selectMeasureRange(score, measure, staffIdx)) {
            manuallySetRange = true;
        }
    } else {
        // Normal single element selection
        score->select(target, engraving::SelectType::SINGLE, target->staffIdx());
    }

    if (!manuallySetRange) {
        score->updateSelection();
    }
    score->setSelectionChanged(true);


    return true;
}

EMSCRIPTEN_KEEPALIVE bool selectMeasureAtPoint(uintptr_t score_ptr, int pageNumber, double x, double y, int excerptId)
{
    return selectMeasureAtPointImpl(score_ptr, pageNumber, fromAbi(x), fromAbi(y), /*replace*/ true, excerptId);
}

EMSCRIPTEN_KEEPALIVE bool extendMeasureSelectionAtPoint(uintptr_t score_ptr, int pageNumber, double x, double y, int excerptId)
{
    return selectMeasureAtPointImpl(score_ptr, pageNumber, fromAbi(x), fromAbi(y), /*replace*/ false, excerptId);
}

EMSCRIPTEN_KEEPALIVE bool convertRangeToListSelection(uintptr_t score_ptr, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;

    // If it's a list selection with Chords, convert Chords to Notes
    if (score->selection().state() == engraving::SelState::LIST) {
        bool hasChords = false;
        for (auto* el : score->selection().elements()) {
            if (el && el->isChord()) {
                hasChords = true;
                break;
            }
        }

        if (hasChords) {
            std::vector<engraving::EngravingItem*> notes;
            for (auto* el : score->selection().elements()) {
                if (el && el->isChord()) {
                    auto* chord = static_cast<engraving::Chord*>(el);
                    for (auto* note : chord->notes()) {
                        notes.push_back(note);
                    }
                } else if (el && el->isRest()) {
                    notes.push_back(el);
                }
            }

            score->deselectAll();
            for (auto* note : notes) {
                score->select(note, engraving::SelectType::ADD, 0);
            }
            score->updateSelection();
            score->setSelectionChanged(true);
            return true;
        }

        return true;
    }

    if (!score->selection().isRange()) {
        return true;
    }

    auto* startSeg = score->selection().startSegment();
    auto* endSeg = score->selection().endSegment();
    auto staffStart = score->selection().staffStart();
    auto staffEnd = score->selection().staffEnd();

    // Collect all chord/rest elements AND their notes in the range
    std::vector<engraving::EngravingItem*> rangeElements;
    for (auto* seg = startSeg; seg && seg != endSeg; seg = seg->next1()) {
        if (seg->segmentType() != engraving::SegmentType::ChordRest) {
            continue;
        }
        for (auto staffIdx = staffStart; staffIdx < staffEnd; ++staffIdx) {
            for (size_t voice = 0; voice < mu::engraving::VOICES; ++voice) {
                auto* el = seg->element(staffIdx * mu::engraving::VOICES + voice);
                if (el && el->isChord()) {
                    // For chords, select the individual notes (pitch operations work on notes)
                    auto* chord = static_cast<engraving::Chord*>(el);
                    for (auto* note : chord->notes()) {
                        rangeElements.push_back(note);
                    }
                } else if (el && el->isRest()) {
                    rangeElements.push_back(el);
                }
            }
        }
    }

    // Clear and rebuild as list selection with individual notes
    score->deselectAll();
    for (auto* el : rangeElements) {
        score->select(el, engraving::SelectType::ADD, 0);
    }

    score->updateSelection();
    score->setSelectionChanged(true);

    return true;
}

EMSCRIPTEN_KEEPALIVE bool selectElementAtPointWithMode(uintptr_t score_ptr, int pageNumber, double x, double y, int mode, int excerptId)
{
    x = fromAbi(x); y = fromAbi(y);   // ABI units (bridge.cpp)
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    const auto& pages = score->pages();

    if (pageNumber < 0 || pageNumber >= (int)pages.size()) {
        LOGW() << "selectElementAtPointWithMode: invalid page index " << pageNumber;
        return false;
    }

    // 0 = replace, 1 = add, 2 = toggle, 3 = range
    if (mode < 0 || mode > 3) {
        LOGW() << "selectElementAtPointWithMode: invalid selection mode " << mode;
        return false;
    }

    engraving::Page* page = pages.at(pageNumber);
    const muse::PointF pt(x, y);

    auto items = selectableItemsAtPoint(page, pt);
    if (items.empty()) {
        return false;
    }

    engraving::EngravingItem* target = pickTopmostSelectableItem(items);

    if (!target) {
        return false;
    }

    if (mode == 0) {
        score->deselectAll();
        score->select(target, engraving::SelectType::SINGLE, target->staffIdx());
    } else if (mode == 1) {
        score->select(target, engraving::SelectType::ADD, target->staffIdx());
    } else if (mode == 2) {
        if (target->selected()) {
            score->deselect(target);
        } else {
            score->select(target, engraving::SelectType::ADD, target->staffIdx());
        }
    } else if (mode == 3) {
        // RANGE selection - extends selection from current to target element
        score->select(target, engraving::SelectType::RANGE, target->staffIdx());
    }

    score->updateSelection();
    score->setSelectionChanged(true);
    return true;
}

}

class SimpleMimeData final : public engraving::IMimeData {
public:
    SimpleMimeData(std::string mimeType, ByteArray data)
        : m_mimeType(std::move(mimeType))
        , m_data(std::move(data)) {}

    std::vector<std::string> formats() const override {
        return { m_mimeType };
    }

    bool hasFormat(const std::string& mimeType) const override {
        return mimeType == m_mimeType;
    }

    ByteArray data(const std::string& mimeType) const override {
        if (mimeType != m_mimeType) {
            return ByteArray();
        }
        return m_data;
    }

    bool hasImage() const override {
        return false;
    }

    std::shared_ptr<muse::draw::Pixmap> imageData() const override {
        return nullptr;
    }

private:
    std::string m_mimeType;
    ByteArray m_data;
};

extern "C" {
EMSCRIPTEN_KEEPALIVE const uint8_t* selectionMimeType(uintptr_t id, int excerpt) {
    auto* score = getScore(id, excerpt);
    if (!score) return textResponse("Invalid score or excerpt", 1);
    return textResponse(score->selection().mimeType().toStdString());
}
EMSCRIPTEN_KEEPALIVE const uint8_t* selectionMimeData(uintptr_t id, int excerpt) {
    auto* score = getScore(id, excerpt);
    if (!score) return textResponse("Invalid score or excerpt", 1);
    return response(score->selection().mimeData());
}
EMSCRIPTEN_KEEPALIVE bool pasteSelection(uintptr_t id, const char* mimeType, const char* data, uint32_t size, int excerpt) {
    auto* score = getScore(id, excerpt);
    if (!score || !mimeType || !data || !size) return false;
    SimpleMimeData mime(mimeType, ByteArray(data, size));
    score->startCmd(muse::TranslatableString("action", "Paste"));
    const bool pasted = score->cmdPaste(&mime, nullptr);
    score->endCmd();
    layoutLinked(score);
    return pasted;
}
}
