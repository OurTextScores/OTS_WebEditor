// SPDX-License-Identifier: GPL-3.0-only
#pragma once
// Ported from webmscore-fork/web/main.cpp.
#include <set>
namespace engraving = mu::engraving;
static std::vector<engraving::Note*> selectedNormalNotes(MasterScore* score)
{
    std::vector<engraving::Note*> notes;
    for (auto* note : score->selection().noteList()) {
        if (note && note->chord() && !note->chord()->isGrace()) {
            notes.push_back(note);
        }
    }
    std::sort(notes.begin(), notes.end(), [](const engraving::Note* left, const engraving::Note* right) {
        const auto* leftChord = left->chord();
        const auto* rightChord = right->chord();
        if (leftChord->tick() != rightChord->tick()) {
            return leftChord->tick() < rightChord->tick();
        }
        if (leftChord->track() != rightChord->track()) {
            return leftChord->track() < rightChord->track();
        }
        return left->pitch() < right->pitch();
    });
    return notes;
}

static std::vector<engraving::ChordRest*> selectedChordRests(MasterScore* score)
{
    std::set<engraving::ChordRest*> uniqueChordRests;
    const auto& selection = score->selection();

    if (selection.isRange()) {
        auto* startSegment = selection.startSegment();
        auto* endSegment = selection.endSegment();
        for (auto* segment = startSegment; segment && segment != endSegment; segment = segment->next1()) {
            if (segment->segmentType() != engraving::SegmentType::ChordRest) {
                continue;
            }
            for (auto staffIdx = selection.staffStart(); staffIdx < selection.staffEnd(); ++staffIdx) {
                for (int voice = 0; voice < engraving::VOICES; ++voice) {
                    auto* item = segment->element(staffIdx * engraving::VOICES + voice);
                    if (item && item->isChordRest()) {
                        uniqueChordRests.insert(engraving::toChordRest(item));
                    }
                }
            }
        }
    } else {
        for (auto* item : selection.elements()) {
            if (!item) {
                continue;
            }
            if (item->isNote()) {
                item = engraving::toNote(item)->chord();
            }
            if (item->isChordRest()) {
                uniqueChordRests.insert(engraving::toChordRest(item));
            }
        }
        if (uniqueChordRests.empty() && selection.cr()) {
            uniqueChordRests.insert(selection.cr());
        }
    }

    std::vector<engraving::ChordRest*> chordRests(uniqueChordRests.begin(), uniqueChordRests.end());
    std::sort(chordRests.begin(), chordRests.end(), [](const auto* left, const auto* right) {
        if (left->tick() != right->tick()) {
            return left->tick() < right->tick();
        }
        return left->track() < right->track();
    });
    return chordRests;
}

static std::vector<engraving::Chord*> selectedChords(MasterScore* score, bool requireMultipleNotes)
{
    std::vector<engraving::Chord*> chords;
    for (auto* chordRest : selectedChordRests(score)) {
        if (!chordRest->isChord()) {
            continue;
        }
        auto* chord = engraving::toChord(chordRest);
        if (!requireMultipleNotes || chord->notes().size() >= 2) {
            chords.push_back(chord);
        }
    }
    return chords;
}

