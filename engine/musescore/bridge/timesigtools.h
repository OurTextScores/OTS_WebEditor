// SPDX-License-Identifier: GPL-3.0-only
#pragma once
// MuseScore's Time Signature Properties dialog (TimeSigPropertiesDialog): appearance, custom numerator and
// denominator text, courtesy, and the beam groups. Beam groups travel as one digit per note for each row (eighths,
// sixteenths, thirty-seconds), as Groups encodes them: 0 beamed to the previous note, 1 a new beam, 2 a new
// sixteenth sub-beam, 3 a new thirty-second sub-beam. A row's first digit has no effect: a bar always starts a beam.
#include "global/serialization/json.h"
#include "engraving/dom/groups.h"
#include "engraving/dom/timesig.h"

static engraving::TimeSig* selectedTimeSig(Score* score)
{
    auto* element = score->selection().element();
    return element && element->isTimeSig() ? engraving::toTimeSig(element) : nullptr;
}

// Rows of the beam-group editor: grid step in 32nds, and the action's bit shift in a GroupNode.
static constexpr struct { const char* key; int step; int shift; } kBeamRows[] = {
    { "eighth", 4, 0 }, { "sixteenth", 2, 4 }, { "thirtySecond", 1, 8 },
};

static JsonObject beamRowsOf(const engraving::Groups& groups, const engraving::Fraction& sig)
{
    const int thirtySeconds = sig.ticks() / (engraving::Constants::DIVISION / 8);
    JsonObject rows;
    for (const auto& row : kBeamRows) {
        std::string digits;
        for (int pos = 0; pos + row.step <= thirtySeconds; pos += row.step) {
            int action = 0;
            for (const auto& node : groups.nodes()) {
                if (node.pos == pos) action = (node.action >> row.shift) & 0xf;
            }
            digits.push_back(static_cast<char>('0' + std::min(action, 3)));
        }
        rows.set(row.key, String::fromStdString(digits));
    }
    return rows;
}

static engraving::GroupNodes beamNodesOf(const JsonObject& rows, const engraving::Fraction& sig)
{
    const int thirtySeconds = sig.ticks() / (engraving::Constants::DIVISION / 8);
    std::map<int, int> actions;
    for (const auto& row : kBeamRows) {
        const std::string digits = rows.value(row.key).toString().toStdString();
        for (size_t k = 0; k < digits.size(); ++k) {
            const int pos = static_cast<int>(k) * row.step;
            const int action = digits[k] - '0';
            if (pos >= thirtySeconds || action <= 0 || action > 3) continue;
            actions[pos] |= action << row.shift;
        }
    }
    engraving::GroupNodes nodes;
    for (const auto& [pos, action] : actions) nodes.push_back({ pos, action });
    return nodes;
}

static const char* const kTimeSigTypes[] = { "normal", "common", "cut", "cutBach", "cutTriple" };

extern "C" {

// The selected time signature's dialog values, or {} when none is selected.
EMSCRIPTEN_KEEPALIVE const uint8_t* getTimeSigProperties(uintptr_t score_ptr, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return textResponse("Invalid score", 1);
    JsonObject result;
    if (auto* ts = selectedTimeSig(score)) {
        const int type = static_cast<int>(ts->timeSigType());
        result.set("type", String::fromAscii(type >= 0 && type <= 4 ? kTimeSigTypes[type] : "normal"));
        result.set("numerator", ts->sig().numerator());
        result.set("denominator", ts->sig().denominator());
        result.set("numeratorText", ts->numeratorString());
        result.set("denominatorText", ts->denominatorString());
        result.set("showCourtesy", ts->showCourtesySig());
        const engraving::Groups& defaults = engraving::Groups::endings(ts->sig());
        result.set("groups", beamRowsOf(ts->groups().empty() ? defaults : ts->groups(), ts->sig()));
        result.set("defaultGroups", beamRowsOf(defaults, ts->sig()));
    }
    return response(JsonDocument(result).toJson(JsonDocument::Format::Compact));
}

// Applies the given values to the selected time signature and its partners on the other staves (same tick and
// signature), as one undoable edit. groups: the rows as above, or "default" to fall back to MuseScore's defaults.
EMSCRIPTEN_KEEPALIVE bool setTimeSigProperties(uintptr_t score_ptr, const char* json, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    auto* selected = selectedTimeSig(score);
    if (!selected || !selected->segment()) return false;
    const JsonObject o = JsonDocument::fromJson(ByteArray(json ? json : "{}")).rootObject();

    int type = -1;
    if (o.contains("type")) {
        const String name = o.value("type").toString();
        for (int i = 0; i < 5; ++i) {
            if (name == String::fromAscii(kTimeSigTypes[i])) type = i;
        }
        if (type < 0) return false;
    }

    std::vector<engraving::TimeSig*> targets;
    for (engraving::staff_idx_t staff = 0; staff < score->nstaves(); ++staff) {
        auto* item = selected->segment()->element(staff * engraving::VOICES);
        if (item && item->isTimeSig() && engraving::toTimeSig(item)->sig().identical(selected->sig())) {
            targets.push_back(engraving::toTimeSig(item));
        }
    }

    score->startCmd(TranslatableString::untranslatable("Edit time signature properties"));
    for (auto* ts : targets) {
        if (type >= 0) ts->undoChangeProperty(engraving::Pid::TIMESIG_TYPE, type);
        if (o.contains("numeratorText")) ts->undoChangeProperty(engraving::Pid::NUMERATOR_STRING, o.value("numeratorText").toString());
        if (o.contains("denominatorText")) ts->undoChangeProperty(engraving::Pid::DENOMINATOR_STRING, o.value("denominatorText").toString());
        if (o.contains("showCourtesy")) ts->undoChangeProperty(engraving::Pid::SHOW_COURTESY, o.value("showCourtesy").toBool());
        if (o.contains("groups")) {
            const JsonValue groups = o.value("groups");
            const engraving::GroupNodes nodes = groups.isString() ? engraving::GroupNodes() : beamNodesOf(groups.toObject(), ts->sig());
            ts->undoChangeProperty(engraving::Pid::GROUP_NODES, nodes);
        }
    }
    score->setLayoutAll();
    score->endCmd();
    layoutLinked(score);
    return true;
}

} // extern "C"
