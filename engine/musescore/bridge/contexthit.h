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
#include "engraving/dom/system.h"
#include "engraving/dom/rest.h"
#include "engraving/dom/chord.h"
#include "engraving/dom/note.h"

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
    // Whether Edit Element does something here: a text opens its editor, anything else needs grips (beginGripEdit).
    // MuseScore offers it for every editable element, where desktop edit mode also takes keyboard nudges; OTS has
    // only the editor and the grips, so it is not offered where it would do nothing.
    hit.set("editable", item->isEditable() && (item->isTextBase() || (item->hasGrips() && item->gripsCount() > 0)));
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

// Select ▸ More… (MuseScore's SelectDialog, and SelectNoteDialog for a note): elements like the pattern
// (the one at the point, else the single selection), filtered as the dialog's checkboxes say, then
// replacing, added to or taken from the selection. Options, all optional booleans unless noted:
//   sameStaff, inSelection (the selection's staves), sameSubtype, sameVoice, sameSystem, sameMeasure,
//   sameBeat, sameDuration; for notes samePitch, sameNotehead, sameNoteType, sameString;
//   fromSelection (search only among the selected elements); mode: "replace" | "add" | "subtract".
EMSCRIPTEN_KEEPALIVE bool selectWithOptions(uintptr_t score_ptr, int pageNumber, double x, double y,
                                            const char* optionsJson, int excerptId)
{
    x = fromAbi(x); y = fromAbi(y);   // ABI units (bridge.cpp)
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    engraving::EngravingItem* e = nullptr;
    if (pageNumber >= 0) {
        engraving::staff_idx_t staffIdx = muse::nidx;
        e = contextHitItem(score, pageNumber, muse::PointF(x, y), staffIdx);
        if (e && e->isMeasure()) e = nullptr;
    } else if (score->selection().isSingle()) {
        e = score->selection().element();
    }
    if (!e) return false;
    const JsonObject o = JsonDocument::fromJson(ByteArray(optionsJson ? optionsJson : "{}")).rootObject();
    auto on = [&o](const char* key) { return o.contains(key) && o.value(key).toBool(); };
    const Selection& selection = score->selection();

    auto fill = [&](engraving::ElementPattern& p) {
        p.type = int(e->type());
        p.subtype = e->subtype();
        p.subtypeValid = on("sameSubtype");
        if (on("sameStaff")) {
            p.staffStart = e->staffIdx();
            p.staffEnd = e->staffIdx() + 1;
        } else if (on("inSelection")) {
            p.staffStart = selection.staffStart();
            p.staffEnd = selection.staffEnd();
        } else {
            p.staffStart = muse::nidx;
            p.staffEnd = muse::nidx;
        }
        p.voice = on("sameVoice") ? e->voice() : muse::nidx;
        if (on("sameSystem")) {
            for (auto* ee = e; ee; ee = ee->parentItem()) {
                if (ee->isSystem()) { p.system = engraving::toSystem(ee); break; }
            }
        }
        if (on("sameMeasure")) p.measure = e->findMeasure();
        if (on("sameBeat")) p.beat = e->beat();
        if (on("sameDuration") && e->isRest()) p.durationTicks = engraving::toRest(e)->actualTicks();
    };

    std::vector<engraving::EngravingItem*> matches;
    const bool fromSelection = on("fromSelection");
    const std::vector<engraving::EngravingItem*> selected = selection.elements();
    if (e->isNote()) {
        const engraving::Note* n = engraving::toNote(e);
        engraving::NotePattern p;
        fill(p);
        p.type = engraving::NoteType::INVALID;
        if (on("samePitch")) p.pitch = n->pitch();
        if (on("sameNotehead")) p.notehead = n->headGroup();
        if (on("sameNoteType")) p.type = n->noteType();
        if (on("sameString")) p.string = n->string();
        if (on("sameDuration")) p.durationTicks = n->chord()->actualTicks();
        if (fromSelection) {
            for (auto* item : selected) engraving::Score::collectNoteMatch(&p, item);
        } else {
            score->scanElements([&p](engraving::EngravingItem* item) { engraving::Score::collectNoteMatch(&p, item); });
        }
        matches.assign(p.el.begin(), p.el.end());
    } else {
        engraving::ElementPattern p;
        fill(p);
        if (fromSelection) {
            for (auto* item : selected) engraving::Score::collectMatch(&p, item);
        } else {
            score->scanElements([&p](engraving::EngravingItem* item) { engraving::Score::collectMatch(&p, item); });
        }
        matches = p.el;
    }

    const String mode = o.contains("mode") ? o.value("mode").toString() : String(u"replace");
    if (mode == u"subtract") {
        for (auto* item : matches) score->deselect(item);
    } else {
        if (mode != u"add") score->deselectAll();
        if (!matches.empty()) score->select(matches, engraving::SelectType::ADD, 0);
    }
    score->setSelectionChanged(true);
    return !matches.empty();
}

// MuseScore's Ctrl+click on overlapping elements (NotationViewInputController::cycleOverlappingHitElements): with
// two or more elements under the point, the one after the selected one (in stacking order, cyclically) replaces it,
// so a click can reach an l.v. tie drawn inside its note's shape. Staff lines and bars are not candidates. False,
// changing nothing, when fewer than two elements are there (the caller then adds to the selection as usual).
EMSCRIPTEN_KEEPALIVE bool cycleSelectionAtPoint(uintptr_t score_ptr, int pageNumber, double x, double y, int excerptId)
{
    x = fromAbi(x); y = fromAbi(y);   // ABI units (bridge.cpp)
    auto* score = getScore(score_ptr, excerptId);
    if (!score || pageNumber < 0 || pageNumber >= static_cast<int>(score->pages().size())) return false;
    auto items = selectableItemsAtPoint(score->pages().at(pageNumber), muse::PointF(x, y));
    std::vector<engraving::EngravingItem*> hits;
    for (auto* item : items) {
        if (item && item->selectable() && !item->isPage() && !item->isStaffLines() && !item->isMeasure()) hits.push_back(item);
    }
    if (hits.size() < 2) return false;
    std::sort(hits.begin(), hits.end(), elementLower);   // topmost last

    const size_t n = hits.size();
    size_t top = n - 1;
    engraving::EngravingItem* next = hits[top];
    std::set<engraving::EngravingItem*> selectedHere;
    bool found = false;
    for (size_t i = 0; i <= n; ++i) {
        if (found) {
            next = hits[top];
            break;
        } else if (hits[top]->selected()) {
            found = true;
            selectedHere.insert(hits[top]);
            next = nullptr;
        }
        top = (top + 1) % n;
    }
    if (!next || next->selected()) return true;   // nothing new to reach; the selection stays
    for (auto* item : selectedHere) score->deselect(item);
    score->select(next, engraving::SelectType::ADD, next->staffIdx());
    score->setSelectionChanged(true);
    return true;
}

}
