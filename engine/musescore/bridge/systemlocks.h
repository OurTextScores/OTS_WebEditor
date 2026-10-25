// SPDX-License-Identifier: GPL-3.0-only
#pragma once
#include "engraving/dom/systemlock.h"
#include "engraving/editing/editsystemlocks.h"

// Use the active score (including excerpts); a system lock is a layout override,
// not a mutation to the master score's musical content.
static std::pair<MeasureBase*, MeasureBase*> systemLockSelection(Score* score)
{
    MeasureBase* first = nullptr;
    MeasureBase* last = nullptr;
    if (score->selection().isRange()) {
        first = score->selection().startMeasureBase();
        last = score->selection().endMeasureBase();
    } else {
        for (auto* element : score->selection().elements()) {
            if (!element) continue;
            if (element->isSystemLockIndicator()) {
                const auto* lock = toSystemLockIndicator(element)->systemLock();
                first = lock->startMB(); last = lock->endMB();
                break;
            }
            auto* mb = element->findMeasureBase();
            if (!mb || (!mb->isMeasure() && !mb->isHBox())) continue;
            if (!first || mb->isBefore(first)) first = mb;
            if (!last || mb->isAfter(last)) last = mb;
        }
    }
    while (first && !first->isMeasure()) first = first->next();
    while (last && !last->isMeasure()) last = last->prev();
    if (!first || !last || first->isAfter(last)) return { nullptr, nullptr };
    return { first, last };
}

static bool systemLockOverlaps(const SystemLock* lock, MeasureBase* first, MeasureBase* last)
{
    return first && last && !lock->endMB()->isBefore(first) && !lock->startMB()->isAfter(last);
}

static int systemLockMeasurePosition(MeasureBase* mb)
{
    int position = 0;
    for (auto* measure = mb->score()->firstMeasure(); measure; measure = measure->nextMeasure(), ++position) {
        if (measure == mb) return position;
    }
    return -1;
}

static JsonObject systemLockRange(MeasureBase* first, MeasureBase* last)
{
    // Include HBoxes in native locks but expose their adjacent musical measures.
    while (first && !first->isMeasure()) first = first->next();
    while (last && !last->isMeasure()) last = last->prev();
    if (first && toMeasure(first)->isMMRest()) first = toMeasure(first)->mmRestFirst();
    if (last && toMeasure(last)->isMMRest()) last = toMeasure(last)->mmRestLast();
    JsonObject range;
    range.set("startMeasure", first ? systemLockMeasurePosition(first) : -1);
    range.set("endMeasure", last ? systemLockMeasurePosition(last) : -1);
    return range;
}

static bool systemLockCanMove(MeasureBase* first, MeasureBase* last, int direction)
{
    if (!first || first != last || !first->isMeasure() || !first->system()) return false;
    if (direction == -1) return first->prevNonVBoxSystem() != nullptr;
    if (direction == 1) return first != first->system()->first() || first->nextNonVBoxSystem() != nullptr;
    return false;
}

extern "C" {
EMSCRIPTEN_KEEPALIVE
const uint8_t* getSystemLockState(uintptr_t id, int excerpt)
{
    auto* score = getScore(id, excerpt);
    if (!score) return textResponse("Invalid score", 1);
    const auto [first, last] = systemLockSelection(score);
    const auto locks = score->systemLocks()->allLocks();
    JsonArray ranges;
    bool intersects = false;
    bool covered = false;
    for (const auto* lock : locks) {
        ranges.append(systemLockRange(lock->startMB(), lock->endMB()));
        intersects |= systemLockOverlaps(lock, first, last);
        covered |= first && last && !first->isBefore(lock->startMB()) && !last->isAfter(lock->endMB());
    }
    const bool selected = first && last;
    const bool mixed = intersects && !covered;
    JsonObject property;
    property.set("value", mixed ? JsonValue() : JsonValue(covered));
    property.set("mixed", mixed);
    property.set("applicableCount", selected ? 1 : 0);
    JsonObject result;
    if (selected) result.set("selection", systemLockRange(first, last));
    else result.set("selection", JsonValue());
    result.set("locks", ranges);
    result.set("locked", property);
    result.set("canLock", selected && !covered);
    result.set("canUnlock", intersects);
    result.set("canMovePrevious", systemLockCanMove(first, last, -1));
    result.set("canMoveNext", systemLockCanMove(first, last, 1));
    return response(JsonDocument(result).toJson(JsonDocument::Format::Compact));
}

EMSCRIPTEN_KEEPALIVE
bool setSystemLock(uintptr_t id, int locked, int excerpt)
{
    auto* score = getScore(id, excerpt);
    if (!score || (locked != 0 && locked != 1)) return false;
    const auto [first, last] = systemLockSelection(score);
    if (!first || !last) return false;
    const auto locks = score->systemLocks()->allLocks();
    if (locked) {
        const auto* existing = score->systemLocks()->lockContaining(first);
        if (existing && existing->startMB() == first && existing->endMB() == last) return false;
    } else {
        bool intersects = false;
        for (const auto* lock : locks) intersects |= systemLockOverlaps(lock, first, last);
        if (!intersects) return false;
    }
    score->startCmd(TranslatableString::untranslatable(locked ? "Lock selected measures" : "Unlock selected measures"));
    if (locked) {
        EditSystemLocks::makeIntoSystem(score, first, last);
    } else {
        for (const auto* lock : locks) {
            if (systemLockOverlaps(lock, first, last)) EditSystemLocks::undoRemoveSystemLock(score, lock);
        }
    }
    score->endCmd();
    layoutLinked(score);
    return true;
}

EMSCRIPTEN_KEEPALIVE
bool moveSelectedMeasureToSystem(uintptr_t id, int direction, int excerpt)
{
    auto* score = getScore(id, excerpt);
    if (!score) return false;
    const auto [first, last] = systemLockSelection(score);
    if (!systemLockCanMove(first, last, direction)) return false;
    score->startCmd(TranslatableString::untranslatable("Move measures between systems"));
    if (direction == -1) EditSystemLocks::moveMeasureToPrevSystem(score, first);
    else EditSystemLocks::moveMeasureToNextSystem(score, first);
    score->endCmd();
    layoutLinked(score);
    return true;
}
}
