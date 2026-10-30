// SPDX-License-Identifier: GPL-3.0-only
#pragma once
// MuseScore 4.7's Staff/System Text Properties dialog (StaffTextPropertiesDialog), which has one tab: swing
// settings. A staff or system text can start swing (eighth or sixteenth, at a ratio) or end it ("off") for playback.
#include "global/serialization/json.h"
#include "engraving/dom/stafftextbase.h"

static engraving::StaffTextBase* selectedStaffTextBase(Score* score)
{
    auto* element = score->selection().element();
    return element && element->isStaffTextBase() ? engraving::toStaffTextBase(element) : nullptr;
}

extern "C" {

// {system, swing, unit: "off"|"eighth"|"sixteenth", ratio} for the selected staff or system text, else {}.
EMSCRIPTEN_KEEPALIVE const uint8_t* getStaffTextSwing(uintptr_t score_ptr, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return textResponse("Invalid score", 1);
    JsonObject result;
    if (auto* st = selectedStaffTextBase(score)) {
        const int unit = st->swingParameters().swingUnit;
        result.set("system", st->systemFlag());
        result.set("swing", st->swing());
        result.set("unit", String::fromAscii(unit == engraving::Constants::DIVISION / 2 ? "eighth"
                                             : unit == engraving::Constants::DIVISION / 4 ? "sixteenth" : "off"));
        // A text that never set swing holds ratio 0; the dialog's spin box starts at MuseScore's 60%.
        result.set("ratio", st->swing() ? st->swingParameters().swingRatio : 60);
    }
    return response(JsonDocument(result).toJson(JsonDocument::Format::Compact));
}

// Sets the selected text's swing as one undoable edit, as the dialog does: a changed clone replaces the text, then
// the staves' swing maps and the playback are rebuilt. swing false clears it (MuseScore's unchecked group keeps the
// old setting; clearing is what unchecking means). Ratio is clamped to the dialog's 25–99%.
EMSCRIPTEN_KEEPALIVE bool setStaffTextSwing(uintptr_t score_ptr, const char* json, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    auto* origin = selectedStaffTextBase(score);
    if (!origin) return false;
    const JsonObject o = JsonDocument::fromJson(ByteArray(json ? json : "{}")).rootObject();
    const String unitName = o.value("unit").toString();
    int unit = 0;
    if (unitName == u"eighth") unit = engraving::Constants::DIVISION / 2;
    else if (unitName == u"sixteenth") unit = engraving::Constants::DIVISION / 4;
    else if (unitName != u"off" && !unitName.isEmpty()) return false;
    const int ratio = std::clamp(o.value("ratio").toInt(), 25, 99);

    auto* changed = engraving::toStaffTextBase(origin->clone());
    changed->setScore(score);
    changed->setSwing(o.value("swing").toBool());
    changed->setSwingParameters(unit, ratio);

    score->startCmd(TranslatableString::untranslatable("Edit staff text properties"));
    score->undoChangeElement(origin, changed);
    score->masterScore()->updateChannel();
    score->updateSwing();
    score->setPlaylistDirty();
    score->endCmd();
    score->select(changed, engraving::SelectType::SINGLE, changed->staffIdx());
    layoutLinked(score);
    return true;
}

} // extern "C"
