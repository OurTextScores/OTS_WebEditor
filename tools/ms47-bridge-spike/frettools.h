#pragma once
// Fret diagrams: insert from a string pattern, read the selected diagram as JSON, replace it from JSON.
// Ported from the 4.00 bridge (web/main.cpp); Qt JSON is replaced by muse JsonDocument with the same schema and limits.

#include <cmath>
#include <set>

#include "global/serialization/json.h"
#include "engraving/dom/factory.h"
#include "engraving/dom/fret.h"
#include "engraving/dom/segment.h"

static engraving::FretDiagram* selectedFretDiagram(MasterScore* score)
{
    engraving::FretDiagram* selected = nullptr;
    for (auto* item : selectedInspectorTargets(score)) {
        if (item->isFretDiagram()) {
            if (selected) return nullptr;
            selected = engraving::toFretDiagram(item);
        }
    }
    if (selected) return selected;
    auto* chordRest = score->selection().cr();
    if (!chordRest) chordRest = score->selection().firstChordRest();
    if (!chordRest || !chordRest->segment()) return nullptr;
    const auto track = engraving::trackZeroVoice(chordRest->track());
    for (auto* annotation : chordRest->segment()->annotations()) {
        if (annotation && annotation->isFretDiagram() && annotation->track() == track) {
            if (selected) return nullptr;
            selected = engraving::toFretDiagram(annotation);
        }
    }
    return selected;
}

static JsonObject fretDiagramJson(const engraving::FretDiagram& diagram)
{
    JsonObject result;
    result.set("strings", diagram.strings());
    result.set("frets", diagram.frets());
    result.set("fretOffset", diagram.fretOffset());
    result.set("showNut", diagram.showNut());
    JsonArray dots;
    for (const auto& [string, stringDots] : diagram.dots()) {
        for (const auto& dot : stringDots) {
            if (!dot.exists()) continue;
            JsonObject item;
            item.set("string", string);
            item.set("fret", dot.fret);
            item.set("type", static_cast<int>(dot.dtype));
            dots.append(item);
        }
    }
    result.set("dots", dots);
    JsonArray markers;
    for (const auto& [string, marker] : diagram.markers()) {
        if (!marker.exists()) continue;
        JsonObject item;
        item.set("string", string);
        item.set("type", static_cast<int>(marker.mtype));
        markers.append(item);
    }
    result.set("markers", markers);
    JsonArray barres;
    for (const auto& [fret, barre] : diagram.barres()) {
        if (!barre.exists()) continue;
        JsonObject item;
        item.set("fret", fret);
        item.set("startString", barre.startString);
        item.set("endString", barre.endString);
        barres.append(item);
    }
    result.set("barres", barres);
    return result;
}

static bool fretJsonInt(const JsonObject& object, const char* name, int minimum, int maximum, int& result)
{
    const JsonValue value = object.value(name);
    if (!value.isNumber()) return false;
    const double numeric = value.toDouble();
    if (!std::isfinite(numeric) || std::floor(numeric) != numeric || numeric < minimum || numeric > maximum) return false;
    result = static_cast<int>(numeric);
    return true;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE const uint8_t* getSelectedFretDiagram(uintptr_t score_ptr, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return textResponse("Invalid score", 1);
    auto* diagram = selectedFretDiagram(score);
    if (!diagram) return textResponse("null");
    return response(JsonDocument(fretDiagramJson(*diagram)).toJson(JsonDocument::Format::Compact));
}

EMSCRIPTEN_KEEPALIVE bool setSelectedFretDiagram(uintptr_t score_ptr, const char* serializedDiagram, int excerptId)
{
    if (!serializedDiagram) return false;
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    auto* diagram = selectedFretDiagram(score);
    if (!diagram) return false;
    std::string parseError;
    const JsonDocument document = JsonDocument::fromJson(ByteArray(serializedDiagram), &parseError);
    if (!parseError.empty() || !document.isObject()) return false;
    const JsonObject object = document.rootObject();
    int strings = 0;
    int frets = 0;
    int fretOffset = 0;
    if (!fretJsonInt(object, "strings", 4, 12, strings)
        || !fretJsonInt(object, "frets", 1, 12, frets)
        || !fretJsonInt(object, "fretOffset", 0, 20, fretOffset)
        || !object.value("showNut").isBool()
        || !object.value("dots").isArray()
        || !object.value("markers").isArray()
        || !object.value("barres").isArray()) {
        return false;
    }
    const bool showNut = object.value("showNut").toBool();
    struct DotInput { int string; int fret; int type; };
    struct MarkerInput { int string; int type; };
    struct BarreInput { int fret; int startString; };
    std::vector<DotInput> dots;
    std::vector<MarkerInput> markers;
    std::vector<BarreInput> barres;
    std::set<std::pair<int, int> > occupiedDots;
    std::set<int> occupiedMarkers;
    const JsonArray dotValues = object.value("dots").toArray();
    for (size_t i = 0; i < dotValues.size(); ++i) {
        const JsonValue value = dotValues.at(i);
        if (!value.isObject() || dots.size() >= 96) return false;
        const JsonObject item = value.toObject();
        DotInput dot {};
        if (!fretJsonInt(item, "string", 0, strings - 1, dot.string)
            || !fretJsonInt(item, "fret", 1, frets, dot.fret)
            || !fretJsonInt(item, "type", 0, 3, dot.type)
            || !occupiedDots.insert({ dot.string, dot.fret }).second) return false;
        dots.push_back(dot);
    }
    const JsonArray markerValues = object.value("markers").toArray();
    for (size_t i = 0; i < markerValues.size(); ++i) {
        const JsonValue value = markerValues.at(i);
        if (!value.isObject() || markers.size() >= 12) return false;
        const JsonObject item = value.toObject();
        MarkerInput marker {};
        if (!fretJsonInt(item, "string", 0, strings - 1, marker.string)
            || !fretJsonInt(item, "type", 1, 2, marker.type)
            || !occupiedMarkers.insert(marker.string).second) return false;
        markers.push_back(marker);
    }
    const JsonArray barreValues = object.value("barres").toArray();
    for (size_t i = 0; i < barreValues.size(); ++i) {
        const JsonValue value = barreValues.at(i);
        if (!value.isObject() || barres.size() >= 12) return false;
        const JsonObject item = value.toObject();
        BarreInput barre {};
        int endString = 0;
        if (!fretJsonInt(item, "fret", 1, frets, barre.fret)
            || !fretJsonInt(item, "startString", 0, strings - 1, barre.startString)
            || !fretJsonInt(item, "endString", -1, strings - 1, endString)
            || endString != -1) return false;
        barres.push_back(barre);
    }
    score->startCmd(TranslatableString::untranslatable("setSelectedFretDiagram"));
    // 4.7's FretDiagram::clear() also resets the fret offset (4.00's did not), so clear before setting properties.
    // FretClear's undo data restores the whole diagram, offset included.
    diagram->undoFretClear();
    if (diagram->strings() != strings) diagram->undoChangeProperty(engraving::Pid::FRET_STRINGS, strings, engraving::PropertyFlags::UNSTYLED);
    if (diagram->frets() != frets) diagram->undoChangeProperty(engraving::Pid::FRET_FRETS, frets, engraving::PropertyFlags::UNSTYLED);
    if (diagram->fretOffset() != fretOffset) diagram->undoChangeProperty(engraving::Pid::FRET_OFFSET, fretOffset, engraving::PropertyFlags::UNSTYLED);
    if (diagram->showNut() != showNut) diagram->undoChangeProperty(engraving::Pid::FRET_NUT, showNut, engraving::PropertyFlags::UNSTYLED);
    for (const auto& dot : dots) {
        diagram->undoSetFretDot(dot.string, dot.fret, true, static_cast<engraving::FretDotType>(dot.type));
    }
    for (const auto& marker : markers) {
        diagram->undoSetFretMarker(marker.string, static_cast<engraving::FretMarkerType>(marker.type));
    }
    for (const auto& barre : barres) {
        diagram->undoSetFretBarre(barre.startString, barre.fret, false);
    }
    score->endCmd();
    score->doLayout();
    return true;
}

EMSCRIPTEN_KEEPALIVE bool addFretDiagram(uintptr_t score_ptr, const char* pattern, int excerptId)
{
    if (!pattern) return false;
    const std::string value(pattern);
    if (value.size() < 4 || value.size() > 12) return false;
    int maximumFret = 0;
    for (const char c : value) {
        if (c != 'X' && c != '0' && c != '.' && (c < '1' || c > '9')) return false;
        if (c >= '1' && c <= '9') maximumFret = std::max(maximumFret, c - '0');
    }
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    auto* chordRest = score->selection().cr();
    if (!chordRest) chordRest = score->selection().firstChordRest();
    if (!chordRest || !chordRest->segment()) return false;
    auto* segment = chordRest->segment();
    const auto track = engraving::trackZeroVoice(chordRest->track());
    for (auto* annotation : segment->annotations()) {
        if (annotation && annotation->isFretDiagram() && annotation->track() == track) return false;
    }
    auto* diagram = engraving::Factory::createFretDiagram(segment);
    if (!diagram) return false;
    diagram->setParent(segment);
    diagram->setTrack(chordRest->track());
    diagram->init(nullptr, chordRest->isChord() ? engraving::toChord(chordRest) : nullptr);
    diagram->setStrings(static_cast<int>(value.size()));
    diagram->setFrets(std::max(4, maximumFret));
    diagram->setPropertyFlags(engraving::Pid::FRET_STRINGS, engraving::PropertyFlags::UNSTYLED);
    diagram->setPropertyFlags(engraving::Pid::FRET_FRETS, engraving::PropertyFlags::UNSTYLED);
    for (size_t string = 0; string < value.size(); ++string) {
        const char c = value[string];
        if (c == 'X') diagram->setMarker(static_cast<int>(string), engraving::FretMarkerType::CROSS);
        else if (c == '0') diagram->setMarker(static_cast<int>(string), engraving::FretMarkerType::CIRCLE);
        else if (c >= '1' && c <= '9') diagram->setDot(static_cast<int>(string), c - '0', true);
    }
    score->startCmd(TranslatableString::untranslatable("addFretDiagram"));
    score->undoAddElement(diagram);
    score->endCmd();
    score->select(diagram, engraving::SelectType::SINGLE, diagram->staffIdx());
    score->doLayout();
    return true;
}

} // extern "C"
