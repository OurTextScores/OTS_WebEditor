// SPDX-License-Identifier: GPL-3.0-only
#pragma once
// Playback follow map (score-following design §7): repeat-expanded cursor intervals with native geometry, under the
// project's playback options, so the browser can animate a cursor without per-frame engine calls.
//
// Geometry follows desktop MuseScore's PlaybackCursor::resolveCursorRectByTick: within a measure the cursor moves
// linearly *in ticks* from one visible ChordRest segment to the next, the last one ending at the end barline; it
// spans the system from the first to the last visible staff. Time is linear in ticks only between tempo-map entries,
// so every interval is split at each entry inside it (gradual tempo changes are stepped entries in the tempo map).
// A timed pause before a tick becomes a hold interval at that tick's x. Intervals keep their timing when a page is
// not laid out (geometry null). Segment ids match segmentPositions(); measure indices match playbackTimeline().

#include "engraving/dom/measure.h"
#include "engraving/dom/page.h"
#include "engraving/dom/repeatlist.h"
#include "engraving/dom/segment.h"
#include "engraving/dom/staff.h"
#include "engraving/dom/system.h"
#include "engraving/dom/tempo.h"

namespace ms47follow {
using namespace mu::engraving;

struct SystemBand {
    int page = -1;
    int systemId = -1;
    double top = 0;
    double height = 0;
};

static SystemBand systemBand(Score* score, const System* system, const std::map<const System*, int>& systemIds)
{
    SystemBand band;
    if (!system || !system->page() || system->staves().empty()) return band;
    const int page = int(score->pageIdx(system->page()));
    if (page < 0) return band;
    double top = 0, bottom = 0;
    bool any = false;
    for (size_t i = 0; i < score->nstaves() && i < system->staves().size(); ++i) {
        const SysStaff* staff = system->staff(i);
        if (!staff || !staff->show() || !score->staff(i)->show()) continue;
        if (!any) top = staff->bbox().top();
        bottom = staff->bbox().bottom();
        any = true;
    }
    if (!any) return band;
    const double spatium = score->style().spatium();
    const double systemY = system->pagePos().y();
    band.page = page;
    auto id = systemIds.find(system);
    band.systemId = id == systemIds.end() ? -1 : id->second;
    band.top = systemY + top - 3 * spatium;
    band.height = bottom - top + 6 * spatium;
    return band;
}

static const Segment* nextVisibleChordRest(const Segment* segment)
{
    const Segment* next = segment->next(SegmentType::ChordRest);
    while (next && !next->visible()) next = next->next(SegmentType::ChordRest);
    return next;
}

static double endBarlineX(const Measure* measure)
{
    if (const Segment* bar = measure->findSegment(SegmentType::EndBarLine, measure->endTick())) return bar->pagePos().x();
    return measure->pagePos().x() + measure->width();
}

static JsonObject followMapJson(uintptr_t projectId, Score* score)
{
    ms47options::PlaybackOptionsScope scope(projectId, score);
    const RepeatList& repeats = scope.repeats();
    const TempoMap* tempo = score->tempomap();

    // Ids shared with the other exports: segments in segmentPositions() order, measures in playbackTimeline() order.
    std::map<const Segment*, int> segmentIds;
    std::map<const Measure*, int> measureIds;
    std::map<const System*, int> systemIds;
    int segmentCounter = 0, measureCounter = 0, systemCounter = 0;
    for (Measure* m = score->firstMeasureMM(); m; m = m->nextMeasureMM()) {
        measureIds[m] = measureCounter++;
        if (m->system() && !systemIds.count(m->system())) systemIds[m->system()] = systemCounter++;
    }
    if (Measure* first = score->firstMeasureMM()) {
        for (Segment* s = first->first(SegmentType::ChordRest); s; s = s->next1MM(SegmentType::ChordRest)) segmentIds[s] = segmentCounter++;
    }

    JsonArray intervals;
    bool complete = !score->pages().empty();
    int occurrence = 0;
    const auto timeMs = [&](int playedTick) { return repeats.utick2utime(playedTick) * 1000.0; };
    const auto addInterval = [&](int occ, const Measure* measure, const Segment* segment, double start, double end,
                                 const SystemBand& band, double x0, double x1) {
        if (!(end > start)) return;
        JsonObject interval;
        interval.set("occurrenceIndex", occ);
        interval.set("measureIndex", measureIds.count(measure) ? measureIds.at(measure) : -1);
        interval.set("segmentId", segment && segmentIds.count(segment) ? JsonValue(segmentIds.at(segment)) : JsonValue());
        interval.set("startMs", start);
        interval.set("endMs", end);
        if (band.page >= 0) {
            JsonObject geometry;
            geometry.set("page", band.page);
            geometry.set("systemId", band.systemId);
            geometry.set("xStart", toAbi(x0));
            geometry.set("xEnd", toAbi(x1));
            geometry.set("y", toAbi(band.top));
            geometry.set("height", toAbi(band.height));
            interval.set("geometry", geometry);
        } else {
            interval.set("geometry", JsonValue());
        }
        intervals.append(interval);
    };

    for (const RepeatSegment* rs : repeats) {
        const int windowStart = rs->tick;
        const int windowEnd = rs->endTick();
        const int offset = rs->utick - rs->tick;
        for (Measure* measure = score->tick2measureMM(Fraction::fromTicks(windowStart)); measure;
             measure = measure->nextMeasureMM()) {
            const int occ = occurrence++;
            const System* system = measure->system();
            const SystemBand band = systemBand(score, system, systemIds);
            complete = complete && band.page >= 0;
            for (const Segment* s = measure->first(SegmentType::ChordRest); s; s = nextVisibleChordRest(s)) {
                if (!s->visible()) continue;
                const Segment* next = nextVisibleChordRest(s);
                const int t1 = s->tick().ticks();
                const int t2 = next ? next->tick().ticks() : measure->endTick().ticks();
                const double x1 = s->pagePos().x();
                const double x2 = next ? next->pagePos().x() : endBarlineX(measure);
                const int from = std::max(t1, windowStart);
                const int to = std::min(t2, windowEnd);
                if (to <= from || t2 <= t1) continue;
                const auto xAt = [&](int tick) { return x1 + (x2 - x1) * double(tick - t1) / double(t2 - t1); };
                // Split at every tempo-map entry inside (from, to): time is linear in ticks only between entries.
                int pieceStart = from;
                for (auto entry = tempo->upper_bound(from);; ++entry) {
                    const bool last = entry == tempo->end() || entry->first >= to;
                    const int pieceEnd = last ? to : entry->first;
                    // A pause belongs before its tick, including the tick that ends this segment's span.
                    const auto atEnd = tempo->find(pieceEnd);
                    const double pause = atEnd != tempo->end() ? atEnd->second.pause : 0.0;
                    const double startMs = timeMs(pieceStart + offset);
                    const double endMs = timeMs(pieceEnd + offset);
                    const double musicEnd = endMs - pause * 1000.0;
                    addInterval(occ, measure, s, startMs, musicEnd, band, xAt(pieceStart), xAt(pieceEnd));
                    // A timed pause before pieceEnd: hold at its x for the pause.
                    if (pause > 0) addInterval(occ, measure, s, musicEnd, endMs, band, xAt(pieceEnd), xAt(pieceEnd));
                    if (last) break;
                    pieceStart = pieceEnd;
                }
            }
            if (measure->endTick().ticks() >= windowEnd) break;
        }
    }

    JsonArray pages;
    for (size_t i = 0; i < score->pages().size(); ++i) {
        const Page* page = score->pages().at(i);
        JsonObject size;
        size.set("page", int(i));
        size.set("width", toAbi(page->ldata()->bbox().width()));
        size.set("height", toAbi(page->ldata()->bbox().height()));
        pages.append(size);
    }
    const double durationMs = std::llround(repeats.utick2utime(repeats.ticks()) * 1000.0);
    JsonObject map;
    map.set("schemaVersion", 1);
    map.set("optionsRevision", scope.options().revision);
    map.set("coordinateSpace", "page-local-360dpi");
    map.set("complete", complete);
    map.set("durationMs", durationMs);
    map.set("renderDurationMs", durationMs + 3000);
    map.set("spatium", toAbi(score->style().spatium()));
    map.set("pages", pages);
    map.set("intervals", intervals);
    return map;
}
} // namespace ms47follow

extern "C" {
EMSCRIPTEN_KEEPALIVE const uint8_t* playbackFollowMap(uintptr_t score_ptr, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return textResponse("Invalid score or excerpt", 1);
    return response(JsonDocument(ms47follow::followMapJson(score_ptr, score)).toJson(JsonDocument::Format::Compact));
}
}
