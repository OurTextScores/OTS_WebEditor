#pragma once
#include "engraving/dom/accidental.h"
#include "engraving/dom/articulation.h"
#include "engraving/dom/breath.h"
#include "engraving/dom/chord.h"
#include "engraving/dom/dynamic.h"
#include "engraving/dom/factory.h"
#include "engraving/dom/fermata.h"
#include "engraving/dom/fingering.h"
#include "engraving/dom/note.h"
#include "engraving/dom/pitchspelling.h"
#include "engraving/dom/segment.h"
#include "engraving/editing/editdata.h"
#include "engraving/types/symnames.h"
#include "engraving/types/typesconv.h"
// Performer mode, Phase 7a: a rehearsal's stamps engraved into the score. One primitive, addElementsAt, adds a list of
// marks at musical positions (staff, tick, and the stamp's height for choosing a note and a side) in one undoable
// command, so the editor does not rebuild placement in TypeScript (the bridge design rule).
//
// Input (JSON array): { "kind": "dynamic"|"fingering"|"articulation"|"fermata"|"breath"|"accidental",
//   "subtype": <dynamic type text "mf", digit "3", or a SMuFL name "stringsUpBow">, "staff": <staff index in the score
//   or part>, "tick": <written tick>, "y": <staff spaces below the top staff line; negative is above> }.
// Output (JSON array, same order): { "ok": true } or { "ok": false, "reason": "..." }.

namespace performermarks {

using namespace mu::engraving;

static ChordRest* chordRestAt(Score* score, int staff, int tick)
{
    if (staff < 0 || staff >= int(score->nstaves())) return nullptr;
    Segment* segment = score->tick2segment(Fraction::fromTicks(tick), true, SegmentType::ChordRest);
    if (!segment) return nullptr;
    for (int voice = 0; voice < int(VOICES); ++voice) {
        EngravingItem* item = segment->element(staff * VOICES + voice);
        if (item && item->isChordRest()) return toChordRest(item);
    }
    return nullptr;
}

/** The note of a chord whose notehead is nearest the stamp's height (staff spaces from the top line). */
static Note* noteNearest(ChordRest* chordRest, double y)
{
    if (!chordRest || !chordRest->isChord()) return nullptr;
    Note* best = nullptr;
    double distance = 1e9;
    for (Note* note : toChord(chordRest)->notes()) {
        const double away = std::abs(note->line() * 0.5 - y);
        if (away < distance) {
            distance = away;
            best = note;
        }
    }
    return best;
}

static bool dynamicTypeOf(const String& text, DynamicType& out)
{
    for (int i = 0; i < int(DynamicType::LAST); ++i) {
        const DynamicType type = DynamicType(i);
        if (type == DynamicType::OTHER) continue;
        if (String::fromAscii(TConv::toXml(type).ascii()) == text) {
            out = type;
            return true;
        }
    }
    return false;
}

static void drop(EngravingItem* target, EngravingItem* element)
{
    EditData editData;
    editData.dropElement = element;
    target->drop(editData);
}

static String add(Score* score, const JsonObject& mark)
{
    const std::string kind = mark.value("kind").toString().toStdString();
    const String subtype = mark.value("subtype").toString();
    const double y = mark.value("y").toDouble();
    const bool above = y < 2.0; // above the middle line
    ChordRest* chordRest = chordRestAt(score, mark.value("staff").toInt(), mark.value("tick").toInt());
    if (!chordRest) return u"no note or rest at that beat";

    if (kind == "dynamic") {
        DynamicType type;
        if (!dynamicTypeOf(subtype, type)) return u"unknown dynamic";
        Dynamic* dynamic = Factory::createDynamic(score->dummy()->segment());
        dynamic->setDynamicType(type);
        dynamic->setXmlText(Dynamic::dynamicText(type));
        drop(chordRest, dynamic);
        if (above) dynamic->undoChangeProperty(Pid::PLACEMENT, PlacementV::ABOVE);
        return u"";
    }
    if (kind == "fermata") {
        Fermata* fermata = Factory::createFermata(score->dummy()->segment());
        fermata->setSymId(above ? SymId::fermataAbove : SymId::fermataBelow);
        drop(chordRest, fermata);
        return u"";
    }
    if (kind == "breath") {
        const SymId wanted = SymNames::symIdByName(AsciiStringView(subtype.toStdString()), SymId::noSym);
        for (const BreathType& type : Breath::BREATH_LIST) {
            if (type.id != wanted) continue;
            Breath* breath = Factory::createBreath(score->dummy()->segment());
            breath->setSymId(type.id);
            breath->setPause(type.pause);
            drop(chordRest, breath);
            return u"";
        }
        return u"unknown breath mark";
    }
    if (kind == "articulation") {
        if (!chordRest->isChord()) return u"articulations go on notes";
        const SymId symbol = SymNames::symIdByName(AsciiStringView(subtype.toStdString()), SymId::noSym);
        if (symbol == SymId::noSym) return u"unknown articulation";
        if (toChord(chordRest)->articulationSymbolIds().count(symbol)) return u"already there";
        Articulation* articulation = Factory::createArticulation(chordRest);
        articulation->setSymId(symbol);
        drop(chordRest, articulation);
        return u"";
    }
    Note* note = noteNearest(chordRest, y);
    if (!note) return u"no note at that beat";
    if (kind == "fingering") {
        Fingering* fingering = Factory::createFingering(note);
        fingering->setXmlText(subtype);
        drop(note, fingering);
        fingering->undoChangeProperty(Pid::PLACEMENT, y < note->line() * 0.5 ? PlacementV::ABOVE : PlacementV::BELOW);
        return u"";
    }
    if (kind == "accidental") {
        // A courtesy accidental, only when the stamp's sign is the note's own (otherwise it is a reminder)
        static const std::map<std::string, AccidentalType> signs = {
            { "accidentalSharp", AccidentalType::SHARP },
            { "accidentalFlat", AccidentalType::FLAT },
            { "accidentalNatural", AccidentalType::NATURAL },
        };
        const auto sign = signs.find(subtype.toStdString());
        if (sign == signs.end()) return u"unknown accidental";
        if (Accidental::value2subtype(tpc2alter(note->tpc())) != sign->second
            && !(sign->second == AccidentalType::NATURAL && tpc2alter(note->tpc()) == AccidentalVal::NATURAL)) {
            return u"the note is not spelled with that sign";
        }
        if (note->accidental() && note->accidental()->role() == AccidentalRole::USER) return u"already there";
        Accidental* accidental = Factory::createAccidental(note);
        accidental->setAccidentalType(sign->second);
        accidental->setRole(AccidentalRole::USER);
        accidental->setBracket(AccidentalBracket::PARENTHESIS);
        accidental->setParent(note);
        score->undoAddElement(accidental);
        return u"";
    }
    return u"not something to engrave";
}

} // namespace performermarks

extern "C" {

EMSCRIPTEN_KEEPALIVE const uint8_t* addElementsAt(uintptr_t id, const char* data, uint32_t size, int excerpt)
{
    auto* score = getScore(id, excerpt);
    if (!score) return textResponse("Invalid score or excerpt", 1);
    const auto document = JsonDocument::fromJson(ByteArray(data ? data : "", data ? size : 0));
    if (!document.isArray()) return textResponse("Expected a list of marks", 1);
    const JsonArray marks = document.rootArray();
    JsonArray results;
    score->startCmd(TranslatableString::untranslatable("Engrave rehearsal marks"));
    for (size_t i = 0; i < marks.size(); ++i) {
        const String reason = performermarks::add(score, marks.at(i).toObject());
        JsonObject result;
        result.set("ok", reason.isEmpty());
        if (!reason.isEmpty()) result.set("reason", reason);
        results.append(result);
    }
    score->endCmd();
    layoutLinked(score);
    const JsonDocument out(results);
    return response(out.toJson(JsonDocument::Format::Compact));
}

}
