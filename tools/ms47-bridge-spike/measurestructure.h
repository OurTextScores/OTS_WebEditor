// SPDX-License-Identifier: GPL-3.0-only
#pragma once
#include "engraving/dom/spacer.h"

enum class InsertMeasuresTarget {
    AfterSelection = 0,
    BeforeSelection = 1,
    AtStartOfScore = 2,
    AtEndOfScore = 3,
};

static InsertMeasuresTarget parseInsertMeasuresTarget(int target)
{
    switch (target) {
    case 0:
        return InsertMeasuresTarget::AfterSelection;
    case 1:
        return InsertMeasuresTarget::BeforeSelection;
    case 2:
        return InsertMeasuresTarget::AtStartOfScore;
    case 3:
        return InsertMeasuresTarget::AtEndOfScore;
    default:
        LOGW() << "insertMeasures: unknown target " << target << ", defaulting to end of score";
        return InsertMeasuresTarget::AtEndOfScore;
    }
}

static bool computeBeforeMeasureIndex(MasterScore* score, InsertMeasuresTarget target, int& beforeIndex)
{
    beforeIndex = -1;

    if (target == InsertMeasuresTarget::AfterSelection || target == InsertMeasuresTarget::BeforeSelection) {
        auto& selection = score->selection();
        if (selection.isNone()) {
            LOGW() << "insertMeasures: selection required for target " << static_cast<int>(target);
            return false;
        }

        if (selection.isRange()) {
            engraving::Measure* startMeasure = nullptr;
            engraving::Measure* endMeasure = nullptr;
            if (selection.measureRange(&startMeasure, &endMeasure)) {
                const int startIndex = startMeasure ? startMeasure->index() : 0;
                const int endIndex = endMeasure ? endMeasure->index() : startIndex;
                beforeIndex = (target == InsertMeasuresTarget::BeforeSelection) ? startIndex : (endIndex + 1);
                return true;
            }
        }

        const auto& elements = selection.elements();
        for (engraving::EngravingItem* element : elements) {
            if (!element) {
                continue;
            }
            engraving::MeasureBase* measure = element->findMeasureBase();
            if (!measure) {
                continue;
            }
            const int index = measure->index();
            if (index < 0) {
                continue;
            }

            if (target == InsertMeasuresTarget::BeforeSelection) {
                if (beforeIndex < 0 || index < beforeIndex) {
                    beforeIndex = index;
                }
            } else {
                if (index + 1 > beforeIndex) {
                    beforeIndex = index + 1;
                }
            }
        }

        if (beforeIndex < 0) {
            LOGW() << "insertMeasures: could not determine insertion point for selection target";
            return false;
        }

        return true;
    }

    if (target == InsertMeasuresTarget::AtStartOfScore) {
        engraving::Measure* firstMeasure = score->firstMeasure();
        if (!firstMeasure) {
            LOGW() << "insertMeasures: score has no measures";
            return false;
        }
        beforeIndex = firstMeasure->index();
        return beforeIndex >= 0;
    }

    if (target == InsertMeasuresTarget::AtEndOfScore) {
        beforeIndex = -1;
        return true;
    }

    return false;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE bool insertMeasures(uintptr_t score_ptr, int count, int targetIndex, int excerptId)
{
    const auto target = parseInsertMeasuresTarget(targetIndex);
    if (count < 1) {
        LOGW() << "insertMeasures: invalid count " << count;
        return false;
    }

    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    int beforeIndex = -1;
    if (!computeBeforeMeasureIndex(score, target, beforeIndex)) {
        return false;
    }

    engraving::MeasureBase* beforeMeasure = beforeIndex >= 0 ? score->measure(beforeIndex) : nullptr;

    mu::engraving::Score::InsertMeasureOptions options;
    options.createEmptyMeasures = false;
    options.moveSignaturesClef = true;
    options.needDeselectAll = false;

    engraving::Measure* oldLastMeasure = nullptr;
    engraving::BarLineType oldBarLineType = engraving::BarLineType::DOUBLE;
    bool oldHadCustomEnding = false;

    score->startCmd(TranslatableString::untranslatable("insertMeasures"));
    if (target == InsertMeasuresTarget::AtEndOfScore) {
        oldLastMeasure = score->lastMeasure();
        if (oldLastMeasure) {
            if (auto barLine = ensureEndBarLine(oldLastMeasure)) {
                oldBarLineType = barLine->barLineType();
                oldHadCustomEnding = oldBarLineType != engraving::BarLineType::NORMAL;
            }
        }
    }

    for (int i = 0; i < count; ++i) {
        score->insertMeasure(beforeMeasure, options);
    }

    if (target == InsertMeasuresTarget::AtEndOfScore && oldLastMeasure && oldHadCustomEnding) {
        if (auto barLine = ensureEndBarLine(oldLastMeasure)) {
            score->undoChangeBarLineType(barLine, engraving::BarLineType::NORMAL, true);
        }
        engraving::Measure* newLastMeasure = score->lastMeasure();
        if (newLastMeasure && newLastMeasure != oldLastMeasure) {
            if (auto newBarLine = ensureEndBarLine(newLastMeasure)) {
                score->undoChangeBarLineType(newBarLine, oldBarLineType, true);
            }
        }
    }

    score->endCmd();
    score->doLayout();
    return true;
}

EMSCRIPTEN_KEEPALIVE bool addPickupMeasure(uintptr_t score_ptr, int numerator, int denominator, int excerptId)
{
    if (numerator < 1 || denominator < 1) {
        LOGW() << "addPickupMeasure: invalid fraction " << numerator << "/" << denominator;
        return false;
    }

    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;

    engraving::Measure* firstMeasure = score->firstMeasure();
    if (!firstMeasure) {
        LOGW() << "addPickupMeasure: score has no measures";
        return false;
    }

    const engraving::Fraction pickupFraction(numerator, denominator);
    if (pickupFraction >= firstMeasure->timesig()) return false;

    // If measure 0 already exists and is irregular, a pickup is already present
    if (firstMeasure->no() == 0 && firstMeasure->irregular()) {
        LOGW() << "addPickupMeasure: score already has a pickup measure";
        return false;
    }

    mu::engraving::Score::InsertMeasureOptions options;
    options.createEmptyMeasures = false;
    options.moveSignaturesClef = true;
    options.needDeselectAll = false;

    score->startCmd(TranslatableString::untranslatable("addPickupMeasure"));

    // Insert one measure before the current first measure
    score->insertMeasure(firstMeasure, options);

    // The newly inserted measure is now the first measure
    engraving::Measure* newMeasure = score->firstMeasure();
    if (!newMeasure) {
        score->endCmd();
    score->doLayout();
        return false;
    }

    // Mark as irregular (pickup)
    newMeasure->undoChangeProperty(engraving::Pid::IRREGULAR, true);

    // Resize to the pickup duration
    newMeasure->adjustToLen(pickupFraction);

    score->endCmd();
    score->doLayout();
    return true;
}

EMSCRIPTEN_KEEPALIVE bool removeTrailingEmptyMeasures(uintptr_t score_ptr, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;

    engraving::Measure* lastMeasure = score->lastMeasure();
    if (!lastMeasure) {
        return false;
    }

    // Walk backwards to find the first trailing empty measure
    engraving::Measure* firstToDelete = nullptr;
    engraving::Measure* current = lastMeasure;

    while (current && current->isEmpty(muse::nidx)) {
        firstToDelete = current;
        current = current->prevMeasure();
    }

    // No empty measures to remove
    if (!firstToDelete) {
        return true;
    }

    score->startCmd(TranslatableString::untranslatable("removeTrailingEmptyMeasures"));
    score->deleteMeasures(firstToDelete, lastMeasure, false);
    score->endCmd();
    score->doLayout();
    return true;
}

EMSCRIPTEN_KEEPALIVE bool removeSelectedMeasures(uintptr_t score_ptr, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    engraving::Measure* startMeasure = nullptr;
    engraving::Measure* endMeasure = nullptr;

    if (!selectionMeasureRange(score, startMeasure, endMeasure)) {
        LOGW() << "removeSelectedMeasures: no selection";
        return false;
    }

    if (!startMeasure || !endMeasure) {
        LOGW() << "removeSelectedMeasures: invalid measure range";
        return false;
    }

    score->startCmd(TranslatableString::untranslatable("removeSelectedMeasures"));
    score->deleteMeasures(startMeasure, endMeasure, false);
    score->endCmd();
    score->doLayout();
    return true;
}

EMSCRIPTEN_KEEPALIVE bool setMeasureLengthToTimeSignature(uintptr_t score_ptr, int measureIndex, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    auto* measure = measureAtIndex(score, measureIndex);
    if (!measure) {
        LOGW() << "setMeasureLengthToTimeSignature: invalid measure index " << measureIndex;
        return false;
    }

    const engraving::Fraction nominal = measure->timesig();
    if (measure->ticks() == nominal && !measure->irregular()) {
        return true;
    }

    score->startCmd(TranslatableString::untranslatable("setMeasureLengthToTimeSignature"));
    measure->adjustToLen(nominal);
    if (measure->irregular()) {
        measure->undoChangeProperty(engraving::Pid::IRREGULAR, false);
    }
    score->endCmd();
    score->doLayout();
    return true;
}

EMSCRIPTEN_KEEPALIVE bool setMeasureLineBreaks(uintptr_t id, const char* data, uint32_t size, int excerpt) {
    auto* score=getScore(id,excerpt);
    if (!score || !data || !size) return false;
    auto document=JsonDocument::fromJson(ByteArray(data,size));
    if (!document.isArray()) return false;
    const auto breaks=document.rootArray();
    score->startCmd(TranslatableString::untranslatable("Change measure line breaks"));
    size_t i=0;
    for (auto* measure=score->firstMeasureMM(); measure; measure=measure->nextMeasureMM(),++i) {
        const bool enabled=i<breaks.size() && breaks.at(i).isBool() ? breaks.at(i).toBool() : false;
        if (measure->lineBreak()!=enabled) measure->undoSetLineBreak(enabled);
    }
    score->endCmd(); score->doLayout(); return true;
}
EMSCRIPTEN_KEEPALIVE bool setMeasureSpacer(uintptr_t id, int measureIndex, int staffIdx, double gap, int excerpt) {
    auto* score=getScore(id,excerpt);
    if (!score || staffIdx<0 || staffIdx>=int(score->nstaves()) || !std::isfinite(gap)) return false;
    auto* measure=measureAtIndex(score,measureIndex); if (!measure) return false;
    auto* spacer=measure->vspacerDown(staffIdx);
    if (!spacer && gap<=0) return true;
    score->startCmd(TranslatableString::untranslatable("Change measure spacer"));
    if (gap<=0) score->undoRemoveElement(spacer);
    else if (spacer) spacer->undoChangeProperty(Pid::SPACE,Spatium(gap));
    else {
        spacer=Factory::createSpacer(measure); spacer->setParent(measure);
        spacer->setTrack(staffIdx*engraving::VOICES); spacer->setSpacerType(SpacerType::DOWN);
        spacer->setGap(Spatium(gap)); score->undoAddElement(spacer);
    }
    score->endCmd(); score->doLayout(); return true;
}

}
