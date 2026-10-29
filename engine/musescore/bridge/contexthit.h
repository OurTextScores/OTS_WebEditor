// SPDX-License-Identifier: GPL-3.0-only
#pragma once
// The score's right-click menu (OTS docs/private/RIGHT_CLICK_CONTEXT_MENU_DESIGN_2026-10-28.md):
// what MuseScore's NotationContextMenuModel reads about the element under the pointer, read
// without changing the selection, and the Select ▸ Similar actions it offers.
#include "global/serialization/json.h"
#include "engraving/dom/barline.h"
#include "engraving/dom/fret.h"
#include "engraving/dom/gradualtempochange.h"
#include "engraving/dom/hairpin.h"
#include "engraving/dom/harmony.h"
#include "engraving/dom/instrument.h"
#include "engraving/dom/part.h"

// What MuseScore's hitElement() returns at a point: the topmost selectable item, with staff
// lines and empty staff space standing for their bar, as a click there selects it.
static engraving::EngravingItem* contextHitItem(Score* score, int pageNumber, const muse::PointF& pt,
                                                engraving::staff_idx_t& staffIdx)
{
    staffIdx = muse::nidx;
    const auto& pages = score->pages();
    if (pageNumber < 0 || pageNumber >= static_cast<int>(pages.size())) return nullptr;
    engraving::Page* page = pages.at(pageNumber);

    auto items = selectableItemsAtPoint(page, pt);
    engraving::EngravingItem* item = pickTopmostSelectableItem(items);
    if (item && item->isStaffLines()) {
        staffIdx = item->staffIdx();
        return item->findMeasure();
    }
    if (item) {
        staffIdx = item->staffIdx();
        return item;
    }

    // Blank staff space inside a bar: the bar, exactly where selectMeasureAtPoint would find it.
    const muse::PointF canvasPt = pt + page->pos();
    engraving::staff_idx_t measureStaff = muse::nidx;
    engraving::Measure* measure = score->pos2measure(canvasPt, &measureStaff, nullptr, nullptr, nullptr);
    if (!measure || measureStaff == muse::nidx) return nullptr;
    auto* staffLines = measure->staffLines(measureStaff);
    if (!staffLines || !staffLines->canvasBoundingRect().contains(canvasPt)) return nullptr;
    staffIdx = measureStaff;
    return measure;
}

// Inside the selected range: MuseScore keeps a range when the right-click lands in it.
static bool inSelectedRange(const Selection& selection, const engraving::EngravingItem* item,
                            engraving::staff_idx_t staffIdx)
{
    if (!selection.isRange() || staffIdx == muse::nidx) return false;
    if (staffIdx < selection.staffStart() || staffIdx >= selection.staffEnd()) return false;
    const Fraction tick = item->tick();
    return tick >= selection.tickStart() && tick < selection.tickEnd();
}

static JsonObject contextSelection(Score* score)
{
    const Selection& selection = score->selection();
    JsonObject result;
    const char* kind = selection.isRange() ? "range"
                       : selection.isNone() ? "none"
                       : selection.element() ? "single" : "list";
    result.set("kind", kind);
    // The element itself, not its spanner: MuseScore picks a hairpin's menu by HAIRPIN_SEGMENT.
    engraving::EngravingItem* single = selection.isSingle() ? selection.element() : nullptr;
    result.set("type", single ? JsonValue(String::fromUtf8(single->typeName())) : JsonValue());
    return result;
}

// The per-element conditions NotationContextMenuModel tests, for the element a menu is about.
static JsonObject contextElement(Score* score, engraving::EngravingItem* item, engraving::staff_idx_t staffIdx)
{
    const Selection& selection = score->selection();
    JsonObject hit;
    hit.set("type", String::fromUtf8(item->typeName()));
    hit.set("selected", drawnAsSelected(item, selection) || inSelectedRange(selection, item, staffIdx));
    hit.set("editable", item->isEditable());
    hit.set("staffIdx", staffIdx == muse::nidx ? JsonValue() : JsonValue(static_cast<int>(staffIdx)));

    bool drumStaff = false;
    if (staffIdx != muse::nidx && staffIdx < score->nstaves()) {
        const engraving::Instrument* instrument = score->staff(staffIdx)->part()->instrument(item->tick());
        drumStaff = instrument && instrument->drumset() != nullptr;
    }
    hit.set("drumStaff", drumStaff);

    JsonObject flags;
    if (item->isHarmony()) {
        const auto* harmony = engraving::toHarmony(item);
        flags.set("inFretBox", harmony->isInFretBox());
        flags.set("harmonyHasFretDiagram", item->explicitParent() && item->explicitParent()->isFretDiagram());
    } else if (item->isFretDiagram()) {
        const auto* fret = engraving::toFretDiagram(item);
        flags.set("inFretBox", fret->isInFretBox());
        flags.set("fretHasHarmony", fret->harmony() != nullptr);
    } else if (item->isHairpinSegment()) {
        const auto* hairpin = engraving::toHairpinSegment(item)->hairpin();
        flags.set("snapBefore", hairpin->snapToItemBefore());
        flags.set("snapAfter", hairpin->snapToItemAfter());
    } else if (item->isGradualTempoChangeSegment()) {
        flags.set("snapAfter", engraving::toGradualTempoChangeSegment(item)->tempoChange()->snapToItemAfter());
    } else if (item->isText()) {
        flags.set("parentIsBarline", item->parentItem() && item->parentItem()->isBarLine());
    }
    hit.set("flags", flags);
    return hit;
}

static const uint8_t* contextReport(Score* score, engraving::EngravingItem* item, engraving::staff_idx_t staffIdx)
{
    JsonObject result;
    if (item) {
        result.set("hit", contextElement(score, item, staffIdx));
    } else {
        result.set("hit", JsonValue());
    }
    result.set("selection", contextSelection(score));
    return response(JsonDocument(result).toJson(JsonDocument::Format::Compact));
}

extern "C" {

// The element under a right-click and the selection, without changing either.
EMSCRIPTEN_KEEPALIVE const uint8_t* contextHitAtPoint(uintptr_t score_ptr, int pageNumber, double x, double y,
                                                      int excerptId)
{
    x = fromAbi(x); y = fromAbi(y);   // ABI units (bridge.cpp)
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return textResponse("Invalid score", 1);
    engraving::staff_idx_t staffIdx = muse::nidx;
    engraving::EngravingItem* item = contextHitItem(score, pageNumber, muse::PointF(x, y), staffIdx);
    return contextReport(score, item, staffIdx);
}

// The same report for the keyboard's menu (Shift+F10): about the single selected element, if any.
EMSCRIPTEN_KEEPALIVE const uint8_t* contextSelectionInfo(uintptr_t score_ptr, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return textResponse("Invalid score", 1);
    engraving::EngravingItem* item = score->selection().isSingle() ? score->selection().element() : nullptr;
    return contextReport(score, item, item ? item->staffIdx() : muse::nidx);
}

// Select ▸ Similar (mode 0), Similar on this staff (1), Similar in this range (2): MuseScore's
// select-similar actions, which use Score::selectSimilar / selectSimilarInRange. The pattern
// element is the one at the point (the right-clicked one, MuseScore's lastElementHit); with
// pageNumber < 0 it is the single selected element.
EMSCRIPTEN_KEEPALIVE bool selectSimilar(uintptr_t score_ptr, int mode, int pageNumber, double x, double y,
                                        int excerptId)
{
    x = fromAbi(x); y = fromAbi(y);   // ABI units (bridge.cpp)
    auto* score = getScore(score_ptr, excerptId);
    if (!score || mode < 0 || mode > 2) return false;

    engraving::EngravingItem* pattern = nullptr;
    if (pageNumber >= 0) {
        engraving::staff_idx_t staffIdx = muse::nidx;
        pattern = contextHitItem(score, pageNumber, muse::PointF(x, y), staffIdx);
        if (pattern && pattern->isMeasure()) pattern = nullptr;   // a bar has no "similar"
    } else if (score->selection().isSingle()) {
        pattern = score->selection().element();
    }
    if (!pattern) return false;

    if (mode == 2) {
        if (!score->selection().isRange()) return false;
        score->selectSimilarInRange(pattern);
    } else {
        score->selectSimilar(pattern, mode == 1);
    }
    score->setSelectionChanged(true);
    return !score->selection().isNone();
}

}
