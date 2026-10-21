#pragma once
// Spanner and chord tools: slur, tie, grace notes, tuplets, tremolos, glissandos, pedals, ambitus and the
// range tools (explode, implode, regroup rhythms, resequence rehearsal marks). Ported from the 4.00 bridge
// (web/main.cpp); differences are commented where 4.7 changed the engine API.

#include "engraving/dom/ambitus.h"
#include "engraving/dom/factory.h"
#include "engraving/dom/glissando.h"
#include "engraving/dom/measure.h"
#include "engraving/dom/navigate.h"
#include "engraving/dom/part.h"
#include "engraving/dom/pedal.h"
#include "engraving/dom/rehearsalmark.h"
#include "engraving/dom/segment.h"
#include "engraving/dom/spanner.h"
#include "engraving/dom/staff.h"
#include "engraving/dom/tremolosinglechord.h"
#include "engraving/dom/tremolotwochord.h"
#include "engraving/dom/tuplet.h"

static engraving::staff_idx_t resolvePedalStaffIdx(engraving::Score* score, engraving::staff_idx_t staffIdx, const engraving::Fraction& tick)
{
    if (!score || staffIdx == muse::nidx) {
        return staffIdx;
    }
    auto* staff = score->staff(staffIdx);
    if (!staff || !staff->part() || staff->part()->nstaves() <= 1) {
        return staffIdx;
    }
    const auto familyId = staff->part()->familyId();
    const auto instrumentId = staff->part()->instrumentId(tick);
    const bool isKeyboardFamily = familyId == String(u"keyboard") || familyId == String(u"keyboards");
    const bool isPianoLike = instrumentId.contains(u"piano", muse::CaseInsensitive)
        || instrumentId.contains(u"keyboard", muse::CaseInsensitive);
    if (!isKeyboardFamily && !isPianoLike) {
        return staffIdx;
    }
    const auto& staves = staff->part()->staves();
    if (staves.empty()) {
        return staffIdx;
    }
    return score->staffIdx(staves.back());
}

static engraving::Pedal* findPedalAtTick(engraving::Score* score, engraving::staff_idx_t staffIdx, const engraving::Fraction& tick)
{
    if (!score) {
        return nullptr;
    }
    const auto& spanners = score->spannerMap().findOverlapping(tick.ticks(), tick.ticks());
    for (const auto& interval : spanners) {
        auto* spanner = interval.value;
        if (!spanner || !spanner->isPedal()) {
            continue;
        }
        if (spanner->staffIdx() != staffIdx) {
            continue;
        }
        return engraving::toPedal(spanner);
    }
    return nullptr;
}

struct PedalSelectionRange {
    engraving::staff_idx_t staffIdx = 0;
    engraving::Segment* startSeg = nullptr;
    engraving::Segment* endSeg = nullptr;
};

static bool resolvePedalSelectionRange(MasterScore* score, PedalSelectionRange& out, const char* logPrefix)
{
    const auto& selection = score->selection();
    if (selection.isNone()) {
        LOGW() << logPrefix << ": no selection";
        return false;
    }

    engraving::staff_idx_t staffIdx = 0;
    engraving::Segment* startSeg = nullptr;
    engraving::Segment* endSeg = nullptr;

    if (selection.isRange()) {
        staffIdx = selection.staffStart();
        startSeg = selection.startSegment();
        endSeg = selection.endSegment();
    } else {
        auto activeTrack = selection.activeTrack();
        if (activeTrack == muse::nidx) {
            activeTrack = 0;
        }
        staffIdx = activeTrack / engraving::VOICES;
        const auto track = engraving::staff2track(staffIdx, 0);

        engraving::ChordRest* first = selection.firstChordRest(track);
        engraving::ChordRest* last = selection.lastChordRest(track);
        if (!first) {
            first = selection.firstChordRest();
            last = selection.lastChordRest();
        }
        if (!first) {
            auto* element = selection.element();
            if (element && element->isNote()) {
                element = engraving::toNote(element)->chord();
            }
            if (element && element->isChordRest()) {
                first = engraving::toChordRest(element);
                last = first;
            }
        }
        if (!first) {
            LOGW() << logPrefix << ": no chord/rest selection";
            return false;
        }

        startSeg = first->segment();
        if (last && last != first) {
            endSeg = last->segment();
        } else {
            auto* next = engraving::nextChordRest(first);
            if (next && next->measure() == first->measure()) {
                endSeg = next->segment();
            } else {
                endSeg = startSeg;
            }
        }
    }

    if (!startSeg) {
        LOGW() << logPrefix << ": missing start segment";
        return false;
    }

    out.staffIdx = resolvePedalStaffIdx(score, staffIdx, startSeg->tick());
    out.startSeg = startSeg;
    out.endSeg = endSeg;
    return true;
}

static engraving::ChordRest* findChordRestAtSegment(engraving::Segment* segment, engraving::staff_idx_t staffIdx)
{
    if (!segment) {
        return nullptr;
    }
    for (engraving::voice_idx_t voice = 0; voice < engraving::VOICES; ++voice) {
        const auto track = engraving::staff2track(staffIdx, voice);
        auto* cr = segment->cr(track);
        if (cr) {
            return cr;
        }
    }
    return nullptr;
}

static bool resolvePedalTextAnchor(MasterScore* score, engraving::ChordRest*& outCr, const char* logPrefix)
{
    const auto& selection = score->selection();
    if (selection.isNone()) {
        LOGW() << logPrefix << ": no selection";
        return false;
    }

    engraving::Segment* segment = selection.startSegment();
    engraving::ChordRest* baseCr = selection.activeCR();
    if (!segment && baseCr) {
        segment = baseCr->segment();
    }
    if (!segment) {
        baseCr = selection.currentCR();
        if (!baseCr) {
            baseCr = selection.firstChordRest();
        }
        if (baseCr) {
            segment = baseCr->segment();
        }
    }
    if (!segment) {
        LOGW() << logPrefix << ": no segment for selection";
        return false;
    }

    engraving::staff_idx_t staffIdx = selection.staffStart();
    if (!selection.isRange()) {
        const auto activeTrack = baseCr ? baseCr->track() : selection.activeTrack();
        if (activeTrack != muse::nidx) {
            staffIdx = activeTrack / engraving::VOICES;
        }
    }
    staffIdx = resolvePedalStaffIdx(score, staffIdx, segment->tick());

    auto* anchorSeg = score->tick2segment(segment->tick(), true, engraving::SegmentType::ChordRest, false);
    if (!anchorSeg) {
        anchorSeg = segment;
    }
    outCr = findChordRestAtSegment(anchorSeg, staffIdx);
    if (!outCr) {
        LOGW() << logPrefix << ": no chord/rest at selection";
        return false;
    }
    return true;
}

static bool applyTextMarkup(MasterScore* score, engraving::TextStyleType style, engraving::ChordRest* target, const String& xmlText, const char* logPrefix)
{
    if (!target) {
        LOGW() << logPrefix << ": no target for text";
        return false;
    }

    score->startCmd(TranslatableString::untranslatable("applyTextMarkup"));
    engraving::TextBase* textItem = score->addText(style, target);
    if (!textItem) {
        score->endCmd();
    score->doLayout();
        LOGW() << logPrefix << ": failed to create text";
        return false;
    }
    textItem->undoChangeProperty(engraving::Pid::TEXT, xmlText);
    score->endCmd();
    score->doLayout();
    return true;
}

extern "C" {

EMSCRIPTEN_KEEPALIVE bool addSlur(uintptr_t score_ptr, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    const auto& sel = score->selection();
    auto selected = sel.uniqueElements();

    if (selected.empty()) {
        LOGW() << "addSlur: no elements selected";
        return false;
    }

    bool added = false;
    score->startCmd(TranslatableString::untranslatable("addSlur"));

    if (sel.isRange()) {
        mu::engraving::track_idx_t startTrack = sel.staffStart() * mu::engraving::VOICES;
        mu::engraving::track_idx_t endTrack = sel.staffEnd() * mu::engraving::VOICES;
        for (mu::engraving::track_idx_t track = startTrack; track < endTrack; ++track) {
            mu::engraving::ChordRest* firstChordRest = nullptr;
            mu::engraving::ChordRest* secondChordRest = nullptr;

            for (mu::engraving::EngravingItem* e : selected) {
                if (!e || e->track() != track) {
                    continue;
                }
                if (e->isNote()) {
                    e = mu::engraving::toNote(e)->chord();
                }
                if (!e->isChord()) {
                    continue;
                }
                mu::engraving::ChordRest* cr = mu::engraving::toChordRest(e);
                if (!firstChordRest || firstChordRest->tick() > cr->tick()) {
                    firstChordRest = cr;
                }
                if (!secondChordRest || secondChordRest->tick() < cr->tick()) {
                    secondChordRest = cr;
                }
            }

            if (firstChordRest && (firstChordRest != secondChordRest)) {
                score->addSlur(firstChordRest, secondChordRest, nullptr);
                added = true;
            }
        }
    } else {
        mu::engraving::ChordRest* firstChordRest = nullptr;
        mu::engraving::ChordRest* secondChordRest = nullptr;

        for (mu::engraving::EngravingItem* e : selected) {
            if (!e) {
                continue;
            }
            if (e->isNote()) {
                e = mu::engraving::toNote(e)->chord();
            }
            if (!e->isChord()) {
                continue;
            }
            mu::engraving::ChordRest* cr = mu::engraving::toChordRest(e);
            if (!firstChordRest || cr->isBefore(firstChordRest)) {
                firstChordRest = cr;
            }
            if (!secondChordRest || secondChordRest->isBefore(cr)) {
                secondChordRest = cr;
            }
        }

        if (firstChordRest == secondChordRest) {
            secondChordRest = mu::engraving::nextChordRest(firstChordRest);
        }

        if (firstChordRest && secondChordRest && firstChordRest != secondChordRest) {
            score->addSlur(firstChordRest, secondChordRest, nullptr);
            added = true;
        } else {
            LOGW() << "addSlur: unable to determine slur endpoints";
        }
    }

    score->endCmd();
    score->doLayout();
    return added;
}

EMSCRIPTEN_KEEPALIVE bool addTie(uintptr_t score_ptr, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    const auto noteList = engraving::Score::cmdTieNoteList(score->selection(), score->noteEntryMode());
    if (noteList.empty()) {
        LOGW() << "addTie: no notes selected";
        return false;
    }

    // Score::cmdAddTie manages startCmd/endCmd internally.
    score->cmdAddTie(false);
    score->doLayout();
    return true;
}

EMSCRIPTEN_KEEPALIVE bool addGraceNote(uintptr_t score_ptr, int graceType, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    if (score->selection().isNone()) {
        LOGW() << "addGraceNote: no selection";
        return false;
    }

    const auto type = static_cast<engraving::NoteType>(graceType);
    int denominator = 1;
    switch (type) {
    case engraving::NoteType::GRACE4:
    case engraving::NoteType::INVALID:
    case engraving::NoteType::NORMAL:
        denominator = 1;
        break;
    case engraving::NoteType::ACCIACCATURA:
    case engraving::NoteType::APPOGGIATURA:
    case engraving::NoteType::GRACE8_AFTER:
        denominator = 2;
        break;
    case engraving::NoteType::GRACE16:
    case engraving::NoteType::GRACE16_AFTER:
        denominator = 4;
        break;
    case engraving::NoteType::GRACE32:
    case engraving::NoteType::GRACE32_AFTER:
        denominator = 8;
        break;
    default:
        LOGW() << "addGraceNote: unsupported grace type " << graceType;
        return false;
    }

    score->startCmd(TranslatableString::untranslatable("addGraceNote"));
    score->cmdAddGrace(type, engraving::Constants::DIVISION / denominator);
    score->endCmd();
    score->doLayout();
    return true;
}

EMSCRIPTEN_KEEPALIVE bool addTuplet(uintptr_t score_ptr, int tupletCount, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    if (tupletCount < 2) {
        LOGW() << "addTuplet: invalid tuplet count " << tupletCount;
        return false;
    }

    const auto chordRests = score->getSelectedChordRests();
    if (chordRests.empty()) {
        LOGW() << "addTuplet: no chord/rest selected";
        return false;
    }

    std::vector<engraving::ChordRest*> eligible;
    for (engraving::ChordRest* chordRest : chordRests) {
        if (!chordRest || chordRest->isGrace()) {
            continue;
        }
        if (chordRest->durationType() < engraving::TDuration(engraving::DurationType::V_512TH)
            && chordRest->durationType() != engraving::TDuration(engraving::DurationType::V_MEASURE)) {
            LOGW() << "addTuplet: note value too short";
            return false;
        }
        eligible.push_back(chordRest);
    }

    if (eligible.empty()) {
        LOGW() << "addTuplet: no eligible chord/rests selected";
        return false;
    }

    bool added = false;
    score->startCmd(TranslatableString::untranslatable("addTuplet"));
    for (engraving::ChordRest* chordRest : eligible) {
        engraving::Fraction ratio(tupletCount, 2);
        ratio.setDenominator(chordRest->dots() ? 3 : 2);
        while (ratio.numerator() >= ratio.denominator() * 2) {
            ratio.setDenominator(ratio.denominator() * 2);
        }
        if (score->addTuplet(chordRest, ratio, engraving::TupletNumberType::SHOW_NUMBER, engraving::TupletBracketType::AUTO_BRACKET)) {
            added = true;
        }
    }
    score->endCmd();
    score->doLayout();
    return added;
}

EMSCRIPTEN_KEEPALIVE bool addTremolo(uintptr_t score_ptr, int tremoloType, int excerptId)
{
    if (tremoloType < static_cast<int>(engraving::TremoloType::R8)
        || tremoloType > static_cast<int>(engraving::TremoloType::C64)) {
        LOGW() << "addTremolo: invalid type " << tremoloType;
        return false;
    }
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    const bool twoNoteTremolo = tremoloType >= static_cast<int>(engraving::TremoloType::C8);
    const auto chords = selectedChords(score, false);
    if (chords.empty()) {
        LOGW() << "addTremolo: no chord selection";
        return false;
    }

    if (twoNoteTremolo) {
        if (chords.size() != 2 || chords[0]->track() != chords[1]->track()
            || chords[0]->ticks() != chords[1]->ticks()) {
            LOGW() << "addTremolo: select exactly two equal-duration chords in the same voice";
            return false;
        }
        auto* segment = chords[0]->segment()->next();
        while (segment && (!segment->element(chords[0]->track()) || !segment->element(chords[0]->track())->isChord())) {
            segment = segment->next();
        }
        if (!segment || segment->element(chords[0]->track()) != chords[1]) {
            LOGW() << "addTremolo: selected chords must be consecutive in the same voice";
            return false;
        }
    }

    score->startCmd(TranslatableString::untranslatable("addTremolo"));
    const auto applyTremolo = [tremoloType](engraving::Chord* chord) {
        // 4.4 split Tremolo into single-chord and two-chord elements; the TremoloType values are unchanged.
        const auto type = static_cast<engraving::TremoloType>(tremoloType);
        engraving::EngravingItem* tremolo = nullptr;
        if (engraving::isTremoloTwoChord(type)) {
            auto* twoChord = engraving::Factory::createTremoloTwoChord(chord);
            twoChord->setTremoloType(type);
            tremolo = twoChord;
        } else {
            auto* singleChord = engraving::Factory::createTremoloSingleChord(chord);
            singleChord->setTremoloType(type);
            tremolo = singleChord;
        }
        engraving::EditData editData;
        editData.dropElement = tremolo;
        chord->drop(editData);
    };
    if (twoNoteTremolo) {
        applyTremolo(chords.front());
    } else {
        for (auto* chord : chords) {
            applyTremolo(chord);
        }
    }
    score->endCmd();
    score->doLayout();
    return true;
}

EMSCRIPTEN_KEEPALIVE bool addGlissando(uintptr_t score_ptr, int glissandoType, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    if (glissandoType < static_cast<int>(engraving::GlissandoType::STRAIGHT)
        || glissandoType > static_cast<int>(engraving::GlissandoType::WAVY)) {
        LOGW() << "addGlissando: invalid glissando type " << glissandoType;
        return false;
    }

    const auto notes = selectedNormalNotes(score);
    if (notes.size() != 2) {
        LOGW() << "addGlissando: select exactly two notes";
        return false;
    }

    auto* startNote = notes.front();
    auto* endNote = notes.back();
    auto* startChord = startNote->chord();
    auto* endChord = endNote->chord();
    if (!startChord || !endChord || startChord->tick() >= endChord->tick()
        || startChord->staffIdx() != endChord->staffIdx()) {
        LOGW() << "addGlissando: notes must be ordered on the same staff";
        return false;
    }
    const bool alreadyHasGlissando = std::any_of(startNote->spannerFor().begin(), startNote->spannerFor().end(), [](const auto* spanner) {
        return spanner && spanner->isGlissando();
    });
    if (alreadyHasGlissando) {
        LOGW() << "addGlissando: start note already has a glissando";
        return false;
    }

    auto* glissando = engraving::Factory::createGlissando(startNote);
    if (!glissando) {
        LOGW() << "addGlissando: Factory returned null";
        return false;
    }
    glissando->setGlissandoType(static_cast<engraving::GlissandoType>(glissandoType));
    glissando->setAnchor(engraving::Spanner::Anchor::NOTE);
    glissando->setStartElement(startNote);
    glissando->setEndElement(endNote);
    glissando->setTick(startChord->tick());
    glissando->setTick2(endChord->tick());
    glissando->setTrack(startNote->track());
    glissando->setTrack2(endNote->track());
    glissando->setParent(startNote);

    score->startCmd(TranslatableString::untranslatable("addGlissando"));
    score->undoAddElement(glissando);
    score->endCmd();
    score->doLayout();
    return true;
}

EMSCRIPTEN_KEEPALIVE bool addPedal(uintptr_t score_ptr, int pedalVariant, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    PedalSelectionRange selectionRange;
    if (!resolvePedalSelectionRange(score, selectionRange, "addPedal")) {
        return false;
    }

    auto* pedal = engraving::Factory::createPedal(score->dummy());
    if (!pedal) {
        LOGW() << "addPedal: Factory returned null";
        return false;
    }

    pedal->setBeginText(engraving::Pedal::PEDAL_SYMBOL);

    if (pedalVariant == 1) {
        pedal->setLineVisible(false);
        pedal->setEndText(engraving::Pedal::STAR_SYMBOL);
        pedal->setEndHookType(engraving::HookType::NONE);
    } else {
        pedal->setLineVisible(true);
        pedal->setEndHookType(engraving::HookType::HOOK_90);
    }

    score->startCmd(TranslatableString::untranslatable("addPedal"));
    score->cmdAddSpanner(pedal, selectionRange.staffIdx, selectionRange.startSeg, selectionRange.endSeg);
    score->endCmd();
    score->doLayout();
    return true;
}

EMSCRIPTEN_KEEPALIVE bool addSostenutoPedal(uintptr_t score_ptr, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    PedalSelectionRange selectionRange;
    if (!resolvePedalSelectionRange(score, selectionRange, "addSostenutoPedal")) {
        return false;
    }

    auto* pedal = engraving::Factory::createPedal(score->dummy());
    if (!pedal) {
        LOGW() << "addSostenutoPedal: Factory returned null";
        return false;
    }

    pedal->setLineVisible(true);
    pedal->setBeginText(String(u"<sym>keyboardPedalSost</sym>"));
    pedal->setContinueText(String(u"<sym>keyboardPedalParensLeft</sym><sym>keyboardPedalSost</sym><sym>keyboardPedalParensRight</sym>"));
    pedal->setEndHookType(engraving::HookType::HOOK_90);

    score->startCmd(TranslatableString::untranslatable("addSostenutoPedal"));
    score->cmdAddSpanner(pedal, selectionRange.staffIdx, selectionRange.startSeg, selectionRange.endSeg);
    score->endCmd();
    score->doLayout();
    return true;
}

EMSCRIPTEN_KEEPALIVE bool addUnaCorda(uintptr_t score_ptr, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    engraving::ChordRest* anchor = nullptr;
    if (!resolvePedalTextAnchor(score, anchor, "addUnaCorda")) {
        return false;
    }

    const String xmlText = engraving::TextBase::plainToXmlText(String(u"una corda"));
    return applyTextMarkup(
        score,
        engraving::TextStyleType::EXPRESSION,
        anchor,
        xmlText,
        "addUnaCorda"
    );
}

EMSCRIPTEN_KEEPALIVE bool splitPedal(uintptr_t score_ptr, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    const auto& selection = score->selection();
    if (selection.isNone()) {
        LOGW() << "splitPedal: no selection";
        return false;
    }

    engraving::Segment* splitSeg = selection.startSegment();
    engraving::ChordRest* splitCr = selection.activeCR();
    if (!splitSeg && splitCr) {
        splitSeg = splitCr->segment();
    }
    if (!splitSeg) {
        splitCr = selection.currentCR();
        if (!splitCr) {
            splitCr = selection.firstChordRest();
        }
        if (splitCr) {
            splitSeg = splitCr->segment();
        }
    }

    if (!splitSeg) {
        LOGW() << "splitPedal: no segment for selection";
        return false;
    }

    const auto splitTick = splitSeg->tick();
    engraving::staff_idx_t staffIdx = selection.staffStart();
    if (!selection.isRange()) {
        const auto activeTrack = splitCr ? splitCr->track() : selection.activeTrack();
        if (activeTrack != muse::nidx) {
            staffIdx = activeTrack / engraving::VOICES;
        }
    }
    staffIdx = resolvePedalStaffIdx(score, staffIdx, splitTick);

    auto* pedal = findPedalAtTick(score, staffIdx, splitTick);
    if (!pedal) {
        LOGW() << "splitPedal: no pedal spanner at selection";
        return false;
    }
    if (!pedal->lineVisible()) {
        LOGW() << "splitPedal: pedal line not visible";
        return false;
    }
    if (splitTick <= pedal->tick() || splitTick >= pedal->tick2()) {
        LOGW() << "splitPedal: selection outside pedal range";
        return false;
    }

    auto* startSeg = pedal->startSegment();
    auto* endSeg = pedal->endSegment();
    if (!startSeg) {
        startSeg = score->tick2segment(pedal->tick(), true, engraving::SegmentType::ChordRest, false);
    }
    if (!endSeg) {
        endSeg = score->tick2segment(pedal->tick2(), true, engraving::SegmentType::ChordRest, false);
    }
    if (!startSeg || !endSeg) {
        LOGW() << "splitPedal: unable to resolve pedal endpoints";
        return false;
    }
    if (splitSeg->tick() <= startSeg->tick() || splitSeg->tick() >= endSeg->tick()) {
        LOGW() << "splitPedal: split point outside pedal span";
        return false;
    }

    auto* leftPedal = engraving::Factory::createPedal(score->dummy());
    auto* rightPedal = engraving::Factory::createPedal(score->dummy());
    if (!leftPedal || !rightPedal) {
        LOGW() << "splitPedal: Factory returned null";
        return false;
    }

    leftPedal->setLineVisible(true);
    rightPedal->setLineVisible(true);
    leftPedal->setBeginText(pedal->beginText());
    leftPedal->setContinueText(pedal->continueText());
    leftPedal->setEndText(pedal->endText());
    rightPedal->setContinueText(pedal->continueText());
    rightPedal->setEndText(pedal->endText());

    leftPedal->setBeginHookType(pedal->beginHookType());
    leftPedal->setEndHookType(engraving::HookType::HOOK_45);
    rightPedal->setBeginHookType(engraving::HookType::HOOK_45);
    rightPedal->setEndHookType(pedal->endHookType());

    score->startCmd(TranslatableString::untranslatable("splitPedal"));
    score->undoRemoveElement(pedal);
    score->cmdAddSpanner(leftPedal, staffIdx, startSeg, splitSeg);
    score->cmdAddSpanner(rightPedal, staffIdx, splitSeg, endSeg);
    score->endCmd();
    score->doLayout();
    return true;
}

EMSCRIPTEN_KEEPALIVE bool addAmbitus(uintptr_t score_ptr, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    auto* chordRest = score->selection().cr();
    if (!chordRest) chordRest = score->selection().firstChordRest();
    if (!chordRest || !chordRest->measure()) return false;
    auto* measure = chordRest->measure();
    const auto track = engraving::trackZeroVoice(chordRest->track());

    score->startCmd(TranslatableString::untranslatable("addAmbitus"));
    auto* segment = measure->getSegment(engraving::SegmentType::Ambitus, measure->tick());
    if (!segment || segment->element(track)) {
        score->endCmd(true);
        return false;
    }
    auto* ambitus = engraving::Factory::createAmbitus(segment);
    if (!ambitus) {
        score->endCmd(true);
        return false;
    }
    ambitus->setParent(segment);
    ambitus->setTrack(track);
    score->undoAddElement(ambitus);
    score->endCmd();
    score->doLayout();
    score->select(ambitus, engraving::SelectType::SINGLE, ambitus->staffIdx());
    return true;
}

EMSCRIPTEN_KEEPALIVE bool explodeSelection(uintptr_t score_ptr, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    if (!score->selection().isRange()) return false;
    score->startCmd(TranslatableString::untranslatable("explodeSelection"));
    score->cmdExplode();
    score->endCmd();
    score->doLayout();
    return true;
}

EMSCRIPTEN_KEEPALIVE bool implodeSelection(uintptr_t score_ptr, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    if (!score->selection().isRange()) return false;
    score->startCmd(TranslatableString::untranslatable("implodeSelection"));
    score->cmdImplode();
    score->endCmd();
    score->doLayout();
    return true;
}

EMSCRIPTEN_KEEPALIVE bool regroupSelection(uintptr_t score_ptr, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    if (!score->selection().isRange()) return false;
    // Unlike 4.00, 4.7's cmdResetNoteAndRestGroupings does not open an undo command
    score->startCmd(TranslatableString::untranslatable("regroupSelection"));
    score->cmdResetNoteAndRestGroupings();
    score->endCmd();
    score->doLayout();
    return true;
}

EMSCRIPTEN_KEEPALIVE bool resequenceRehearsalMarks(uintptr_t score_ptr, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    if (!score->selection().isRange()) return false;
    std::vector<engraving::RehearsalMark*> rehearsalMarks;
    for (auto* segment = score->selection().startSegment(); segment && segment != score->selection().endSegment(); segment = segment->next1()) {
        for (auto* annotation : segment->annotations()) {
            if (annotation && annotation->isRehearsalMark()) rehearsalMarks.push_back(toRehearsalMark(annotation));
        }
    }
    if (rehearsalMarks.size() < 2) return false;

    // MusicXML imports can leave an empty formatting tag in xmlText (for example
    // "<b></b>A"), which prevents Score::nextRehearsalMarkText() from detecting
    // an otherwise ordinary alphabetic sequence. Sequence from visible text so
    // the tool behaves consistently for native and imported scores.
    auto nextText = [](engraving::RehearsalMark* previous, engraving::RehearsalMark* current) {
        const String previousText = previous->plainText().trimmed();
        const String fallback = current->plainText().trimmed();
        if (previousText.size() == 1 && previousText.at(0).isLetter()) {
            if (previousText == "Z") return String(u"AA");
            if (previousText == "z") return String(u"aa");
            return String(Char::fromAscii(previousText.at(0).toAscii() + 1));
        }
        if (previousText.size() == 2 && previousText.at(0).isLetter() && previousText.at(1).isLetter()
            && previousText.at(0) == previousText.at(1) && previousText.toUpper() != "ZZ") {
            const String c = Char::fromAscii(previousText.at(0).toAscii() + 1);
            return c + c;
        }
        bool ok = false;
        int number = previousText.toInt(&ok);
        if (!ok) return fallback;
        if (number == previous->segment()->measure()->no() + 1) number = current->segment()->measure()->no() + 1;
        else ++number;
        return String::number(number);
    };

    score->startCmd(TranslatableString::untranslatable("resequenceRehearsalMarks"));
    for (size_t index = 1; index < rehearsalMarks.size(); ++index) {
        auto* current = rehearsalMarks[index];
        current->undoChangeProperty(engraving::Pid::TEXT, nextText(rehearsalMarks[index - 1], current));
    }
    score->endCmd();
    score->doLayout();
    return true;
}

} // extern "C"
