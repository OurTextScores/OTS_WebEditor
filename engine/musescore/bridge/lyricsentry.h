// SPDX-License-Identifier: GPL-3.0-only
#pragma once
// Lyric entry as MuseScore does it (roadmap E17): a lyric is typed on a note, and a key moves on, setting the
// syllables' hyphenation and extenders on the way. Ported from NotationInteraction (navigateToLyrics,
// navigateToNextSyllable, addMelisma, navigateToLyricsVerse, addLyricsVerse) in src/notation, which the bridge does
// not compile; the editor's text box stands in for MuseScore's in-place text cursor. Each key is one undoable edit:
// the typed syllable is written (or removed, if emptied), the syllabic rules applied, and the entry moves on.
// Left out: the partial dashes and extenders MuseScore draws across repeat jumps (PartialLyricsLine).
#include "global/serialization/json.h"
#include "engraving/dom/chord.h"
#include "engraving/dom/chordrest.h"
#include "engraving/dom/factory.h"
#include "engraving/dom/lyrics.h"
#include "engraving/dom/measure.h"
#include "engraving/dom/note.h"
#include "engraving/dom/page.h"
#include "engraving/dom/segment.h"
#include "engraving/dom/staff.h"
#include "engraving/dom/system.h"
#include "engraving/dom/utils.h"

namespace lyricsentry {
using engraving::ChordRest;
using engraving::Lyrics;
using engraving::LyricsSyllabic;
using engraving::Pid;
using engraving::PlacementV;
using engraving::Segment;
using engraving::SegmentType;

// The keys the editor sends, as `lyricsEntryCommit`'s action.
enum Action { END = 0, NEXT = 1, PREVIOUS = 2, SYLLABLE = 3, MELISMA = 4, VERSE_UP = 5, VERSE_DOWN = 6, NEW_VERSE = 7 };

struct State {
    bool active = false;
    Score* score = nullptr;
    ChordRest* cr = nullptr;
    int verse = 0;
    PlacementV placement = PlacementV::BELOW;
    // The syllabic a lyric typed here gets: END after a hyphen took the entry here, else SINGLE.
    LyricsSyllabic pending = LyricsSyllabic::SINGLE;
};
static State g_state;

static Lyrics* createLyrics(ChordRest* cr, int verse, PlacementV placement, LyricsSyllabic syllabic)
{
    Lyrics* lyrics = engraving::Factory::createLyrics(cr);
    lyrics->setTrack(cr->track());
    lyrics->setParent(cr);
    lyrics->setVerse(verse);
    lyrics->setTextStyleType(lyrics->isEven() ? engraving::TextStyleType::LYRICS_EVEN : engraving::TextStyleType::LYRICS_ODD);
    if (placement != lyrics->propertyDefault(Pid::PLACEMENT).value<PlacementV>()) {
        lyrics->setPlacement(placement);
        lyrics->setPropertyFlags(Pid::PLACEMENT, engraving::PropertyFlags::UNSTYLED);
    }
    lyrics->setSyllabic(syllabic);
    return lyrics;
}

static int pageIndex(Score* score, const engraving::EngravingItem* item)
{
    const auto* page = item ? item->findAncestor(engraving::ElementType::PAGE) : nullptr;
    const auto& pages = score->pages();
    for (size_t i = 0; i < pages.size(); ++i) {
        if (pages[i] == page) return static_cast<int>(i);
    }
    return 0;
}

// Where the text box goes: over the lyric if there is one, else where the verse's line would be under (or over) the
// staff at this note. Page coordinates, ABI units.
static const uint8_t* stateJson()
{
    if (!g_state.active || !g_state.cr) return textResponse("null");
    ChordRest* cr = g_state.cr;
    Score* score = g_state.score;
    Lyrics* lyrics = cr->lyrics(g_state.verse, g_state.placement);
    muse::RectF rect = lyrics ? lyrics->pageBoundingRect() : muse::RectF();
    if (rect.isEmpty()) {
        const double sp = cr->spatium();
        const engraving::System* system = cr->measure() ? cr->measure()->system() : nullptr;
        const engraving::staff_idx_t staffIdx = cr->staffIdx();
        const double staffTop = system ? system->staffYpage(staffIdx) : cr->pagePos().y();
        const double staffHeight = cr->staff() ? cr->staff()->staffHeight(cr->tick()) : 4 * sp;
        const double line = 2.8 * sp;   // about lyricsLineHeight at the default lyric size
        const double y = g_state.placement == PlacementV::ABOVE
            ? staffTop - 2.5 * sp - (g_state.verse + 1) * line
            : staffTop + staffHeight + 2.5 * sp + g_state.verse * line;
        rect = muse::RectF(cr->pageX() - sp, y, 4 * sp, line);
    }
    JsonObject result;
    result.set("page", pageIndex(score, cr));
    result.set("x", toAbi(rect.x()));
    result.set("y", toAbi(rect.y()));
    result.set("w", toAbi(rect.width()));
    result.set("h", toAbi(rect.height()));
    result.set("text", lyrics ? lyrics->plainText() : String());
    result.set("verse", g_state.verse);
    return response(JsonDocument(result).toJson(JsonDocument::Format::Compact));
}

// The next (or previous) segment Space moves to: a chord, or a rest that already has this verse's lyric.
static Segment* spaceTarget(Segment* segment, engraving::track_idx_t track, int verse, PlacementV placement, bool back)
{
    Segment* next = segment;
    while ((next = back ? next->prev1(SegmentType::ChordRest) : next->next1(SegmentType::ChordRest))) {
        engraving::EngravingItem* el = next->element(track);
        if (!el) continue;
        if (el->isChord()) return next;
        if (el->isRest() && engraving::toChordRest(el)->lyrics(verse, placement)) return next;
    }
    return nullptr;
}

// The next chord in the track, if it directly follows (a hyphen or an extender only joins adjacent notes).
static Segment* adjacentChord(Segment* segment, engraving::track_idx_t track)
{
    Segment* next = segment;
    while ((next = next->next1(SegmentType::ChordRest))) {
        engraving::EngravingItem* el = next->element(track);
        if (el && el->isChord()) break;
    }
    return engraving::segmentsAreAdjacent(segment, next) ? next : nullptr;
}

// The lyric a hyphen or an extender continues from: at this note, or the last one before it (several presses extend).
static Lyrics* fromLyrics(Segment* segment, engraving::track_idx_t track, int verse, PlacementV placement, bool stopAtRest)
{
    Segment* current = segment;
    while (segment && engraving::segmentsAreAdjacent(segment, current)) {
        auto* el = segment->element(track);
        if (el && el->isChordRest()) {
            if (Lyrics* lyrics = engraving::toChordRest(el)->lyrics(verse, placement)) return lyrics;
        }
        segment = segment->prev1(SegmentType::ChordRest);
        if (stopAtRest) {
            auto* e = segment ? segment->element(track) : nullptr;
            if (e && !e->isChord()) break;
        }
    }
    return nullptr;
}

static void setSyllabic(Lyrics* lyrics, LyricsSyllabic syllabic)
{
    if (lyrics && lyrics->syllabic() != syllabic) lyrics->undoChangeProperty(Pid::SYLLABIC, int(syllabic));
}

static ChordRest* chordRestAt(Segment* segment, engraving::track_idx_t track)
{
    auto* el = segment ? segment->element(track) : nullptr;
    return el && el->isChordRest() ? engraving::toChordRest(el) : nullptr;
}

// MuseScore creates the lyric where the entry arrives straight away (an empty one, with the syllabic the move gives
// it), so a hyphen or extender already has a lyric to reach; one left empty is removed when the entry moves on or stops.
static void ensureLyricsAtEntry(Score* score)
{
    ChordRest* cr = g_state.cr;
    if (!cr || cr->lyrics(g_state.verse, g_state.placement)) return;
    Lyrics* lyrics = createLyrics(cr, g_state.verse, g_state.placement, g_state.pending);
    score->undoAddElement(lyrics);
}

static void removeIfEmpty(Score* score, Lyrics* lyrics)
{
    if (lyrics && lyrics->xmlText().isEmpty()) score->undoRemoveElement(lyrics);
}

// Space or Shift+Space (navigateToLyrics): the lyric left behind and the one arrived at are whole words.
static void moveByWord(bool back)
{
    ChordRest* cr = g_state.cr;
    const auto track = cr->track();
    Segment* target = spaceTarget(cr->segment(), track, g_state.verse, g_state.placement, back);
    ChordRest* next = chordRestAt(target, track);
    if (!next) return;
    if (!back) {
        Lyrics* from = nullptr;
        for (Segment* s = cr->segment(); s && !from; s = s->prev1(SegmentType::ChordRest)) {
            if (ChordRest* c = chordRestAt(s, track)) from = c->lyrics(g_state.verse, g_state.placement);
        }
        if (from) {
            if (Lyrics* arrived = next->lyrics(g_state.verse, g_state.placement)) {
                if (arrived->syllabic() == LyricsSyllabic::END) setSyllabic(arrived, LyricsSyllabic::SINGLE);
                else if (arrived->syllabic() == LyricsSyllabic::MIDDLE) setSyllabic(arrived, LyricsSyllabic::BEGIN);
            }
            if (from->syllabic() == LyricsSyllabic::BEGIN) setSyllabic(from, LyricsSyllabic::SINGLE);
            else if (from->syllabic() == LyricsSyllabic::MIDDLE) setSyllabic(from, LyricsSyllabic::END);
        }
    }
    g_state.cr = next;
    g_state.pending = LyricsSyllabic::SINGLE;
}

// "-" (navigateToNextSyllable): a hyphen joins this syllable to the next note's.
static void moveBySyllable()
{
    ChordRest* cr = g_state.cr;
    const auto track = cr->track();
    ChordRest* next = chordRestAt(adjacentChord(cr->segment(), track), track);
    if (!next) return;
    Lyrics* from = fromLyrics(cr->segment(), track, g_state.verse, g_state.placement, false);
    Lyrics* arrived = next->lyrics(g_state.verse, g_state.placement);
    if (arrived) {
        if (arrived->syllabic() == LyricsSyllabic::BEGIN) setSyllabic(arrived, LyricsSyllabic::MIDDLE);
        else if (arrived->syllabic() == LyricsSyllabic::SINGLE) setSyllabic(arrived, LyricsSyllabic::END);
    }
    if (from) {
        if (from->syllabic() == LyricsSyllabic::SINGLE) setSyllabic(from, LyricsSyllabic::BEGIN);
        else if (from->syllabic() == LyricsSyllabic::END) setSyllabic(from, LyricsSyllabic::MIDDLE);
        from->undoChangeProperty(Pid::LYRIC_TICKS, engraving::Fraction(0, 1));
    }
    g_state.cr = next;
    g_state.pending = arrived ? arrived->syllabic() : LyricsSyllabic::END;
}

// "_" (addMelisma): an extender line carries the last syllable over the following notes.
static void moveByMelisma()
{
    ChordRest* cr = g_state.cr;
    const auto track = cr->track();
    Segment* segment = cr->segment();
    const engraving::Fraction endTick = segment->tick();   // a previous melisma cannot extend beyond this point
    ChordRest* next = chordRestAt(adjacentChord(segment, track), track);
    Lyrics* here = cr->lyrics(g_state.verse, g_state.placement);
    Lyrics* from = fromLyrics(segment, track, g_state.verse, g_state.placement, true);
    if (from && from == here && next) {
        here->undoChangeProperty(Pid::LYRIC_TICKS, Lyrics::TEMP_MELISMA_TICKS);   // a one-note melisma, for now
    }
    if (from && (from->syllabic() == LyricsSyllabic::BEGIN || from->syllabic() == LyricsSyllabic::MIDDLE)) {
        setSyllabic(from, LyricsSyllabic::END);
    }
    if (!next) {
        if (from && from->segment()->tick() < endTick) {
            from->undoChangeProperty(Pid::LYRIC_TICKS, std::max(endTick - from->segment()->tick(), Lyrics::TEMP_MELISMA_TICKS));
        }
        return;
    }
    if (from && from->segment()->tick() < endTick) {
        from->undoChangeProperty(Pid::LYRIC_TICKS, endTick - from->segment()->tick());
    }
    Lyrics* arrived = next->lyrics(g_state.verse, g_state.placement);
    if (arrived) {
        if (arrived->syllabic() == LyricsSyllabic::MIDDLE) setSyllabic(arrived, LyricsSyllabic::BEGIN);
        else if (arrived->syllabic() == LyricsSyllabic::END) setSyllabic(arrived, LyricsSyllabic::SINGLE);
    }
    g_state.cr = next;
    g_state.pending = LyricsSyllabic::SINGLE;
}
} // namespace lyricsentry

extern "C" {

// Starts lyric entry at the selection: a lyric (its note and verse), or a note, rest or chord (verse 1, the style's
// placement). Returns where the text box goes and the text there, or null when nothing fits.
EMSCRIPTEN_KEEPALIVE const uint8_t* startLyricsEntry(uintptr_t score_ptr, int excerptId)
{
    using namespace lyricsentry;
    auto* score = getScore(score_ptr, excerptId);
    g_state = State();
    if (!score) return textResponse("null");
    engraving::EngravingItem* el = score->selection().element();
    if (!el) el = score->selection().firstChordRest();
    ChordRest* cr = nullptr;
    int verse = 0;
    PlacementV placement = score->style().styleV(engraving::Sid::lyricsPlacement).value<PlacementV>();
    if (el && el->isLyrics()) {
        auto* lyrics = engraving::toLyrics(el);
        cr = lyrics->chordRest();
        verse = lyrics->verse();
        placement = lyrics->placement();
    } else if (el && el->isNote()) {
        cr = engraving::toNote(el)->chord();
    } else if (el && el->isChordRest()) {
        cr = engraving::toChordRest(el);
    }
    if (!cr) return textResponse("null");
    g_state = State { true, score, cr, verse, placement, LyricsSyllabic::SINGLE };
    return stateJson();
}

// Writes the typed syllable at the entry (removing the lyric if it was emptied) and does what the key asks: END stops,
// NEXT/PREVIOUS move by word (Space, Shift+Space), SYLLABLE by hyphen ("-"), MELISMA by extender ("_"), VERSE_UP and
// VERSE_DOWN change verse (arrows), NEW_VERSE starts the next verse on this note (Enter). One undoable edit. Returns
// the new entry position, or null once entry has stopped.
EMSCRIPTEN_KEEPALIVE const uint8_t* lyricsEntryCommit(uintptr_t score_ptr, const char* text, int action, int excerptId)
{
    using namespace lyricsentry;
    auto* score = getScore(score_ptr, excerptId);
    if (!score || !g_state.active || score != g_state.score || !g_state.cr) {
        g_state = State();
        return textResponse("null");
    }
    score->startCmd(TranslatableString::untranslatable("Enter lyrics"));
    ChordRest* cr = g_state.cr;
    Lyrics* here = cr->lyrics(g_state.verse, g_state.placement);
    const String xml = engraving::TextBase::plainToXmlText(String::fromUtf8(text ? text : ""));
    if (here && xml.isEmpty()) {
        score->undoRemoveElement(here);
        here = nullptr;
    } else if (here) {
        if (here->xmlText() != xml) here->undoChangeProperty(Pid::TEXT, xml);
    } else if (!xml.isEmpty()) {
        here = createLyrics(cr, g_state.verse, g_state.placement, g_state.pending);
        here->setXmlText(xml);
        score->undoAddElement(here);
    }

    switch (action) {
    case NEXT: moveByWord(false); break;
    case PREVIOUS: moveByWord(true); break;
    case SYLLABLE: moveBySyllable(); break;
    case MELISMA: moveByMelisma(); break;
    case VERSE_UP:
        if (g_state.verse > 0) --g_state.verse;
        g_state.pending = LyricsSyllabic::SINGLE;
        break;
    case VERSE_DOWN:
        if (g_state.verse + 1 <= cr->lastVerse(g_state.placement)) ++g_state.verse;
        g_state.pending = LyricsSyllabic::SINGLE;
        break;
    case NEW_VERSE:
        ++g_state.verse;
        g_state.pending = LyricsSyllabic::SINGLE;
        break;
    default:
        g_state.active = false;
        break;
    }
    if (g_state.active) ensureLyricsAtEntry(score);
    score->endCmd();
    layoutLinked(score);

    Lyrics* landed = g_state.cr ? g_state.cr->lyrics(g_state.verse, g_state.placement) : nullptr;
    if (!g_state.active) {
        if (here) score->select(here, engraving::SelectType::SINGLE, here->staffIdx());
        g_state = State();
        return textResponse("null");
    }
    if (landed) score->select(landed, engraving::SelectType::SINGLE, landed->staffIdx());
    else score->select(g_state.cr, engraving::SelectType::SINGLE, g_state.cr->staffIdx());
    return stateJson();
}

// Stops lyric entry without writing anything (the editor closed some other way); an empty lyric the entry made is
// removed.
EMSCRIPTEN_KEEPALIVE bool endLyricsEntry(uintptr_t score_ptr, int excerptId)
{
    using namespace lyricsentry;
    auto* score = getScore(score_ptr, excerptId);
    const bool was = g_state.active;
    if (was && score && score == g_state.score && g_state.cr) {
        if (Lyrics* lyrics = g_state.cr->lyrics(g_state.verse, g_state.placement); lyrics && lyrics->xmlText().isEmpty()) {
            score->startCmd(TranslatableString::untranslatable("Enter lyrics"));
            removeIfEmpty(score, lyrics);
            score->endCmd();
            layoutLinked(score);
        }
    }
    g_state = State();
    return was;
}

} // extern "C"
