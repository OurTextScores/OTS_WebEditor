// SPDX-License-Identifier: GPL-3.0-only
#pragma once
#include "engraving/dom/barline.h"
#include "engraving/dom/keysig.h"

static engraving::Part* partFromIndex(Score* score, int partIndex)
{
    const auto& parts = score->parts();
    if (partIndex < 0 || partIndex >= static_cast<int>(parts.size())) {
        return nullptr;
    }
    return parts.at(static_cast<size_t>(partIndex));
}

static bool selectionMeasureRange(Score* score, engraving::Measure*& startMeasure, engraving::Measure*& endMeasure)
{
    startMeasure = nullptr;
    endMeasure = nullptr;

    if (score->selection().isNone()) {
        return false;
    }

    if (score->selection().isRange() && score->selection().measureRange(&startMeasure, &endMeasure)) {
        return startMeasure != nullptr;
    }

    engraving::Measure* measure = score->selection().findMeasure();
    if (!measure) {
        if (auto cr = score->selection().cr()) {
            measure = cr->measure();
            if (!measure) {
                measure = score->tick2measure(cr->tick());
            }
        }
    }

    if (!measure) {
        return false;
    }

    startMeasure = measure;
    endMeasure = measure;
    return true;
}

static engraving::Measure* measureAtIndex(Score* score, int measureIndex)
{
    if (measureIndex < 0) {
        return nullptr;
    }

    int index = 0;
    for (auto* measure = score->firstMeasureMM(); measure; measure = measure->nextMeasureMM()) {
        if (index == measureIndex) {
            return measure;
        }
        ++index;
    }

    return nullptr;
}

static int measureCount(Score* score)
{
    int count = 0;
    for (auto* measure = score->firstMeasureMM(); measure; measure = measure->nextMeasureMM()) {
        ++count;
    }
    return count;
}

static bool measureRangeForPage(Score* score, int pageIndex, int& startMeasureIndex, int& endMeasureIndex)
{
    startMeasureIndex = -1;
    endMeasureIndex = -1;

    if (pageIndex < 0 || size_t(pageIndex) >= score->npages()) {
        return false;
    }

    int index = 0;
    for (auto* measure = score->firstMeasureMM(); measure; measure = measure->nextMeasureMM()) {
        auto* system = measure->system();
        auto* page = system ? system->page() : nullptr;
        if (page && score->pageIdx(page) == size_t(pageIndex)) {
            if (startMeasureIndex < 0) {
                startMeasureIndex = index;
            }
            endMeasureIndex = index;
        }
        ++index;
    }

    return startMeasureIndex >= 0 && endMeasureIndex >= startMeasureIndex;
}

static int measureIndexFor(Score* score, engraving::Measure* targetMeasure)
{
    if (!targetMeasure) {
        return -1;
    }

    int index = 0;
    for (auto* measure = score->firstMeasureMM(); measure; measure = measure->nextMeasureMM()) {
        if (measure == targetMeasure) {
            return index;
        }
        ++index;
    }

    return -1;
}

static bool measureRangeForSelection(Score* score, int& startMeasureIndex, int& endMeasureIndex)
{
    startMeasureIndex = -1;
    endMeasureIndex = -1;

    engraving::Measure* startMeasure = nullptr;
    engraving::Measure* endMeasure = nullptr;
    if (!selectionMeasureRange(score, startMeasure, endMeasure)) {
        return false;
    }

    startMeasureIndex = measureIndexFor(score, startMeasure);
    endMeasureIndex = measureIndexFor(score, endMeasure ? endMeasure : startMeasure);
    return startMeasureIndex >= 0 && endMeasureIndex >= startMeasureIndex;
}

static std::string fractionToString(const engraving::Fraction& fraction)
{
    if (!fraction.isValid() || fraction.denominator() == 0) {
        return "?";
    }

    return std::to_string(fraction.numerator()) + "/" + std::to_string(fraction.denominator());
}

static bool durationBaseFraction(engraving::DurationType type, int& numerator, int& denominator)
{
    numerator = 0;
    denominator = 0;

    switch (type) {
    case engraving::DurationType::V_1024TH: numerator = 1; denominator = 1024; break;
    case engraving::DurationType::V_512TH: numerator = 1; denominator = 512; break;
    case engraving::DurationType::V_256TH: numerator = 1; denominator = 256; break;
    case engraving::DurationType::V_128TH: numerator = 1; denominator = 128; break;
    case engraving::DurationType::V_64TH: numerator = 1; denominator = 64; break;
    case engraving::DurationType::V_32ND: numerator = 1; denominator = 32; break;
    case engraving::DurationType::V_16TH: numerator = 1; denominator = 16; break;
    case engraving::DurationType::V_EIGHTH: numerator = 1; denominator = 8; break;
    case engraving::DurationType::V_QUARTER: numerator = 1; denominator = 4; break;
    case engraving::DurationType::V_HALF: numerator = 1; denominator = 2; break;
    case engraving::DurationType::V_WHOLE: numerator = 1; denominator = 1; break;
    case engraving::DurationType::V_BREVE: numerator = 2; denominator = 1; break;
    case engraving::DurationType::V_LONG: numerator = 4; denominator = 1; break;
    default:
        return false;
    }

    return true;
}

static std::string durationToken(const engraving::ChordRest* chordRest)
{
    if (!chordRest) {
        return "?";
    }

    if (chordRest->isRest()) {
        auto* rest = static_cast<const engraving::Rest*>(chordRest);
        if (rest->isFullMeasureRest()) {
            return "M";
        }
    }

    engraving::TDuration duration = chordRest->actualDurationType();
    if (!duration.isValid()) {
        duration = chordRest->durationType();
    }

    int numerator = 0;
    int denominator = 0;
    if (!durationBaseFraction(duration.type(), numerator, denominator)) {
        return "?";
    }

    std::string base = (numerator == 1)
        ? std::to_string(denominator)
        : std::to_string(numerator) + "/" + std::to_string(denominator);

    if (duration.dots() > 0) {
        base.append(static_cast<size_t>(duration.dots()), '.');
    }

    return base;
}

static std::string chordToken(const engraving::Chord* chord)
{
    if (!chord) {
        return "N?:?";
    }

    struct PitchInfo {
        int pitch = 0;
        int pc = 0;
        int octave = 0;
    };

    std::vector<PitchInfo> pitches;
    pitches.reserve(chord->notes().size());
    for (const auto* note : chord->notes()) {
        if (!note) {
            continue;
        }
        const int pitch = note->epitch();
        int pc = pitch % 12;
        if (pc < 0) {
            pc += 12;
        }
        pitches.push_back({ pitch, pc, note->octave() });
    }

    std::sort(pitches.begin(), pitches.end(), [](const PitchInfo& a, const PitchInfo& b) {
        return a.pitch < b.pitch;
    });

    std::string noteList;
    for (const auto& info : pitches) {
        if (!noteList.empty()) {
            noteList += "+";
        }
        noteList += std::to_string(info.pc) + "o" + std::to_string(info.octave);
    }

    return "N" + noteList + ":" + durationToken(chord);
}

static std::string voiceSignature(const engraving::Measure* measure, engraving::staff_idx_t staffIdx, int voice)
{
    if (!measure) {
        return "";
    }

    std::string signature;
    for (auto* segment = measure->first(engraving::SegmentType::ChordRest); segment; segment = segment->next()) {
        if (!(segment->segmentType() & engraving::SegmentType::ChordRest)) {
            continue;
        }

        auto* element = segment->element(staffIdx * mu::engraving::VOICES + voice);
        if (!element) {
            continue;
        }

        std::string token;
        if (element->isChord()) {
            token = chordToken(static_cast<engraving::Chord*>(element));
        } else if (element->isRest()) {
            token = "R:" + durationToken(static_cast<engraving::Rest*>(element));
        } else {
            continue;
        }

        if (!signature.empty()) {
            signature += " ";
        }
        signature += token;
    }

    return signature;
}

static std::string measureSignature(engraving::Part* part, engraving::Measure* measure)
{
    if (!part || !measure) {
        return "";
    }

    std::string signature = fractionToString(measure->timesig());

    signature += "|";
    std::string keyToken = "?";
    if (!part->staves().empty()) {
        if (auto* staff = part->staves().front()) {
            const auto keyEvent = staff->keySigEvent(measure->tick());
            if (keyEvent.isValid()) {
                keyToken = std::to_string(static_cast<int>(keyEvent.key()));
            }
        }
    }
    signature += keyToken;

    signature += "|";
    signature += std::to_string(static_cast<int>(measure->endBarLineType()));

    signature += "|";
    bool firstStaff = true;
    for (const auto* staff : part->staves()) {
        if (!staff) {
            continue;
        }
        if (!firstStaff) {
            signature += ";";
        }
        firstStaff = false;

        const auto staffIdx = staff->idx();
        std::string staffSig = "S" + std::to_string(staffIdx) + ":";
        for (int voice = 0; voice < int(mu::engraving::VOICES); ++voice) {
            if (voice > 0) {
                staffSig += ",";
            }
            staffSig += "V" + std::to_string(voice) + "=";
            staffSig += voiceSignature(measure, staffIdx, voice);
        }
        signature += staffSig;
    }

    return signature;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE const uint8_t* measureSignatureCount(uintptr_t score_ptr, int partIndex, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return textResponse("Invalid score or excerpt",1);
    if (!partFromIndex(score, partIndex)) {
        return numberResponse(0);
    }

    const uint32_t count = static_cast<uint32_t>(measureCount(score));
    return numberResponse(count);
}

EMSCRIPTEN_KEEPALIVE const uint8_t* measureSignatureAt(uintptr_t score_ptr, int partIndex, int measureIndex, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return textResponse("Invalid score or excerpt",1);
    auto* part = partFromIndex(score, partIndex);
    if (!part) {
        return textResponse("");
    }

    auto* measure = measureAtIndex(score, measureIndex);
    if (!measure) {
        return textResponse("");
    }

    const std::string signature = measureSignature(part, measure);
    return textResponse(signature);
}

EMSCRIPTEN_KEEPALIVE const uint8_t* measureSignatures(uintptr_t score_ptr, int partIndex, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return textResponse("Invalid score or excerpt",1);
    auto* part = partFromIndex(score, partIndex);
    if (!part) {
        return textResponse("[]");
    }

    JsonArray signatures;
    for (auto* measure = score->firstMeasureMM(); measure; measure = measure->nextMeasureMM()) {
        const std::string signature = measureSignature(part, measure);
        signatures.append(signature);
    }

    const JsonDocument doc(signatures);
    return response(doc.toJson(JsonDocument::Format::Compact));
}

EMSCRIPTEN_KEEPALIVE const uint8_t* irregularMeasures(uintptr_t score_ptr, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return textResponse("Invalid score or excerpt",1);
    JsonArray irregular;
    int index = 0;
    for (auto* measure = score->firstMeasureMM(); measure; measure = measure->nextMeasureMM()) {
        const engraving::Fraction actual = measure->ticks();
        const engraving::Fraction nominal = measure->timesig();
        if (actual != nominal) {
            const bool pickup = index == 0 && actual < nominal;
            JsonObject entry;
            entry["index"] = index;
            entry["number"] = std::string(pickup
                ? std::string("0")
                : measure->no() >= 0
                ? std::to_string(measure->no() + 1)
                : std::string("?"));
            entry["actual"] = std::string(fractionToString(actual));
            entry["nominal"] = std::string(fractionToString(nominal));
            entry["irregular"] = measure->irregular();
            entry["pickup"] = pickup;
            irregular.append(entry);
        }
        ++index;
    }
    const JsonDocument doc(irregular);
    return response(doc.toJson(JsonDocument::Format::Compact));
}

EMSCRIPTEN_KEEPALIVE const uint8_t* measureLineBreaks(uintptr_t score_ptr, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return textResponse("Invalid score or excerpt",1);
    JsonArray breaks;
    for (auto* measure = score->firstMeasureMM(); measure; measure = measure->nextMeasureMM()) {
        breaks.append(measure->lineBreak());
    }
    const JsonDocument doc(breaks);
    return response(doc.toJson(JsonDocument::Format::Compact));
}

EMSCRIPTEN_KEEPALIVE const uint8_t* measureRangeForPage(uintptr_t score_ptr, int pageIndex, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return textResponse("Invalid score or excerpt",1);
    int startMeasureIndex = -1;
    int endMeasureIndex = -1;
    if (!measureRangeForPage(score, pageIndex, startMeasureIndex, endMeasureIndex)) {
        return textResponse("null");
    }

    JsonObject result;
    result.set("startMeasureIndex", startMeasureIndex);
    result.set("endMeasureIndex", endMeasureIndex);
    return response(JsonDocument(result).toJson(JsonDocument::Format::Compact));
}

EMSCRIPTEN_KEEPALIVE const uint8_t* selectionMeasureRange(uintptr_t score_ptr, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return textResponse("Invalid score or excerpt",1);
    int startMeasureIndex = -1;
    int endMeasureIndex = -1;
    if (!measureRangeForSelection(score, startMeasureIndex, endMeasureIndex)) {
        return textResponse("null");
    }

    JsonObject result;
    result.set("startMeasureIndex", startMeasureIndex);
    result.set("endMeasureIndex", endMeasureIndex);
    return response(JsonDocument(result).toJson(JsonDocument::Format::Compact));
}

}
