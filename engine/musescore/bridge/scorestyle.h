// SPDX-License-Identifier: GPL-3.0-only
#pragma once
// Score style access for the editor's Page Settings, Style and Load Style dialogs (MuseScore's
// PageSettings, EditStyle and "load-style"). Values are read and written by MuseScore's style key names
// (MStyle::valueName), raw as the engine stores them: page sizes and margins in inches, spatium in
// engine units (DPI 1200). Only scalar types are offered; anything else is reported as unsupported.
#include "global/serialization/json.h"
#include "global/io/buffer.h"
#include "engraving/editing/editstyle.h"
#include "engraving/style/style.h"

static bool styleValueToJson(const engraving::PropertyValue& value, engraving::P_TYPE type, JsonValue& out)
{
    switch (type) {
    case engraving::P_TYPE::BOOL: out = JsonValue(value.toBool()); return true;
    case engraving::P_TYPE::INT: out = JsonValue(value.toInt()); return true;
    case engraving::P_TYPE::REAL: out = JsonValue(value.toReal()); return true;
    case engraving::P_TYPE::SPATIUM: out = JsonValue(value.value<engraving::Spatium>().val()); return true;
    case engraving::P_TYPE::MILLIMETRE: out = JsonValue(value.value<engraving::Millimetre>().val()); return true;
    case engraving::P_TYPE::STRING: out = JsonValue(value.value<String>()); return true;
    default: return false;
    }
}

static bool styleValueFromJson(const JsonValue& json, engraving::P_TYPE type, engraving::PropertyValue& out)
{
    switch (type) {
    case engraving::P_TYPE::BOOL: if (!json.isBool()) return false; out = json.toBool(); return true;
    case engraving::P_TYPE::INT: if (!json.isNumber()) return false; out = json.toInt(); return true;
    case engraving::P_TYPE::REAL: if (!json.isNumber()) return false; out = json.toDouble(); return true;
    case engraving::P_TYPE::SPATIUM:
        if (!json.isNumber()) return false; out = engraving::Spatium(json.toDouble()); return true;
    case engraving::P_TYPE::MILLIMETRE:
        if (!json.isNumber()) return false; out = engraving::Millimetre(json.toDouble()); return true;
    case engraving::P_TYPE::STRING: if (!json.isString()) return false; out = json.toString(); return true;
    default: return false;
    }
}

extern "C" {

// {"<key>": value, ...} for the named keys; unknown or non-scalar keys are left out.
EMSCRIPTEN_KEEPALIVE const uint8_t* getStyleValues(uintptr_t score_ptr, const char* keysJson, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return textResponse("Invalid score", 1);
    const JsonArray keys = JsonDocument::fromJson(ByteArray(keysJson ? keysJson : "[]")).rootArray();
    JsonObject result;
    for (size_t i = 0; i < keys.size(); ++i) {
        const String name = keys.at(i).toString();
        const engraving::Sid sid = engraving::MStyle::styleIdx(name);
        if (sid == engraving::Sid::NOSTYLE) continue;
        JsonValue value;
        if (styleValueToJson(score->style().styleV(sid), engraving::MStyle::valueType(sid), value)) {
            result.set(name.toStdString(), value);
        }
    }
    return response(JsonDocument(result).toJson(JsonDocument::Format::Compact));
}

// Sets the given keys as one undoable edit. False, changing nothing, if any key is unknown or mistyped.
EMSCRIPTEN_KEEPALIVE bool setStyleValues(uintptr_t score_ptr, const char* valuesJson, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    const JsonObject values = JsonDocument::fromJson(ByteArray(valuesJson ? valuesJson : "{}")).rootObject();
    std::unordered_map<engraving::Sid, engraving::PropertyValue> changes;
    for (const std::string& key : values.keys()) {
        const engraving::Sid sid = engraving::MStyle::styleIdx(String::fromStdString(key));
        if (sid == engraving::Sid::NOSTYLE) return false;
        engraving::PropertyValue value;
        if (!styleValueFromJson(values.value(key), engraving::MStyle::valueType(sid), value)) return false;
        if (score->style().styleV(sid) != value) changes.emplace(sid, value);
    }
    if (changes.empty()) return true;
    score->startCmd(TranslatableString::untranslatable("Edit style"));
    score->undoChangeStyleValues(std::move(changes));
    score->endCmd();
    layoutLinked(score);
    return true;
}

// MuseScore's Load style: a .mss file replaces the score's style, as one undoable edit.
EMSCRIPTEN_KEEPALIVE bool loadStyle(uintptr_t score_ptr, const uint8_t* data, uint32_t size, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score || !data || size == 0) return false;
    engraving::MStyle style = score->style();
    ByteArray bytes(reinterpret_cast<const char*>(data), size);
    muse::io::Buffer buffer(&bytes);
    if (!buffer.open(muse::io::IODevice::ReadOnly) || !style.read(&buffer)) return false;
    score->startCmd(TranslatableString::untranslatable("Load style"));
    score->undo(new engraving::ChangeStyle(score, style));
    score->endCmd();
    layoutLinked(score);
    return true;
}

} // extern "C"
