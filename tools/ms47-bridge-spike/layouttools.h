#pragma once
// Selection filter (legacy 24-bit mask, translated), transpose, progressive layout and the PNG decision.
// Ported from the 4.00 bridge (web/main.cpp); see DECISIONS.md items 4 and 6.

#include <algorithm>

#include "global/serialization/json.h"
#include "engraving/dom/selectionfilter.h"
#include "engraving/editing/transpose.h"
#include "engraving/dom/note.h"
#include "engraving/dom/tie.h"

// Legacy (4.00) selection filter bits, as stored by the editor (components/toolbar/constants.ts)
namespace legacyfilter {
constexpr unsigned NOTES_AND_RESTS = 1u << 23;
constexpr unsigned ALL = (1u << 24) - 1;
}

// 4.00 bits 4..22 by name -> 4.7 element filter. TIE has no legacy bit; it follows SLUR (4.00 filtered ties with slurs).
static const std::pair<unsigned, engraving::ElementsSelectionFilterTypes> legacyElementBits[] = {
    { 1u << 4, engraving::ElementsSelectionFilterTypes::DYNAMIC },
    { 1u << 5, engraving::ElementsSelectionFilterTypes::HAIRPIN },
    { 1u << 6, engraving::ElementsSelectionFilterTypes::FINGERING },
    { 1u << 7, engraving::ElementsSelectionFilterTypes::LYRICS },
    { 1u << 8, engraving::ElementsSelectionFilterTypes::CHORD_SYMBOL },
    { 1u << 9, engraving::ElementsSelectionFilterTypes::OTHER_TEXT },
    { 1u << 10, engraving::ElementsSelectionFilterTypes::ARTICULATION },
    { 1u << 11, engraving::ElementsSelectionFilterTypes::ORNAMENT },
    { 1u << 12, engraving::ElementsSelectionFilterTypes::SLUR },
    { 1u << 12, engraving::ElementsSelectionFilterTypes::TIE },
    { 1u << 13, engraving::ElementsSelectionFilterTypes::FIGURED_BASS },
    { 1u << 14, engraving::ElementsSelectionFilterTypes::OTTAVA },
    { 1u << 15, engraving::ElementsSelectionFilterTypes::PEDAL_LINE },
    { 1u << 16, engraving::ElementsSelectionFilterTypes::OTHER_LINE },
    { 1u << 17, engraving::ElementsSelectionFilterTypes::ARPEGGIO },
    { 1u << 18, engraving::ElementsSelectionFilterTypes::GLISSANDO },
    { 1u << 19, engraving::ElementsSelectionFilterTypes::FRET_DIAGRAM },
    { 1u << 20, engraving::ElementsSelectionFilterTypes::BREATH },
    { 1u << 21, engraving::ElementsSelectionFilterTypes::TREMOLO },
    { 1u << 22, engraving::ElementsSelectionFilterTypes::GRACE_NOTE },
};

static const engraving::VoicesSelectionFilterTypes legacyVoiceBits[] = {
    engraving::VoicesSelectionFilterTypes::FIRST_VOICE, engraving::VoicesSelectionFilterTypes::SECOND_VOICE,
    engraving::VoicesSelectionFilterTypes::THIRD_VOICE, engraving::VoicesSelectionFilterTypes::FOURTH_VOICE,
};

static const engraving::NotesInChordSelectionFilterTypes notesInChordBits[] = {
    engraving::NotesInChordSelectionFilterTypes::TOP_NOTE, engraving::NotesInChordSelectionFilterTypes::SEVENTH_NOTE,
    engraving::NotesInChordSelectionFilterTypes::SIXTH_NOTE, engraving::NotesInChordSelectionFilterTypes::FIFTH_NOTE,
    engraving::NotesInChordSelectionFilterTypes::FOURTH_NOTE, engraving::NotesInChordSelectionFilterTypes::THIRD_NOTE,
    engraving::NotesInChordSelectionFilterTypes::SECOND_NOTE, engraving::NotesInChordSelectionFilterTypes::BOTTOM_NOTE,
};

// Progressive layout, as in 4.00: measures are counted without multimeasure-rest grouping
struct LayoutProgressInfo {
    int totalMeasures = 0;
    int laidOutMeasures = 0;
    int availablePages = 0;
    long long loadedUntilTick = -1;
    bool hasMorePages = false;
    bool isComplete = false;
};

static int layoutMeasureCount(Score* score)
{
    int count = 0;
    for (auto* measure = score->firstMeasure(); measure; measure = measure->nextMeasure()) ++count;
    return count;
}

static engraving::Measure* layoutMeasureAtIndex(Score* score, int measureIndex)
{
    int index = 0;
    for (auto* measure = score->firstMeasure(); measure && measureIndex >= 0; measure = measure->nextMeasure(), ++index) {
        if (index == measureIndex) return measure;
    }
    return nullptr;
}

static LayoutProgressInfo captureLayoutProgress(Score* score)
{
    LayoutProgressInfo info;
    info.totalMeasures = layoutMeasureCount(score);
    info.availablePages = static_cast<int>(score->npages());
    for (auto* measure = score->firstMeasure(); measure; measure = measure->nextMeasure()) {
        if (!measure->system()) continue;
        ++info.laidOutMeasures;
        info.loadedUntilTick = std::max(info.loadedUntilTick, static_cast<long long>((measure->tick() + measure->ticks()).ticks()));
    }
    info.hasMorePages = info.totalMeasures > info.laidOutMeasures;
    info.isComplete = !info.hasMorePages;
    return info;
}

static int layoutChunkMeasureCount(const LayoutProgressInfo& info)
{
    // Grow by roughly 6 pages at a time to avoid all-pages layout spikes
    constexpr int kTargetChunkPages = 6, kDefaultChunkMeasures = 24, kMinChunkMeasures = 12, kMaxChunkMeasures = 160;
    if (info.availablePages <= 0 || info.laidOutMeasures <= 0) return kDefaultChunkMeasures;
    const int pages = std::max(1, info.availablePages);
    return std::clamp((info.laidOutMeasures * kTargetChunkPages + pages - 1) / pages, kMinChunkMeasures, kMaxChunkMeasures);
}

static bool layoutScoreUntilPage(Score* score, int targetPage)
{
    targetPage = std::max(0, targetPage);
    int availablePages = static_cast<int>(score->npages());
    if (availablePages > targetPage) return true;
    const int totalMeasures = layoutMeasureCount(score);
    if (totalMeasures <= 0) {
        score->setLayoutAll();
        score->update();
        return static_cast<int>(score->npages()) > targetPage;
    }
    if (availablePages <= 0) {
        // Cold start: lay out a small prefix quickly for first paint
        if (auto* probe = layoutMeasureAtIndex(score, std::min(totalMeasures - 1, 7))) {
            score->doLayoutRange(Fraction(0, 1), probe->tick() + probe->ticks());
            availablePages = static_cast<int>(score->npages());
            if (availablePages > targetPage) return true;
        }
    }
    LayoutProgressInfo progress = captureLayoutProgress(score);
    int chunkMeasures = layoutChunkMeasureCount(progress);
    constexpr int kMaxChunkAttempts = 3;
    for (int attempts = 0; availablePages <= targetPage && attempts < kMaxChunkAttempts; ++attempts) {
        const int laidOut = std::max(0, progress.laidOutMeasures);
        if (laidOut >= totalMeasures) break;
        const int probeIndex = std::min(totalMeasures - 1, laidOut + chunkMeasures - 1);
        auto* probe = layoutMeasureAtIndex(score, probeIndex);
        if (!probe) break;
        score->doLayoutRange(Fraction(0, 1), probe->tick() + probe->ticks());
        availablePages = static_cast<int>(score->npages());
        if (availablePages > targetPage) return true;
        const LayoutProgressInfo next = captureLayoutProgress(score);
        if (next.laidOutMeasures <= progress.laidOutMeasures) {
            if (probeIndex >= totalMeasures - 1) break;
            chunkMeasures = std::min(totalMeasures, chunkMeasures * 2);
        } else {
            progress = next;
            chunkMeasures = layoutChunkMeasureCount(progress);
        }
    }
    return static_cast<int>(score->npages()) > targetPage;
}

extern "C" {

// Legacy 24-bit mask -> 4.7's voice / element / notes-in-chord filters (DECISIONS.md item 4).
// "Notes and rests" off turns every notes-in-chord filter, single notes and rests off (rests via the patch's includeRests).
EMSCRIPTEN_KEEPALIVE bool setSelectionFilter(uintptr_t score_ptr, int filterMask, int excerptId)
{
    if (filterMask < 0 || (static_cast<unsigned>(filterMask) & ~legacyfilter::ALL) != 0) {
        LOGW() << "setSelectionFilter: invalid mask " << filterMask;
        return false;
    }
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    const unsigned mask = static_cast<unsigned>(filterMask);
    engraving::SelectionFilter& filter = score->selectionFilter();
    for (size_t voice = 0; voice < 4; ++voice) {
        filter.setFiltered(legacyVoiceBits[voice], mask & (1u << voice));
    }
    for (const auto& [bit, type] : legacyElementBits) {
        filter.setFiltered(type, mask & bit);
    }
    // 4.7's notes-in-chord filters apply to multi-note chords only; single notes have their own switch
    const bool notes = mask & legacyfilter::NOTES_AND_RESTS;
    for (const auto type : notesInChordBits) {
        filter.setFiltered(type, notes);
    }
    filter.setIncludeSingleNotes(notes);
    filter.setIncludeRests(notes);   // 4.00's "notes and rests" bit also excluded rests (upstream patch adds the flag)
    score->selection().updateSelectedElements();
    return true;
}

// DECISIONS.md item 6: no caller; rasterise SVG in the browser if a PNG is ever needed
EMSCRIPTEN_KEEPALIVE const uint8_t* savePng(uintptr_t, int, bool, bool, int)
{
    return textResponse("PNG export is not supported by this engine; rasterise saveSvg output instead", 1);
}

EMSCRIPTEN_KEEPALIVE bool transpose(uintptr_t score_ptr, int mode, int direction, int key, int transposeInterval, bool trKeys,
                                    bool trChordNames, bool useDoubleSharpsFlats, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    const bool hadSelection = !score->selection().isNone();
    if (!hadSelection) {
        score->cmdSelectAll();
        if (score->selection().isNone()) {
            LOGW() << "transpose: score is empty";
            return false;
        }
    }
    // Transpose::transpose moves exactly the notes of a list selection, so transposing one note of a tie chain left the
    // tie joining two pitches (upDown, behind pitchUp/pitchDown, moves the chain). Add the rest of each chain first.
    std::vector<engraving::EngravingItem*> listed;
    if (score->selection().isList()) {
        for (engraving::EngravingItem* e : score->selection().uniqueElements()) listed.push_back(e);
        std::vector<engraving::EngravingItem*> chained;
        for (engraving::EngravingItem* e : listed) {
            if (!e->isNote()) continue;
            engraving::Note* n = engraving::toNote(e)->firstTiedNote();
            for (size_t guard = 0; n && guard < 4096; ++guard) {
                if (!n->selected()) chained.push_back(n);
                n = n->tieFor() ? n->tieFor()->endNote() : nullptr;
            }
        }
        for (engraving::EngravingItem* e : chained) score->select(e, engraving::SelectType::ADD);
    }
    score->startCmd(TranslatableString::untranslatable("transpose"));
    // 4.7 moved Score::transpose to the static Transpose::transpose; the mode/direction/key values are unchanged
    const bool ok = engraving::Transpose::transpose(score, static_cast<engraving::TransposeMode>(mode),
                                                    static_cast<engraving::TransposeDirection>(direction),
                                                    static_cast<engraving::Key>(key), transposeInterval, trKeys, trChordNames,
                                                    useDoubleSharpsFlats);
    score->endCmd();
    if (!hadSelection) {
        score->deselectAll();
        score->setSelectionChanged(true);
    } else if (!listed.empty() && score->selection().uniqueElements().size() != listed.size()) {
        // Give the user back the notes they selected, not the chains added for the transpose
        score->deselectAll();
        for (engraving::EngravingItem* e : listed) score->select(e, engraving::SelectType::ADD);
        score->setSelectionChanged(true);
    }
    layoutLinked(score);
    return ok;
}

EMSCRIPTEN_KEEPALIVE bool layoutUntilPage(uintptr_t score_ptr, int targetPage, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    return score && layoutScoreUntilPage(score, targetPage);
}

EMSCRIPTEN_KEEPALIVE const uint8_t* layoutUntilPageState(uintptr_t score_ptr, int targetPage, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return textResponse("Invalid score or excerpt", 1);
    targetPage = std::max(0, targetPage);
    const bool satisfied = layoutScoreUntilPage(score, targetPage);
    const LayoutProgressInfo info = captureLayoutProgress(score);
    JsonObject json;
    json.set("targetPage", targetPage);
    json.set("targetSatisfied", satisfied);
    json.set("availablePages", info.availablePages);
    json.set("totalMeasures", info.totalMeasures);
    json.set("laidOutMeasures", info.laidOutMeasures);
    json.set("loadedUntilTick", static_cast<double>(info.loadedUntilTick));
    json.set("hasMorePages", info.hasMorePages);
    json.set("isComplete", info.isComplete);
    return response(JsonDocument(json).toJson(JsonDocument::Format::Compact));
}

} // extern "C"
