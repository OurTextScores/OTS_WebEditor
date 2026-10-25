// SPDX-License-Identifier: GPL-3.0-only
#pragma once
// Transient playback options (tempo multiplier, written repeats) for one loaded project, shared by its excerpts.
// They are never written into the score: every playback-family read applies them inside a PlaybackOptionsScope
// and restores the notation's own tempo multiplier and repeat expansion afterwards, so MIDI/MusicXML/MSCZ exports,
// layout and undo never observe them. Audio, timeline, positions, selection start and position conversion all read
// the same options, and every JSON result carries the revision it was computed under.

#include <cmath>
#include "engraving/dom/masterscore.h"
#include "engraving/dom/repeatlist.h"
#include "engraving/dom/tempo.h"

namespace ms47options {
using namespace mu::engraving;

constexpr double MIN_TEMPO_MULTIPLIER = 0.25;
constexpr double MAX_TEMPO_MULTIPLIER = 2.0;

struct PlaybackOptions {
    double tempoMultiplier = 1.0;
    bool playRepeats = true;
    int revision = 0;
};

static std::map<uintptr_t, PlaybackOptions> sessions;

static PlaybackOptions current(uintptr_t id)
{
    auto it = sessions.find(id);
    return it == sessions.end() ? PlaybackOptions {} : it->second;
}

// Applies the project's options to its master score for the duration of one bridge call. Nested scopes (a stream
// preparing inside a measure-range window) reuse the outer application.
class PlaybackOptionsScope
{
public:
    PlaybackOptionsScope(uintptr_t id, Score* score)
        : m_master(score->masterScore()), m_options(current(id))
    {
        if (depth++ > 0) return;
        m_owner = true;
        TempoMap* tempo = m_master->tempomap();
        m_baseMultiplier = tempo->tempoMultiplier().val;   // 1.x files can carry their own multiplier
        m_baseExpand = m_master->expandRepeats();
        if (m_options.tempoMultiplier != 1.0) {
            tempo->setTempoMultiplier(m_baseMultiplier * m_options.tempoMultiplier);
            m_master->updateRepeatListTempo();
        }
        m_master->setExpandRepeats(m_options.playRepeats);
        // Rebuild without the tie-repair pass: that pass pushes undoable edits, and a playback read must not.
        // A later repeatList() call (PlaybackModel's) then finds the list current and skips it as well.
        m_master->repeatList(m_options.playRepeats, false);
    }

    ~PlaybackOptionsScope()
    {
        --depth;
        if (!m_owner) return;
        TempoMap* tempo = m_master->tempomap();
        if (tempo->tempoMultiplier().val != m_baseMultiplier) {
            tempo->setTempoMultiplier(m_baseMultiplier);
            m_master->updateRepeatListTempo();
        }
        m_master->setExpandRepeats(m_baseExpand);
    }

    PlaybackOptionsScope(const PlaybackOptionsScope&) = delete;
    PlaybackOptionsScope& operator=(const PlaybackOptionsScope&) = delete;

    const RepeatList& repeats() const { return m_master->repeatList(m_options.playRepeats, false); }
    const PlaybackOptions& options() const { return m_options; }

private:
    static inline int depth = 0;
    MasterScore* m_master;
    PlaybackOptions m_options;
    double m_baseMultiplier = 1.0;
    bool m_baseExpand = true;
    bool m_owner = false;
};

static JsonObject optionsJson(const PlaybackOptions& options)
{
    JsonObject json;
    json.set("schemaVersion", 1);
    json.set("tempoMultiplier", options.tempoMultiplier);
    json.set("playRepeats", options.playRepeats);
    json.set("revision", options.revision);
    return json;
}

// Played seconds of a (possibly fractional) played tick. Within one tick the tempo is constant, except across a
// pause, where this spreads the pause over the tick before it (as time2tick holds the previous tick).
static double playedTime(const RepeatList& repeats, int playedTick, double fraction)
{
    const double start = repeats.utick2utime(playedTick);
    if (fraction <= 0) return start;
    return start + fraction * (repeats.utick2utime(playedTick + 1) - start);
}

// Index of the repeat segment that plays `playedTick`, or -1 at/after the end of the traversal.
static int segmentAtPlayedTick(const RepeatList& repeats, int playedTick)
{
    for (size_t i = 0; i < repeats.size(); ++i) {
        const RepeatSegment* segment = repeats.at(i);
        if (playedTick >= segment->utick && playedTick < segment->utick + segment->len()) return int(i);
    }
    return -1;
}

// How many earlier segments of the traversal also play this written tick: 0 on the first pass.
static int passOf(const RepeatList& repeats, int segmentIndex, int writtenTick)
{
    int pass = 0;
    for (int i = 0; i < segmentIndex; ++i) {
        const RepeatSegment* segment = repeats.at(i);
        if (writtenTick >= segment->tick && writtenTick < segment->endTick()) ++pass;
    }
    return pass;
}
} // namespace ms47options

static void forgetPlaybackOptions(uintptr_t id) { ms47options::sessions.erase(id); }

extern "C" {

// Accepts and returns the options actually applied (tempo multiplier clamped to the supported range; a non-finite
// value keeps the previous one). The revision changes only when an option does. A change retires the project's
// prepared stream and playback model: their PCM and timing belong to the previous revision.
EMSCRIPTEN_KEEPALIVE const uint8_t* setPlaybackOptions(uintptr_t id, double tempoMultiplier, bool playRepeats)
{
    if (!getScore(id)) return textResponse("Invalid score", 1);
    ms47options::PlaybackOptions next = ms47options::current(id);
    const ms47options::PlaybackOptions previous = next;
    if (std::isfinite(tempoMultiplier)) {
        next.tempoMultiplier = std::clamp(tempoMultiplier, ms47options::MIN_TEMPO_MULTIPLIER,
                                          ms47options::MAX_TEMPO_MULTIPLIER);
    }
    next.playRepeats = playRepeats;
    const bool changed = next.tempoMultiplier != previous.tempoMultiplier || next.playRepeats != previous.playRepeats;
    if (changed) {
        ++next.revision;
        releasePlaybackForScore(id);
    }
    ms47options::sessions[id] = next;
    JsonObject json = ms47options::optionsJson(next);
    json.set("changed", changed);
    return response(JsonDocument(json).toJson(JsonDocument::Format::Compact));
}

EMSCRIPTEN_KEEPALIVE const uint8_t* playbackOptions(uintptr_t id)
{
    if (!getScore(id)) return textResponse("Invalid score", 1);
    return response(JsonDocument(ms47options::optionsJson(ms47options::current(id))).toJson(JsonDocument::Format::Compact));
}

// Musical location of a playback time under the current options: the written tick (plus progress through it) and
// which pass over that tick the traversal is on. Unlike seconds, this survives a tempo change; with the pass it is
// unambiguous inside repeats.
EMSCRIPTEN_KEEPALIVE const uint8_t* playbackPositionAt(uintptr_t id, double timeMs, int excerpt)
{
    auto* score = getScore(id, excerpt);
    if (!score) return textResponse("Invalid score or excerpt", 1);
    ms47options::PlaybackOptionsScope scope(id, score);
    const RepeatList& repeats = scope.repeats();
    const int endTick = repeats.ticks();
    const double endSeconds = repeats.utick2utime(endTick);
    const double seconds = std::isfinite(timeMs) ? std::clamp(timeMs / 1000.0, 0.0, endSeconds) : 0.0;

    int playedTick = std::clamp(repeats.utime2utick(seconds), 0, endTick);
    while (playedTick > 0 && repeats.utick2utime(playedTick) > seconds) --playedTick;
    double fraction = 0;
    if (playedTick < endTick) {
        const double start = repeats.utick2utime(playedTick);
        const double next = repeats.utick2utime(playedTick + 1);
        fraction = next > start ? std::clamp((seconds - start) / (next - start), 0.0, 0.999999) : 0.0;
    }

    const int segmentIndex = ms47options::segmentAtPlayedTick(repeats, playedTick);
    const bool atEnd = segmentIndex < 0;
    const int lastIndex = int(repeats.size()) - 1;
    const RepeatSegment* segment = repeats.empty() ? nullptr : repeats.at(atEnd ? lastIndex : segmentIndex);
    const int writtenTick = !segment ? 0 : atEnd ? segment->endTick() : playedTick - segment->utick + segment->tick;
    const int occurrence = atEnd ? lastIndex : segmentIndex;
    const int pass = segment && !atEnd ? ms47options::passOf(repeats, segmentIndex, writtenTick) : 0;

    JsonObject json;
    json.set("schemaVersion", 1);
    json.set("optionsRevision", scope.options().revision);
    json.set("timeMs", seconds * 1000.0);
    json.set("writtenTick", writtenTick);
    json.set("fractionalTick", writtenTick + fraction);
    json.set("occurrenceIndex", std::max(0, occurrence));
    json.set("pass", pass);
    json.set("occurrenceKey", std::to_string(writtenTick) + ":" + std::to_string(pass));
    json.set("atEnd", atEnd);
    return response(JsonDocument(json).toJson(JsonDocument::Format::Compact));
}

// Playback time of a musical location under the current options. The same pass is chosen when the traversal still
// plays it; otherwise the nearest pass that remains ("pass-unavailable"), the next reachable written location
// ("tick-unreachable"), or the end of the score ("end"). Never a silent restart from zero.
EMSCRIPTEN_KEEPALIVE const uint8_t* playbackTimeForPosition(uintptr_t id, int writtenTick, double fraction, int pass,
                                                            int excerpt)
{
    auto* score = getScore(id, excerpt);
    if (!score) return textResponse("Invalid score or excerpt", 1);
    ms47options::PlaybackOptionsScope scope(id, score);
    const RepeatList& repeats = scope.repeats();
    fraction = std::isfinite(fraction) ? std::clamp(fraction, 0.0, 0.999999) : 0.0;
    pass = std::max(0, pass);

    std::vector<int> passes;   // segments that play the tick, in traversal order
    int nextReachable = -1;    // first segment starting after the tick, for an unplayed written location
    for (size_t i = 0; i < repeats.size(); ++i) {
        const RepeatSegment* segment = repeats.at(i);
        if (writtenTick >= segment->tick && writtenTick < segment->endTick()) passes.push_back(int(i));
        else if (segment->tick > writtenTick && nextReachable < 0) nextReachable = int(i);
    }

    const char* fallback = nullptr;
    int segmentIndex = -1;
    int resolvedTick = writtenTick;
    int resolvedPass = pass;
    if (!passes.empty()) {
        resolvedPass = std::min(pass, int(passes.size()) - 1);
        segmentIndex = passes[resolvedPass];
        if (resolvedPass != pass) fallback = "pass-unavailable";
    } else if (nextReachable >= 0) {
        segmentIndex = nextReachable;
        resolvedTick = repeats.at(nextReachable)->tick;
        resolvedPass = ms47options::passOf(repeats, segmentIndex, resolvedTick);
        fraction = 0;
        fallback = "tick-unreachable";
    } else {
        fallback = "end";
    }

    double seconds;
    if (segmentIndex >= 0) {
        const RepeatSegment* segment = repeats.at(segmentIndex);
        seconds = ms47options::playedTime(repeats, resolvedTick - segment->tick + segment->utick, fraction);
    } else {
        seconds = repeats.utick2utime(repeats.ticks());
        resolvedPass = 0;
        if (!repeats.empty()) resolvedTick = repeats.at(repeats.size() - 1)->endTick();
    }

    JsonObject json;
    json.set("schemaVersion", 1);
    json.set("optionsRevision", scope.options().revision);
    json.set("timeMs", seconds * 1000.0);
    json.set("writtenTick", resolvedTick);
    json.set("pass", resolvedPass);
    json.set("exact", fallback == nullptr);
    if (fallback) json.set("fallback", fallback);
    else json.set("fallback", JsonValue());
    return response(JsonDocument(json).toJson(JsonDocument::Format::Compact));
}

} // extern "C"
