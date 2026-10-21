// SPDX-License-Identifier: GPL-3.0-only
#pragma once
#include "engraving/dom/repeatlist.h"

static engraving::EngravingItem* resolvePrimarySelectionElement(engraving::Score* score)
{
    if (!score) {
        return nullptr;
    }

    auto& selection = score->selection();
    if (auto* selected = selection.element()) {
        return selected;
    }

    if (auto* activeCr = selection.activeCR()) {
        return activeCr;
    }

    if (auto* currentCr = selection.currentCR()) {
        return currentCr;
    }

    if (auto* firstCr = selection.firstChordRest()) {
        return firstCr;
    }

    if (!selection.elements().empty()) {
        // Prefer the most recently-added list-selection element over the first one.
        // Using front() can pin audition to an older element when list selection grows.
        return selection.elements().back();
    }

    return nullptr;
}

static std::optional<int> resolveSelectionRawTick(engraving::Score* score)
{
    if (!score) {
        return std::nullopt;
    }

    const auto& selection = score->selection();
    if (selection.isRange()) {
        if (auto* start = selection.startSegment()) {
            return start->tick().ticks();
        }
    }

    if (auto* cr = selection.activeCR()) {
        return cr->tick().ticks();
    }

    if (auto* cr = selection.currentCR()) {
        return cr->tick().ticks();
    }

    if (auto* firstCr = selection.firstChordRest()) {
        return firstCr->tick().ticks();
    }

    if (auto* el = resolvePrimarySelectionElement(score)) {
        if (el->isSegment()) {
            return el->tick().ticks();
        }
        if (auto* seg = el->findAncestor(mu::engraving::ElementType::SEGMENT)) {
            return seg->tick().ticks();
        }
        return el->tick().ticks();
    }

    if (auto* firstMeasure = score->firstMeasure()) {
        return firstMeasure->tick().ticks();
    }

    return 0;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE const uint8_t* playbackTimeline(uintptr_t score_ptr, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return textResponse("Invalid score or excerpt",1);
    auto* engravingScore = static_cast<engraving::Score*>(score);
    if (!engravingScore) {
        return textResponse("null");
    }

    // Playback and the positions writer both use the expanded repeat list. Keep
    // this export on the same authority so callers never have to reconstruct
    // repeats, voltas, jumps, or tempo changes in JavaScript.
    engravingScore->masterScore()->setExpandRepeats(true);
    const auto& repeatList = engravingScore->repeatList();

    std::map<const engraving::Measure*, int> measureIndices;
    int measureIndex = 0;
    for (auto* measure = engravingScore->firstMeasureMM(); measure; measure = measure->nextMeasureMM()) {
        measureIndices.emplace(measure, measureIndex++);
    }

    JsonArray occurrences;
    int occurrenceIndex = 0;
    for (const engraving::RepeatSegment* repeatSegment : repeatList) {
        const int rawSegmentStart = repeatSegment->tick;
        const int rawSegmentEnd = rawSegmentStart + repeatSegment->len();
        const int tickOffset = repeatSegment->utick - repeatSegment->tick;

        for (auto* measure = engravingScore->tick2measureMM(engraving::Fraction::fromTicks(rawSegmentStart));
             measure;
             measure = measure->nextMeasureMM()) {
            const int rawMeasureStart = measure->tick().ticks();
            const int rawMeasureEnd = measure->endTick().ticks();
            const int rawStart = std::max(rawMeasureStart, rawSegmentStart);
            const int rawEnd = std::min(rawMeasureEnd, rawSegmentEnd);
            if (rawEnd > rawStart) {
                const int playedStart = rawStart + tickOffset;
                const int playedEnd = rawEnd + tickOffset;
                JsonObject occurrence;
                occurrence.set("occurrenceIndex", occurrenceIndex++);
                occurrence.set("measureIndex", measureIndices.count(measure) ? measureIndices.at(measure) : -1);
                occurrence.set("startMs",
                                  double(std::llround(repeatList.utick2utime(playedStart) * 1000.0)));
                occurrence.set("endMs",
                                  double(std::llround(repeatList.utick2utime(playedEnd) * 1000.0)));

                // Where the beats fall, for a click track: the measure's time signature gives the beat (a quarter in
                // 4/4, a dotted quarter in 6/8, 9/8 and 12/8), and tempo changes are already in utick2utime. The first
                // entry is the downbeat when the occurrence starts at the measure's start.
                const mu::engraving::Fraction nominal = measure->timesig();
                const int numerator = std::max(1, nominal.numerator());
                const int denominator = std::max(1, nominal.denominator());
                const bool compound = denominator >= 8 && numerator > 3 && numerator % 3 == 0;
                const int beatTicks = std::max(1, (engraving::Constants::DIVISION * 4 / denominator) * (compound ? 3 : 1));
                JsonArray beats;
                for (int tick = rawMeasureStart; tick < rawEnd; tick += beatTicks) {
                    if (tick >= rawStart) {
                        beats.append(static_cast<int>(std::llround(repeatList.utick2utime(tick + tickOffset) * 1000.0)));
                    }
                }
                occurrence.set("beatsMs", beats);
                // Whether the first beat is the measure's downbeat (an occurrence that starts mid-measure, after a
                // jump or into a volta, is not), and how many beats a full measure has (for a count-in).
                // A pickup (a measure shorter than its time signature) has no downbeat: its beats are the last ones of a bar.
                occurrence.set("downbeat", rawStart == rawMeasureStart && measure->ticks() >= nominal);
                occurrence.set("beatsPerMeasure", compound ? numerator / 3 : numerator);
                occurrences.append(occurrence);
            }

            if (rawMeasureEnd >= rawSegmentEnd) {
                break;
            }
        }
    }

    const int durationMs = static_cast<int>(
        std::llround(repeatList.utick2utime(repeatList.ticks()) * 1000.0)
    );
    JsonObject result;
    result.set("schemaVersion", 1);
    result.set("durationMs", durationMs);
    // Matches NotationPlayback's existing three-second playback tail.
    result.set("renderDurationMs", durationMs + 3000);
    result.set("occurrences", occurrences);
    return response(JsonDocument(result).toJson(JsonDocument::Format::Compact));
}

EMSCRIPTEN_KEEPALIVE float selectionPlaybackStartTime(uintptr_t id, int excerpt) {
    auto* score=getScore(id,excerpt); if (!score) return 0.f;
    score->masterScore()->setExpandRepeats(true); // repeat expansion is a master-score setting
    const auto raw=resolveSelectionRawTick(score);
    if (!raw) return 0.f;
    const auto& repeats=score->repeatList();
    return float(repeats.utick2utime(repeats.tick2utick(*raw)));
}

}
