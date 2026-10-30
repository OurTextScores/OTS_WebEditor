// SPDX-License-Identifier: GPL-3.0-only
#pragma once
// Harp pedal diagrams (roadmap E21): MuseScore's palette diagram and its text form, and the pedal settings its
// popup edits. Pedals are named in MuseScore's string order, D C B | E F G A, as "flat", "natural" or "sharp".
#include "global/serialization/json.h"
#include "engraving/dom/harppedaldiagram.h"

static engraving::HarpPedalDiagram* selectedHarpDiagram(Score* score)
{
    auto* element = score->selection().element();
    return element && element->isHarpPedalDiagram() ? engraving::toHarpPedalDiagram(element) : nullptr;
}

extern "C" {

// A harp pedal diagram (asText: its text form) on the selected note or rest, selected, as one undoable edit.
EMSCRIPTEN_KEEPALIVE bool addHarpPedalDiagram(uintptr_t score_ptr, bool asText, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score || !score->selection().element()) return false;
    score->startCmd(TranslatableString::untranslatable("Add harp pedal diagram"));
    engraving::TextBase* item = score->addText(
        asText ? engraving::TextStyleType::HARP_PEDAL_TEXT_DIAGRAM : engraving::TextStyleType::HARP_PEDAL_DIAGRAM,
        score->selection().element());
    if (item && item->isHarpPedalDiagram()) {
        engraving::toHarpPedalDiagram(item)->setIsDiagram(!asText);
        score->select(item, engraving::SelectType::SINGLE, item->staffIdx());
    }
    score->endCmd();
    layoutLinked(score);
    return item != nullptr;
}

// {pedals: [7 × "flat"|"natural"|"sharp"], isDiagram} for the selected diagram, or {} for none.
EMSCRIPTEN_KEEPALIVE const uint8_t* getHarpPedalState(uintptr_t score_ptr, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return textResponse("Invalid score", 1);
    JsonObject result;
    if (auto* diagram = selectedHarpDiagram(score)) {
        static const char* names[] = { "flat", "natural", "sharp" };
        JsonArray pedals;
        for (auto position : diagram->getPedalState()) {
            const int i = static_cast<int>(position);
            pedals.append(String::fromAscii(i >= 0 && i <= 2 ? names[i] : "natural"));
        }
        result.set("pedals", pedals);
        result.set("isDiagram", diagram->isDiagram());
    }
    return response(JsonDocument(result).toJson(JsonDocument::Format::Compact));
}

// Sets the pedals (and, when given, diagram or text form) of the selected diagram as one undoable edit.
EMSCRIPTEN_KEEPALIVE bool setHarpPedalState(uintptr_t score_ptr, const char* json, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    auto* diagram = selectedHarpDiagram(score);
    if (!diagram) return false;
    const JsonObject o = JsonDocument::fromJson(ByteArray(json ? json : "{}")).rootObject();
    std::array<engraving::PedalPosition, engraving::HARP_STRING_NO> state = diagram->getPedalState();
    if (o.contains("pedals")) {
        const JsonArray pedals = o.value("pedals").toArray();
        if (pedals.size() != state.size()) return false;
        for (size_t i = 0; i < state.size(); ++i) {
            const String name = pedals.at(i).toString();
            if (name == u"flat") state[i] = engraving::PedalPosition::FLAT;
            else if (name == u"natural") state[i] = engraving::PedalPosition::NATURAL;
            else if (name == u"sharp") state[i] = engraving::PedalPosition::SHARP;
            else return false;
        }
    }
    score->startCmd(TranslatableString::untranslatable("Edit harp pedals"));
    if (o.contains("pedals")) diagram->undoChangePedalState(state);
    if (o.contains("isDiagram")) diagram->undoChangeProperty(engraving::Pid::HARP_IS_DIAGRAM, o.value("isDiagram").toBool());
    score->endCmd();
    layoutLinked(score);
    return true;
}

} // extern "C"
