// SPDX-License-Identifier: GPL-3.0-only
#pragma once
// Score style access for the editor's Page Settings, Style and Load Style dialogs (MuseScore's
// PageSettings, EditStyle and "load-style"). Values are read and written by MuseScore's style key names
// (MStyle::valueName), raw as the engine stores them: page sizes and margins in inches, spatium in
// engine units (DPI 1200). Scalar types are offered, and the enum types the Style dialog's choices use, as their
// int values (MuseScore's own combo boxes hold those ints), points as [x, y], alignments as [horizontal, vertical]
// ints, and colours as "#RRGGBBAA"; anything else is unsupported.
#include "global/serialization/json.h"
#include "global/io/buffer.h"
#include "engraving/editing/editstyle.h"
#include "engraving/style/style.h"
#include "engraving/style/defaultstyle.h"
#include "engraving/style/textstyle.h"
#include "colortokens.h"

// Sets result[key] to the value as JSON; false, setting nothing, for a type the dialogs do not offer.
static bool setStyleJson(JsonObject& result, const std::string& key, const engraving::PropertyValue& value,
                         engraving::P_TYPE type)
{
    JsonValue out;
    switch (type) {
    case engraving::P_TYPE::BOOL: out = JsonValue(value.toBool()); break;
    case engraving::P_TYPE::INT: out = JsonValue(value.toInt()); break;
    case engraving::P_TYPE::REAL: out = JsonValue(value.toReal()); break;
    case engraving::P_TYPE::SPATIUM: out = JsonValue(value.value<engraving::Spatium>().val()); break;
    case engraving::P_TYPE::MILLIMETRE: out = JsonValue(value.value<engraving::Millimetre>().val()); break;
    case engraving::P_TYPE::STRING: out = JsonValue(value.value<String>()); break;
    // A point (the Style dialog's offsets, in sp) as [x, y].
    case engraving::P_TYPE::POINT: {
        const engraving::PointF p = value.value<engraving::PointF>();
        JsonArray xy;
        xy.append(p.x());
        xy.append(p.y());
        result.set(key, xy);
        return true;
    }
    case engraving::P_TYPE::ALIGN: {
        const engraving::Align a = value.value<engraving::Align>();
        JsonArray hv;
        hv.append(int(a.horizontal));
        hv.append(int(a.vertical));
        result.set(key, hv);
        return true;
    }
    case engraving::P_TYPE::COLOR: out = JsonValue(colorHex(value.value<Color>())); break;
    // Enums read as ints through PropertyValue's enum-to-int conversion.
    case engraving::P_TYPE::GLISS_STYLE: case engraving::P_TYPE::GLISS_TYPE: case engraving::P_TYPE::ALIGN_H:
    case engraving::P_TYPE::PLACEMENT_V: case engraving::P_TYPE::PLACEMENT_H: case engraving::P_TYPE::DIRECTION_V:
    case engraving::P_TYPE::DIRECTION_H: case engraving::P_TYPE::ORIENTATION: case engraving::P_TYPE::TIE_PLACEMENT:
    case engraving::P_TYPE::TIE_DOTS_PLACEMENT: case engraving::P_TYPE::TIMESIG_PLACEMENT:
    case engraving::P_TYPE::TIMESIG_STYLE: case engraving::P_TYPE::TIMESIG_MARGIN:
    case engraving::P_TYPE::NOTE_SPELLING_TYPE: case engraving::P_TYPE::LINE_TYPE:
    case engraving::P_TYPE::MEASURE_NUMBER_PLACEMENT: case engraving::P_TYPE::LH_TAPPING_SYMBOL:
    case engraving::P_TYPE::RH_TAPPING_SYMBOL:
        out = JsonValue(value.toInt()); break;
    default: return false;
    }
    result.set(key, out);
    return true;
}

// An enum style value from its int, typed as the style key stores it (MuseScore's PropertyValue::fromQVariant,
// which the Qt-free build does not have).
static bool styleEnumFromInt(engraving::P_TYPE type, int v, engraving::PropertyValue& out)
{
    using namespace engraving;
    switch (type) {
    case P_TYPE::GLISS_STYLE: out = PropertyValue(GlissandoStyle(v)); return true;
    case P_TYPE::GLISS_TYPE: out = PropertyValue(GlissandoType(v)); return true;
    case P_TYPE::ALIGN_H: out = PropertyValue(AlignH(v)); return true;
    case P_TYPE::PLACEMENT_V: out = PropertyValue(PlacementV(v)); return true;
    case P_TYPE::PLACEMENT_H: out = PropertyValue(PlacementH(v)); return true;
    case P_TYPE::DIRECTION_V: out = PropertyValue(DirectionV(v)); return true;
    case P_TYPE::DIRECTION_H: out = PropertyValue(DirectionH(v)); return true;
    case P_TYPE::ORIENTATION: out = PropertyValue(Orientation(v)); return true;
    case P_TYPE::TIE_PLACEMENT: out = PropertyValue(TiePlacement(v)); return true;
    case P_TYPE::TIE_DOTS_PLACEMENT: out = PropertyValue(TieDotsPlacement(v)); return true;
    case P_TYPE::TIMESIG_PLACEMENT: out = PropertyValue(TimeSigPlacement(v)); return true;
    case P_TYPE::TIMESIG_STYLE: out = PropertyValue(TimeSigStyle(v)); return true;
    case P_TYPE::TIMESIG_MARGIN: out = PropertyValue(TimeSigVSMargin(v)); return true;
    case P_TYPE::NOTE_SPELLING_TYPE: out = PropertyValue(NoteSpellingType(v)); return true;
    case P_TYPE::LINE_TYPE: out = PropertyValue(LineType(v)); return true;
    case P_TYPE::MEASURE_NUMBER_PLACEMENT: out = PropertyValue(MeasureNumberPlacement(v)); return true;
    case P_TYPE::LH_TAPPING_SYMBOL: out = PropertyValue(LHTappingSymbol(v)); return true;
    case P_TYPE::RH_TAPPING_SYMBOL: out = PropertyValue(RHTappingSymbol(v)); return true;
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
    case engraving::P_TYPE::POINT: {
        if (!json.isArray()) return false;
        const JsonArray xy = json.toArray();
        if (xy.size() != 2 || !xy.at(0).isNumber() || !xy.at(1).isNumber()) return false;
        out = engraving::PropertyValue(engraving::PointF(xy.at(0).toDouble(), xy.at(1).toDouble()));
        return true;
    }
    case engraving::P_TYPE::ALIGN: {
        if (!json.isArray()) return false;
        const JsonArray hv = json.toArray();
        if (hv.size() != 2 || !hv.at(0).isNumber() || !hv.at(1).isNumber()) return false;
        const int h = hv.at(0).toInt(), v = hv.at(1).toInt();
        if (h < 0 || h > 3 || v < 0 || v > 3) return false;
        out = engraving::PropertyValue(engraving::Align(engraving::AlignH(h), engraving::AlignV(v)));
        return true;
    }
    case engraving::P_TYPE::COLOR: {
        Color c;
        if (!json.isString() || !colorFromHex(json.toString(), c)) return false;
        out = engraving::PropertyValue::fromValue(c);
        return true;
    }
    default: return json.isNumber() && styleEnumFromInt(type, json.toInt(), out);
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
        setStyleJson(result, name.toStdString(), score->style().styleV(sid), engraving::MStyle::valueType(sid));
    }
    return response(JsonDocument(result).toJson(JsonDocument::Format::Compact));
}

// {"<key>": default, ...}: MuseScore's default for each named key (DefaultStyle), for the Style dialog's reset
// buttons. Unknown or unsupported keys are left out, as in getStyleValues.
EMSCRIPTEN_KEEPALIVE const uint8_t* getStyleDefaults(uintptr_t score_ptr, const char* keysJson, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return textResponse("Invalid score", 1);
    const JsonArray keys = JsonDocument::fromJson(ByteArray(keysJson ? keysJson : "[]")).rootArray();
    const engraving::MStyle& defaults = engraving::DefaultStyle::defaultStyle();
    JsonObject result;
    for (size_t i = 0; i < keys.size(); ++i) {
        const String name = keys.at(i).toString();
        const engraving::Sid sid = engraving::MStyle::styleIdx(name);
        if (sid == engraving::Sid::NOSTYLE) continue;
        setStyleJson(result, name.toStdString(), defaults.styleV(sid), engraving::MStyle::valueType(sid));
    }
    return response(JsonDocument(result).toJson(JsonDocument::Format::Compact));
}

// MuseScore's Text styles page (EditStyle's textStyles list, editableTextStyles()): each style's display name and
// its style keys by property, [{name, type, keys: {fontFace: "titleFontFace", …}}]; type is the MSCX token the
// element property "style" uses. Properties a style does not have, or
// keeps in a placeholder key ("dummy…"), are left out.
EMSCRIPTEN_KEEPALIVE const uint8_t* getTextStyleCatalog(uintptr_t score_ptr, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return textResponse("Invalid score", 1);
    using P = engraving::TextStylePropertyType;
    static const std::pair<P, const char*> names[] = {
        { P::FontFace, "fontFace" }, { P::FontSize, "fontSize" }, { P::LineSpacing, "lineSpacing" },
        { P::SizeSpatiumDependent, "sizeSpatiumDependent" }, { P::FontStyle, "fontStyle" }, { P::Color, "color" },
        { P::TextAlign, "align" }, { P::Offset, "offset" }, { P::FrameType, "frameType" },
        { P::FramePadding, "framePadding" }, { P::FrameWidth, "frameWidth" }, { P::FrameRound, "frameRound" },
        { P::FrameBorderColor, "frameBorderColor" }, { P::FrameFillColor, "frameFillColor" },
        { P::MusicalSymbolsScale, "musicalSymbolsScale" }, { P::MusicalSymbolsSize, "musicalSymbolsSize" },
        { P::Position, "position" },
    };
    JsonArray styles;
    for (engraving::TextStyleType tid : engraving::editableTextStyles()) {
        const engraving::TextStyle* ts = engraving::textStyle(tid);
        if (!ts) continue;
        JsonObject keys;
        for (const auto& prop : *ts) {
            if (prop.type == P::Undefined || prop.sid == engraving::Sid::NOSTYLE) continue;   // an unused slot
            const String key = String::fromAscii(engraving::MStyle::valueName(prop.sid));
            if (key.startsWith(u"dummy")) continue;
            for (const auto& [type, name] : names) {
                if (type == prop.type) keys.set(name, key);
            }
        }
        JsonObject entry;
        entry.set("name", score->getTextStyleUserName(tid).str);
        entry.set("type", String::fromAscii(engraving::TConv::toXml(tid).ascii()));
        entry.set("keys", keys);
        styles.append(entry);
    }
    return response(JsonDocument(styles).toJson(JsonDocument::Format::Compact));
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
// The score's style as a MuseScore style file (.mss: MStyle::write, every value but spatium), as File > Save Style
// writes it. Roadmap E23: the editor carries it across a MusicXML re-import (an applied AI edit), which keeps only the
// few values MusicXML has.
EMSCRIPTEN_KEEPALIVE const uint8_t* saveStyle(uintptr_t score_ptr, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return textResponse("Invalid score or excerpt", 1);
    ByteArray bytes;
    muse::io::Buffer buffer(&bytes);
    if (!buffer.open(muse::io::IODevice::WriteOnly)) return textResponse("Could not write style", 1);
    engraving::MStyle style = score->style();
    style.write(&buffer);
    buffer.close();
    return response(bytes);
}

// A style saved by saveStyle put back as part of loading the score, not as an edit: no undo step, so undo after an
// applied AI edit does not take the score's style away (roadmap E23). Spatium stays what the score has.
EMSCRIPTEN_KEEPALIVE bool restoreStyle(uintptr_t score_ptr, const uint8_t* data, uint32_t size, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score || !data || size == 0) return false;
    engraving::MStyle style = score->style();
    ByteArray bytes(reinterpret_cast<const char*>(data), size);
    muse::io::Buffer buffer(&bytes);
    if (!buffer.open(muse::io::IODevice::ReadOnly) || !style.read(&buffer)) return false;
    score->setStyle(style);
    score->setLayoutAll();
    layoutLinked(score);
    return true;
}

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
