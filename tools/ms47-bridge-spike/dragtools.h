#pragma once
// Direct manipulation: element drag (begin/update/end), palette drop at a point, and spanner grip editing
// (begin/drag/end). Ported from the 4.00 bridge (web/main.cpp). 4.7 renamed startEditDrag/editDrag/endEditDrag to
// startDragGrip/dragGrip/endDragGrip; the gesture state holds the Score* the gesture began on (master or part).

#include <limits>
#include <memory>

#include "global/serialization/json.h"
#include "engraving/dom/articulation.h"
#include "engraving/dom/clef.h"
#include "engraving/dom/dynamic.h"
#include "engraving/dom/factory.h"
#include "engraving/dom/page.h"
#include "engraving/dom/spanner.h"
#include "engraving/types/symnames.h"

struct ElementDragState {
    engraving::Score* score = nullptr;
    engraving::EditData ed;
    std::vector<std::unique_ptr<engraving::ElementGroup> > groups;
    muse::PointF beginMove;
    bool active = false;

    void reset()
    {
        score = nullptr;
        ed = engraving::EditData();
        groups.clear();
        beginMove = muse::PointF();
        active = false;
    }
};

static ElementDragState g_elementDrag;

//---------------------------------------------------------
//   Spanner grip edit gesture (begin/drag/end)
//---------------------------------------------------------

struct GripEditState {
    engraving::Score* score = nullptr;
    engraving::EngravingItem* element = nullptr;
    engraving::EditData ed;
    bool active = false;
    bool dragging = false;

    void reset()
    {
        score = nullptr;
        element = nullptr;
        ed = engraving::EditData();
        active = false;
        dragging = false;
    }
};

static GripEditState g_gripEdit;

// JS-side modifier flags: 1 = shift, 2 = ctrl, 4 = alt
static engraving::KeyboardModifiers dragModifiersFromFlags(int modifiers)
{
    engraving::KeyboardModifiers mods = {};
    if (modifiers & 1) {
        mods |= engraving::ShiftModifier;
    }
    if (modifiers & 2) {
        mods |= engraving::ControlModifier;
    }
    if (modifiers & 4) {
        mods |= engraving::AltModifier;
    }
    return mods;
}

static void abortElementDragIfActive()
{
    if (g_elementDrag.active && g_elementDrag.score) {
        for (auto& g : g_elementDrag.groups) {
            g->endDrag(g_elementDrag.ed);
        }
        g_elementDrag.score->endCmd(true /* rollback */);
    }
    g_elementDrag.reset();
}

// Must run before a MasterScore is destroyed: the drag state holds raw element and
// score pointers that would otherwise dangle into freed memory.
static void abortElementDragForScore(engraving::MasterScore* master)
{
    if (!g_elementDrag.active || !g_elementDrag.score) {
        return;
    }
    if (master && g_elementDrag.score->masterScore() != master->masterScore()) {
        return;
    }
    abortElementDragIfActive();
}

static void abortGripEditIfActive()
{
    if (g_gripEdit.active && g_gripEdit.element) {
        if (g_gripEdit.dragging) {
            g_gripEdit.element->endDragGrip(g_gripEdit.ed);
        }
        g_gripEdit.element->endEdit(g_gripEdit.ed);
        if (g_gripEdit.dragging && g_gripEdit.score) {
            g_gripEdit.score->endCmd(true /* rollback */);
        }
    }
    g_gripEdit.reset();
}

static void abortGripEditForScore(engraving::MasterScore* master)
{
    if (!g_gripEdit.active || !g_gripEdit.score) {
        return;
    }
    if (master && g_gripEdit.score->masterScore() != master->masterScore()) {
        return;
    }
    abortGripEditIfActive();
}

static bool gripCanDrag(const engraving::EngravingItem* element, int gripIndex)
{
    if (!element || gripIndex < 0 || gripIndex >= element->gripsCount()) {
        return false;
    }

    // Note-anchored endpoints ask EditData::view() to locate a replacement note.
    // The headless web bridge has no MuseScoreView, so expose the grips for visual
    // parity but leave those two handles read-only. Shape and segment-anchored
    // resize grips use only engraving coordinates and are safe here.
    if (element->isSpannerSegment()
        && (gripIndex == static_cast<int>(engraving::Grip::START)
            || gripIndex == static_cast<int>(engraving::Grip::END))) {
        if (element->isSlurTieSegment()) {
            return false;
        }
        const auto* segment = engraving::toSpannerSegment(element);
        if (segment->spanner()->anchor() == engraving::Spanner::Anchor::NOTE) {
            return false;
        }
    }
    return true;
}

static const uint8_t* gripEditJson(const GripEditState& state)
{
    if (!state.active || !state.element) {
        return textResponse("null");
    }
    JsonArray grips;
    const auto positions = state.element->gripsPositions(state.ed);
    for (size_t i = 0; i < positions.size(); ++i) {
        JsonObject grip;
        grip.set("index", static_cast<int>(i));
        grip.set("x", toAbi(positions[i].x()));
        grip.set("y", toAbi(positions[i].y()));
        grip.set("draggable", gripCanDrag(state.element, static_cast<int>(i)));
        grips.append(grip);
    }
    int pageNumber = 0;
    const auto& pages = state.score->pages();
    auto* elementPage = state.element->findAncestor(engraving::ElementType::PAGE);
    for (size_t i = 0; i < pages.size(); ++i) {
        if (elementPage == pages[i]) {
            pageNumber = static_cast<int>(i);
            break;
        }
    }
    JsonObject result;
    result.set("page", pageNumber);
    result.set("grips", grips);
    return response(JsonDocument(result).toJson(JsonDocument::Format::Compact));
}

extern "C" EMSCRIPTEN_KEEPALIVE bool beginElementDrag(uintptr_t score_ptr, int pageNumber, double x, double y, int excerptId)
{
    x = fromAbi(x); y = fromAbi(y);   // ABI units (bridge.cpp)
    // A stale gesture (e.g. lost pointer-up) must not leak an open command
    abortElementDragIfActive();
    abortGripEditIfActive();

    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    const auto& pages = score->pages();

    if (pageNumber < 0 || pageNumber >= (int)pages.size()) {
        LOGW() << "beginElementDrag: invalid page index " << pageNumber;
        return false;
    }

    engraving::Page* page = pages.at(pageNumber);
    const muse::PointF pt(x, y);

    auto items = selectableItemsAtPoint(page, pt);
    engraving::EngravingItem* target = pickTopmostSelectableItem(items);
    if (!target || !target->isMovable()) {
        return false;
    }

    // Match desktop behavior: starting a drag on an unselected element selects it
    if (!target->selected()) {
        score->deselectAll();
        score->select(target, engraving::SelectType::SINGLE, target->staffIdx());
        score->updateSelection();
        score->setSelectionChanged(true);
    }

    auto isDraggable = [](const engraving::EngravingItem* e) {
        return e && e->isMovable();
    };

    std::unique_ptr<engraving::ElementGroup> group = target->getDragGroup(isDraggable);
    if (!group || !group->enabled()) {
        return false;
    }

    g_elementDrag.score = score;
    g_elementDrag.beginMove = pt + page->pos();
    g_elementDrag.ed = engraving::EditData();
    g_elementDrag.ed.pos = g_elementDrag.beginMove;
    g_elementDrag.ed.startMove = g_elementDrag.beginMove;
    g_elementDrag.ed.normalizedStartMove = g_elementDrag.beginMove;
    g_elementDrag.ed.buttons = engraving::LeftButton;
    g_elementDrag.groups.push_back(std::move(group));

    score->startCmd(TranslatableString::untranslatable("beginElementDrag"));
    for (auto& g : g_elementDrag.groups) {
        g->startDrag(g_elementDrag.ed);
    }

    g_elementDrag.active = true;
    return true;
}

// dragMode mirrors desktop DragMode: 0 = both axes, 1 = X only, 2 = Y only
extern "C" EMSCRIPTEN_KEEPALIVE bool updateElementDrag(uintptr_t score_ptr, int pageNumber, double x, double y, int modifiers, int dragMode, int excerptId)
{
    x = fromAbi(x); y = fromAbi(y);   // ABI units (bridge.cpp)
    if (!g_elementDrag.active) {
        return false;
    }

    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    if (score != g_elementDrag.score) {
        LOGW() << "updateElementDrag: score mismatch, aborting gesture";
        abortElementDragIfActive();
        return false;
    }

    const auto& pages = score->pages();
    if (pageNumber < 0 || pageNumber >= (int)pages.size()) {
        return false;
    }

    const muse::PointF toPos = muse::PointF(x, y) + pages.at(pageNumber)->pos();

    engraving::EditData& ed = g_elementDrag.ed;

    muse::PointF delta = toPos - g_elementDrag.beginMove;
    muse::PointF evtDelta = toPos - ed.pos;
    muse::PointF moveDelta = delta;

    if (dragMode == 1) {
        delta.setY(ed.delta.y());
        moveDelta.setY(ed.moveDelta.y());
        evtDelta.setY(0.0);
    } else if (dragMode == 2) {
        delta.setX(ed.delta.x());
        moveDelta.setX(ed.moveDelta.x());
        evtDelta.setX(0.0);
    }

    ed.lastPos = ed.pos;
    ed.delta = delta;
    ed.moveDelta = moveDelta;
    ed.evtDelta = evtDelta;
    ed.pos = toPos;
    ed.modifiers = dragModifiersFromFlags(modifiers);

    for (auto& g : g_elementDrag.groups) {
        g->drag(ed);
    }

    score->update();
    return true;
}


// Palette drop kinds shared with the web toolbar. Keep these values stable: they
// are part of the JS-visible bridge contract, not ElementType enum values.
enum class PaletteDropKind {
    CLEF = 0,
    DYNAMIC = 1,
    ARTICULATION = 2,
};

extern "C" EMSCRIPTEN_KEEPALIVE bool applyDropAtPoint(uintptr_t score_ptr, int pageNumber, double x, double y,
                       int elementType, int subtype, int excerptId)
{
    x = fromAbi(x); y = fromAbi(y);   // ABI units (bridge.cpp)
    abortElementDragIfActive();
    abortGripEditIfActive();

    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    const auto& pages = score->pages();
    if (pageNumber < 0 || pageNumber >= static_cast<int>(pages.size())) {
        LOGW() << "applyDropAtPoint: invalid page index " << pageNumber;
        return false;
    }

    auto* page = pages.at(pageNumber);
    const muse::PointF pagePoint(x, y);
    const muse::PointF canvasPoint = pagePoint + page->pos();
    auto items = selectableItemsAtPoint(page, pagePoint);

    engraving::EngravingItem* target = nullptr;
    // Notes and chord/rests are the meaningful targets for dynamics and
    // articulations. Prefer them over stems, beams, and other higher-z items.
    for (auto* item : items) {
        if (item && item->isNote()) {
            target = item;
            break;
        }
    }
    if (!target) {
        for (auto* item : items) {
            if (item && item->isChordRest()) {
                target = item;
                break;
            }
        }
    }
    if (!target) {
        target = pickTopmostSelectableItem(items);
    }

    engraving::EditData ed;
    ed.pos = canvasPoint;
    ed.dragOffset = muse::PointF();

    const auto kind = static_cast<PaletteDropKind>(elementType);
    switch (kind) {
    case PaletteDropKind::CLEF:
    {
        if (subtype < 0 || subtype > static_cast<int>(engraving::ClefType::MAX)) {
            LOGW() << "applyDropAtPoint: invalid clef subtype " << subtype;
            return false;
        }
        engraving::Measure* measure = target ? target->findMeasure() : nullptr;
        engraving::staff_idx_t staffIdx = target ? target->staffIdx() : muse::nidx;
        if (!measure) {
            engraving::Segment* segment = nullptr;
            measure = score->pos2measure(canvasPoint, &staffIdx, nullptr, &segment, nullptr);
        }
        if (!measure || staffIdx == muse::nidx) {
            LOGW() << "applyDropAtPoint: no measure at clef drop point";
            return false;
        }
        // 4.7's Measure::drop takes the staff from EditData::track (4.00 used the drop position);
        // without it the clef is discarded
        ed.track = engraving::staff2track(staffIdx);
        auto* clef = engraving::Factory::createClef(score->dummy()->segment());
        clef->setClefType(static_cast<engraving::ClefType>(subtype));
        ed.dropElement = clef;
        score->startCmd(TranslatableString::untranslatable("applyDropAtPoint"));
        measure->drop(ed);
        score->endCmd();
        layoutLinked(score);
        return true;
    }
    case PaletteDropKind::DYNAMIC:
    {
        engraving::DynamicType dynamicType;
        if (!legacyDynamicType(subtype, dynamicType)) { // 4.7 shifted DynamicType values; keep the JS indices
            LOGW() << "applyDropAtPoint: invalid dynamic subtype " << subtype;
            return false;
        }
        engraving::ChordRest* chordRest = nullptr;
        if (target && target->isNote()) {
            chordRest = engraving::toNote(target)->chord();
        } else if (target && target->isChordRest()) {
            chordRest = engraving::toChordRest(target);
        }
        if (!chordRest) {
            LOGW() << "applyDropAtPoint: dynamics must be dropped on a note or rest";
            return false;
        }
        auto* dynamic = engraving::Factory::createDynamic(score->dummy()->segment());
        dynamic->setDynamicType(dynamicType);
        dynamic->setXmlText(engraving::Dynamic::dynamicText(dynamicType));
        ed.dropElement = dynamic;
        score->startCmd(TranslatableString::untranslatable("applyDropAtPoint"));
        engraving::EngravingItem* dropped = chordRest->drop(ed);
        score->endCmd();
        layoutLinked(score);
        return dropped != nullptr;
    }
    case PaletteDropKind::ARTICULATION:
    {
        static constexpr const char* ARTICULATION_NAMES[] = {
            "articStaccatoAbove",
            "articTenutoAbove",
            "articMarcatoAbove",
            "articAccentAbove",
        };
        if (subtype < 0 || subtype >= static_cast<int>(std::size(ARTICULATION_NAMES))) {
            LOGW() << "applyDropAtPoint: invalid articulation subtype " << subtype;
            return false;
        }
        engraving::Chord* chord = nullptr;
        if (target && target->isNote()) {
            chord = engraving::toNote(target)->chord();
        } else if (target && target->isChord()) {
            chord = engraving::toChord(target);
        }
        if (!chord) {
            LOGW() << "applyDropAtPoint: articulations must be dropped on a note";
            return false;
        }
        const auto symId = engraving::SymNames::symIdByName(
            muse::AsciiStringView(ARTICULATION_NAMES[subtype]), engraving::SymId::noSym);
        if (symId == engraving::SymId::noSym) {
            return false;
        }
        auto* articulation = engraving::Factory::createArticulation(score->dummy()->chord());
        articulation->setSymId(symId);
        ed.dropElement = articulation;
        score->startCmd(TranslatableString::untranslatable("applyDropAtPoint"));
        engraving::EngravingItem* dropped = chord->drop(ed);
        score->endCmd();
        layoutLinked(score);
        return dropped != nullptr;
    }
    }

    LOGW() << "applyDropAtPoint: unsupported palette element type " << elementType;
    return false;
}

extern "C" EMSCRIPTEN_KEEPALIVE bool endElementDrag(uintptr_t score_ptr, bool commit, int excerptId)
{
    if (!g_elementDrag.active) {
        return false;
    }

    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    if (score != g_elementDrag.score) {
        LOGW() << "endElementDrag: score mismatch, aborting gesture";
        abortElementDragIfActive();
        return false;
    }

    for (auto& g : g_elementDrag.groups) {
        g->endDrag(g_elementDrag.ed);
    }

    score->endCmd(!commit /* rollback */);
    layoutLinked(score);
    g_elementDrag.reset();
    return true;
}



struct GripEditHitScan {
    muse::PointF point;
    engraving::EngravingItem* target = nullptr;
    double bestDistanceSquared = std::numeric_limits<double>::max();
};

static void scanGripEditTarget(void* data, engraving::EngravingItem* item)
{
    auto* scan = static_cast<GripEditHitScan*>(data);
    if (!scan || !item || !item->isSpannerSegment() || !item->isEditable() || !item->hasGrips()) {
        return;
    }

    const muse::RectF rect = item->pageBoundingRect();
    const double dx = scan->point.x() < rect.left()
        ? rect.left() - scan->point.x()
        : (scan->point.x() > rect.right() ? scan->point.x() - rect.right() : 0.0);
    const double dy = scan->point.y() < rect.top()
        ? rect.top() - scan->point.y()
        : (scan->point.y() > rect.bottom() ? scan->point.y() - rect.bottom() : 0.0);
    const double distanceSquared = dx * dx + dy * dy;
    constexpr double kMaxDistanceSquared = 20.0 * 20.0;
    if (distanceSquared <= kMaxDistanceSquared && distanceSquared <= scan->bestDistanceSquared) {
        scan->bestDistanceSquared = distanceSquared;
        scan->target = item;
    }
}

extern "C" EMSCRIPTEN_KEEPALIVE const uint8_t* beginGripEdit(uintptr_t score_ptr, int pageNumber, double x, double y, int excerptId)
{
    x = fromAbi(x); y = fromAbi(y);   // ABI units (bridge.cpp)
    abortElementDragIfActive();
    abortGripEditIfActive();

    auto* score = getScore(score_ptr, excerptId);
    if (!score) return textResponse("null");
    const auto& pages = score->pages();
    if (pageNumber < 0 || pageNumber >= static_cast<int>(pages.size())) {
        LOGW() << "beginGripEdit: invalid page index " << pageNumber;
        return textResponse("null");
    }

    engraving::Page* page = pages.at(pageNumber);
    const muse::PointF point(x, y);
    engraving::EngravingItem* target = nullptr;
    auto findSpanner = [&target](const std::vector<engraving::EngravingItem*>& items) {
        for (auto it = items.rbegin(); it != items.rend(); ++it) {
            if (*it && (*it)->isSpannerSegment() && (*it)->isEditable() && (*it)->hasGrips()) {
                target = *it;
                return true;
            }
        }
        return false;
    };

    findSpanner(page->items(point));
    const muse::PointF localPoint = point - page->pos();
    constexpr double kGripEditHitRadii[] = { 3.0, 6.0, 10.0, 16.0 };
    for (double radius : kGripEditHitRadii) {
        if (target) {
            break;
        }
        const muse::RectF globalRect(point.x() - radius, point.y() - radius, radius * 2.0, radius * 2.0);
        if (findSpanner(page->items(globalRect))) {
            break;
        }
        const muse::RectF localRect(localPoint.x() - radius, localPoint.y() - radius, radius * 2.0, radius * 2.0);
        findSpanner(page->items(localRect));
    }
    if (!target) {
        // The page BSP query can return only a broad background item when a thin
        // curve falls between indexed hit cells. A bounded page scan makes grip
        // entry reliable for slurs and one-pixel hairpin strokes.
        GripEditHitScan scan;
        scan.point = point;
        page->scanElements([&scan](engraving::EngravingItem* item) { scanGripEditTarget(&scan, item); });
        target = scan.target;
    }
    if (!target) {
        return textResponse("null");
    }

    score->deselectAll();
    score->select(target, engraving::SelectType::SINGLE, target->staffIdx());
    score->updateSelection();
    score->setSelectionChanged(true);

    g_gripEdit.score = score;
    g_gripEdit.element = target;
    g_gripEdit.ed = engraving::EditData();
    g_gripEdit.ed.element = target;
    g_gripEdit.ed.buttons = engraving::LeftButton;
    target->startEdit(g_gripEdit.ed);
    g_gripEdit.active = true;
    return gripEditJson(g_gripEdit);
}

extern "C" EMSCRIPTEN_KEEPALIVE const uint8_t* dragGrip(uintptr_t score_ptr, int gripIndex, double dx, double dy, int modifiers, int excerptId)
{
    dx = fromAbi(dx); dy = fromAbi(dy);   // ABI units (bridge.cpp)
    if (!g_gripEdit.active || !g_gripEdit.element || !gripCanDrag(g_gripEdit.element, gripIndex)) {
        return textResponse("null");
    }

    auto* score = getScore(score_ptr, excerptId);
    if (!score) return textResponse("null");
    if (score != g_gripEdit.score) {
        LOGW() << "dragGrip: score mismatch, aborting gesture";
        abortGripEditIfActive();
        return textResponse("null");
    }

    engraving::EditData& ed = g_gripEdit.ed;
    ed.curGrip = static_cast<engraving::Grip>(gripIndex);
    ed.delta = muse::PointF(dx, dy);
    ed.evtDelta = ed.delta;
    ed.moveDelta += ed.delta;
    ed.lastPos = ed.pos;
    ed.pos += ed.delta;
    ed.modifiers = dragModifiersFromFlags(modifiers);

    if (!g_gripEdit.dragging) {
        score->startCmd(TranslatableString::untranslatable("dragGrip"));
        g_gripEdit.element->startDragGrip(ed);
        g_gripEdit.dragging = true;
    }
    g_gripEdit.element->dragGrip(ed);
    score->update();
    return gripEditJson(g_gripEdit);
}

extern "C" EMSCRIPTEN_KEEPALIVE bool endGripEdit(uintptr_t score_ptr, bool commit, int excerptId)
{
    if (!g_gripEdit.active) {
        return false;
    }

    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    if (score != g_gripEdit.score) {
        LOGW() << "endGripEdit: score mismatch, aborting gesture";
        abortGripEditIfActive();
        return false;
    }

    if (g_gripEdit.dragging) {
        g_gripEdit.element->endDragGrip(g_gripEdit.ed);
    }
    g_gripEdit.element->endEdit(g_gripEdit.ed);
    if (g_gripEdit.dragging) {
        score->endCmd(!commit /* rollback */);
    layoutLinked(score);
    }
    g_gripEdit.reset();
    return true;
}

// Called by destroy(): gestures hold raw pointers into the score being freed
static void abortGesturesForScore(engraving::MasterScore* master)
{
    abortElementDragForScore(master);
    abortGripEditForScore(master);
}
