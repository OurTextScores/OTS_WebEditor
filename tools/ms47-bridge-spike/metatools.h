#pragma once
// Score metadata exports: element/event positions (the 4.00 webmscore JSON format), score metadata JSON and the
// load profile. Ported from the 4.00 bridge (web/importexport/positionjsonwriter.cpp, converter NotationMeta) with
// muse JSON in place of Qt JSON. Metadata omits desktop-only "tracks" (project audio settings), as 4.00 did.

#include <cmath>
#include <unordered_map>

#include "global/serialization/json.h"
#include "engraving/dom/lyrics.h"
#include "engraving/dom/measure.h"
#include "engraving/dom/page.h"
#include "engraving/dom/part.h"
#include "engraving/dom/repeatlist.h"
#include "engraving/dom/segment.h"
#include "engraving/dom/system.h"
#include "engraving/dom/tempotext.h"
#include "engraving/dom/text.h"
#include "engraving/dom/timesig.h"

static void positionElement(JsonArray& elements, int id, double x, double y, double sx, double sy, size_t page)
{
    JsonObject el;
    el.set("id", id);
    el.set("x", toAbi(x));
    el.set("y", toAbi(y));
    el.set("sx", toAbi(sx));
    el.set("sy", toAbi(sy));
    el.set("page", static_cast<int>(page));
    elements.append(el);
}

static void positionEvent(JsonArray& events, int id, int time)
{
    JsonObject ev;
    ev.set("elid", id);
    ev.set("position", time);
    events.append(ev);
}

static JsonObject positionsJson(Score* score, bool ofSegments)
{
    std::unordered_map<const void*, int> ids;
    JsonArray elements;
    int id = 0;
    if (ofSegments) {
        Measure* first = score->firstMeasureMM();
        for (Segment* segment = first ? first->first(SegmentType::ChordRest) : nullptr; segment;
             segment = segment->next1MM(SegmentType::ChordRest)) {
            // Width: up to the next segment on the same system, or to the end of the measure (4.00 semantics)
            const Measure* own = segment->measure();
            const Segment* next = segment->next1MM(SegmentType::ChordRest);
            const bool sameSystem = next && next->measure()->system() == own->system();
            const double right = sameSystem ? next->pagePos().x() : own->pagePos().x() + own->ldata()->bbox().width();
            const double sx = std::max(0.0, right - segment->pagePos().x());
            const System* system = own->system();
            positionElement(elements, id, int(segment->pagePos().x()), int(segment->pagePos().y()), sx,
                            system->ldata()->bbox().height(), score->pageIdx(system->page()));
            ids[segment] = id++;
        }
    } else {
        for (Measure* measure = score->firstMeasureMM(); measure; measure = measure->nextMeasureMM()) {
            const System* system = measure->system();
            positionElement(elements, id, measure->pagePos().x(), system->pagePos().y(), measure->ldata()->bbox().width(),
                            system->ldata()->bbox().height(), score->pageIdx(system->page()));
            ids[measure] = id++;
        }
    }

    JsonArray events;
    score->masterScore()->setExpandRepeats(true);
    const RepeatList& repeats = score->repeatList();
    for (const RepeatSegment* repeatSegment : repeats) {
        const int startTick = repeatSegment->tick;
        const int endTick = startTick + repeatSegment->len();
        const int tickOffset = repeatSegment->utick - repeatSegment->tick;
        for (Measure* measure = score->tick2measureMM(Fraction::fromTicks(startTick)); measure; measure = measure->nextMeasureMM()) {
            if (ofSegments) {
                for (Segment* s = measure->first(SegmentType::ChordRest); s; s = s->next(SegmentType::ChordRest)) {
                    auto it = ids.find(s);
                    if (it == ids.end()) continue;
                    positionEvent(events, it->second, int(std::lrint(repeats.utick2utime(s->tick().ticks() + tickOffset) * 1000)));
                }
            } else if (auto it = ids.find(measure); it != ids.end()) {
                positionEvent(events, it->second, int(std::lrint(repeats.utick2utime(measure->tick().ticks() + tickOffset) * 1000)));
            }
            if (measure->endTick().ticks() >= endTick) break;
        }
    }

    JsonObject json;
    json.set("elements", elements);
    json.set("events", events);
    if (!score->pages().empty()) {
        JsonObject pageSize;
        pageSize.set("height", toAbi(score->pages().front()->ldata()->bbox().height()));
        pageSize.set("width", toAbi(score->pages().front()->ldata()->bbox().width()));
        json.set("pageSize", pageSize);
    }
    return json;
}

static String metaText(const Score* score, TextStyleType type, const char16_t* metaTag = nullptr)
{
    const Text* text = score->getText(type);
    String value = text ? text->plainText() : String();
    if (value.empty() && metaTag) value = score->metaTag(String(metaTag));
    return value;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE const uint8_t* savePositions(uintptr_t score_ptr, bool ofSegments, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return textResponse("Invalid score or excerpt", 1);
    return response(JsonDocument(positionsJson(score, ofSegments)).toJson(JsonDocument::Format::Compact));
}

EMSCRIPTEN_KEEPALIVE const uint8_t* saveMetadata(uintptr_t score_ptr)
{
    auto* score = getScore(score_ptr);
    if (!score) return textResponse("Invalid score", 1);
    const auto boolText = [](bool v) { return String(v ? u"true" : u"false"); };
    JsonObject json;
    String title = metaText(score, TextStyleType::TITLE, u"workTitle");
    if (title.empty()) title = score->name();
    json.set("title", title);
    json.set("subtitle", metaText(score, TextStyleType::SUBTITLE));
    json.set("composer", metaText(score, TextStyleType::COMPOSER, u"composer"));
    json.set("poet", metaText(score, TextStyleType::LYRICIST, u"lyricist"));
    json.set("mscoreVersion", score->mscoreVersion());
    json.set("fileVersion", score->mscVersion());
    json.set("pages", static_cast<int>(score->npages()));
    json.set("measures", static_cast<int>(score->nmeasures()));
    json.set("hasLyrics", boolText(score->hasLyrics()));
    json.set("hasHarmonies", boolText(score->hasHarmonies()));
    json.set("keysig", score->keysig());
    json.set("previousSource", score->metaTag(u"source"));
    String timesig;
    if (const Segment* seg = score->firstSegmentMM(SegmentType::TimeSig)) {
        for (track_idx_t track = 0; track < score->nstaves() * VOICES; ++track) {
            if (const EngravingItem* e = seg->element(track); e && e->isTimeSig()) {
                timesig = String(u"%1/%2").arg(toTimeSig(e)->numerator()).arg(toTimeSig(e)->denominator());
                break;
            }
        }
    }
    json.set("timesig", timesig);
    json.set("duration", score->duration());
    json.set("lyrics", score->extractLyrics());
    int tempo = 0;
    String tempoText;
    for (const Segment* segment = score->firstSegmentMM(SegmentType::All); segment; segment = segment->next1MM()) {
        for (const EngravingItem* annotation : segment->annotations()) {
            if (annotation && annotation->isTempoText()) {
                tempo = int(std::round(toTempoText(annotation)->tempo().toBPM().val));
                tempoText = toTempoText(annotation)->xmlText();
            }
        }
    }
    json.set("tempo", tempo);
    json.set("tempoText", tempoText);
    JsonArray parts;
    for (const Part* part : score->parts()) {
        JsonObject jsonPart;
        jsonPart.set("id", part->id().toStdString());
        String name = part->longName();
        name.replace(u"\n", u"");
        jsonPart.set("name", name);
        jsonPart.set("program", part->midiProgram());
        jsonPart.set("instrumentId", part->instrumentId());
        jsonPart.set("lyricCount", part->lyricCount());
        jsonPart.set("harmonyCount", part->harmonyCount());
        jsonPart.set("hasPitchedStaff", boolText(part->hasPitchedStaff()));
        jsonPart.set("hasTabStaff", boolText(part->hasTabStaff()));
        jsonPart.set("hasDrumStaff", boolText(part->hasDrumStaff()));
        jsonPart.set("isVisible", boolText(part->show()));
        parts.append(jsonPart);
    }
    json.set("parts", parts);
    JsonObject pageFormat;
    pageFormat.set("height", std::round(score->style().styleD(Sid::pageHeight) * INCH));
    pageFormat.set("width", std::round(score->style().styleD(Sid::pageWidth) * INCH));
    pageFormat.set("twosided", boolText(score->style().styleB(Sid::pageTwosided)));
    json.set("pageFormat", pageFormat);
    return response(JsonDocument(json).toJson(JsonDocument::Format::Compact));
}

EMSCRIPTEN_KEEPALIVE const uint8_t* loadProfile(uintptr_t score_ptr)
{
    JsonObject json;
    auto it = loadProfiles.find(score_ptr);
    if (it == loadProfiles.end()) {
        json.set("available", false);
    } else {
        json = it->second;
        json.set("available", true);
    }
    return response(JsonDocument(json).toJson(JsonDocument::Format::Compact));
}

} // extern "C"
