// SPDX-License-Identifier: GPL-3.0-only
#pragma once
// Adapted from the OTS 4.00 bridge.
#include "engraving/dom/timesig.h"
#include "engraving/dom/clef.h"
#include "engraving/dom/keysig.h"
#include "engraving/dom/tempotext.h"
#include "engraving/dom/articulation.h"
#include "engraving/dom/rehearsalmark.h"
#include "engraving/dom/utils.h"
#include "engraving/editing/addremoveelement.h"
extern "C" {
EMSCRIPTEN_KEEPALIVE bool setTimeSignature(uintptr_t score_ptr, int numerator, int denominator, int excerptId)
{
    auto* score=getScore(score_ptr, excerptId);
    if(!score) return false;
    if (numerator <= 0 || denominator <= 0) {
        LOGW() << "setTimeSignature: invalid fraction " << numerator << "/" << denominator;
        return false;
    }

    // If a chord/rest is selected, start the change at that measure.
    // Otherwise, apply globally at the start of the score (current behaviour).
    engraving::Measure* targetMeasure = nullptr;
    if (auto cr = score->selection().cr()) {
        targetMeasure = cr->measure();
        if (!targetMeasure) {
            targetMeasure = score->tick2measure(cr->tick());
        }
    }
    if (!targetMeasure) {
        // Use first real measure (MeasureBase list may start with frames)
        targetMeasure = score->firstMeasure();
    }
    if (!targetMeasure) {
        LOGW() << "setTimeSignature: no measures in score";
        return false;
    }

    // Create new TimeSig from dummy segment; cmdAddTimeSig will attach/copy it.
    engraving::Segment* dummySeg = score->dummy()->segment();
    auto ts = engraving::Factory::createTimeSig(dummySeg);
    if (!ts) {
        LOGW() << "setTimeSignature: Factory returned null";
        return false;
    }
    ts->setSig(engraving::Fraction(numerator, denominator));

    score->startCmd(TranslatableString::untranslatable("set Time Signature"));
    score->cmdAddTimeSig(targetMeasure, 0, ts, /*local*/ false);
    score->endCmd();
    layoutLinked(score);
    return true;
}

EMSCRIPTEN_KEEPALIVE bool setTimeSignatureWithType(uintptr_t score_ptr, int numerator, int denominator, int timeSigType, int excerptId)
{
    auto* score=getScore(score_ptr, excerptId);
    if(!score) return false;
    if (numerator <= 0 || denominator <= 0) {
        LOGW() << "setTimeSignatureWithType: invalid fraction " << numerator << "/" << denominator;
        return false;
    }

    engraving::Measure* targetMeasure = nullptr;
    if (auto cr = score->selection().cr()) {
        targetMeasure = cr->measure();
        if (!targetMeasure) {
            targetMeasure = score->tick2measure(cr->tick());
        }
    }
    if (!targetMeasure) {
        targetMeasure = score->firstMeasure();
    }
    if (!targetMeasure) {
        LOGW() << "setTimeSignatureWithType: no measures in score";
        return false;
    }

    engraving::Segment* dummySeg = score->dummy()->segment();
    auto ts = engraving::Factory::createTimeSig(dummySeg);
    if (!ts) {
        LOGW() << "setTimeSignatureWithType: Factory returned null";
        return false;
    }

    auto type = engraving::TimeSigType::NORMAL;
    const int minType = static_cast<int>(engraving::TimeSigType::NORMAL);
    const int maxType = static_cast<int>(engraving::TimeSigType::CUT_TRIPLE);
    if (timeSigType >= minType && timeSigType <= maxType) {
        type = static_cast<engraving::TimeSigType>(timeSigType);
    }
    ts->setSig(engraving::Fraction(numerator, denominator), type);

    score->startCmd(TranslatableString::untranslatable("set Time Signature With Type"));
    score->cmdAddTimeSig(targetMeasure, 0, ts, /*local*/ false);
    score->endCmd();
    layoutLinked(score);
    return true;
}

EMSCRIPTEN_KEEPALIVE bool setKeySignature(uintptr_t score_ptr, int fifths, int excerptId)
{
    auto* score=getScore(score_ptr, excerptId);
    if(!score) return false;

    if (fifths < static_cast<int>(engraving::Key::MIN) || fifths > static_cast<int>(engraving::Key::MAX)) {
        LOGW() << "setKeySignature: invalid fifths " << fifths;
        return false;
    }

    // As desktop (palette, new-score wizard): give the concert key; undoChangeKeySig derives each staff's transposed
    // key. Setting only the transposed key left concertKey INVALID (-8) in saved files.
    engraving::KeySigEvent k;
    k.setConcertKey(static_cast<engraving::Key>(fifths));
    k.setMode(engraving::KeyMode::MAJOR);

    // If a chord/rest is selected, start the change at that tick.
    // Otherwise, apply globally at the start of the score (current behaviour).
    engraving::Fraction tick(0, 1);
    if (auto cr = score->selection().cr()) {
        if (auto m = cr->measure()) {
            tick = m->tick();
        } else {
            tick = cr->tick();
        }
    }

    score->startCmd(TranslatableString::untranslatable("set Key Signature"));
    for (engraving::Staff* staff : score->staves()) {
        if (!staff) {
            continue;
        }
        score->undoChangeKeySig(staff, tick, k);
    }
    score->endCmd();
    layoutLinked(score);
    return true;
}

EMSCRIPTEN_KEEPALIVE bool setClef(uintptr_t score_ptr, int clefType, int excerptId)
{
    auto* score=getScore(score_ptr, excerptId);
    if(!score) return false;
    // ClefType enum values start at 0, use simple range check
    if (clefType < 0 || clefType >= static_cast<int>(engraving::ClefType::MAX)) {
        LOGW() << "setClef: invalid clef type " << clefType;
        return false;
    }

    engraving::Measure* firstMeasure = score->firstMeasure();
    if (!firstMeasure) {
        LOGW() << "setClef: no measures in score";
        return false;
    }

    engraving::EngravingItem* targetItem = nullptr;
    engraving::Staff* targetStaff = nullptr;

    if (auto selected = score->selection().element()) {
        targetItem = selected;
        targetStaff = selected->staff();
    }
    if (auto cr = score->selection().cr()) {
        targetItem = cr;
        targetStaff = cr->staff();
        // If the first chord/rest is selected, prefer changing the header clef to avoid
        // inserting an extra clef sign at tick 0.
        if (cr->tick().isZero() && cr->measure() == firstMeasure) {
            targetItem = firstMeasure;
        }
    }
    if (!targetItem) {
        targetItem = firstMeasure;
    }
    if (!targetStaff) {
        targetStaff = score->staff(0);
    }
    if (!targetStaff) {
        LOGW() << "setClef: no staff in score";
        return false;
    }

    score->startCmd(TranslatableString::untranslatable("set Clef"));
    score->undoChangeClef(targetStaff, targetItem, static_cast<engraving::ClefType>(clefType));
    score->endCmd();
    layoutLinked(score);
    return true;
}

EMSCRIPTEN_KEEPALIVE bool setHarmonyVoiceLiteral(uintptr_t score_ptr, bool literal, int excerptId)
{
    auto* score=getScore(score_ptr, excerptId);
    if(!score) return false;
    score->startCmd(TranslatableString::untranslatable("set Harmony Voice Literal"));
    score->undoChangeStyleVal(engraving::Sid::harmonyVoiceLiteral, literal);
    score->endCmd();
    layoutLinked(score);
    return true;
}

EMSCRIPTEN_KEEPALIVE bool setChordSymbolStylePreset(uintptr_t score_ptr, const char* preset, int excerptId)
{
    auto* score=getScore(score_ptr, excerptId);
    if(!score) return false;
    const String rawPreset = preset ? String::fromUtf8(preset).trimmed() : String();
    String styleValue = u"std";
    String chordFile = u"chords_std.xml";

    if (rawPreset == u"jazz") {
        styleValue = u"jazz";
        chordFile = u"chords_jazz.xml";
    } else if (!(rawPreset.isEmpty() || rawPreset == u"std")) {
        LOGW() << "setChordSymbolStylePreset: unsupported preset " << rawPreset;
        return false;
    }

    score->startCmd(TranslatableString::untranslatable("set Chord Symbol Style Preset"));
    score->undoChangeStyleVal(engraving::Sid::chordsXmlFile, false);
    score->undoChangeStyleVal(engraving::Sid::chordStyle, styleValue);
    score->undoChangeStyleVal(engraving::Sid::chordDescriptionFile, chordFile);
    score->endCmd();
    layoutLinked(score);
    return true;
}

EMSCRIPTEN_KEEPALIVE bool addRehearsalMark(uintptr_t score_ptr, int excerptId)
{
    auto* score=getScore(score_ptr, excerptId);
    if(!score) return false;
    auto cr = score->selection().cr();
    if (!cr) {
        LOGW() << "addRehearsalMark: no chord/rest selected";
        return false;
    }
    auto seg = cr->segment();
    if (!seg) {
        LOGW() << "addRehearsalMark: no segment on selection";
        return false;
    }
    auto rm = engraving::Factory::createRehearsalMark(seg);
    if (!rm) {
        LOGW() << "addRehearsalMark: Factory returned null";
        return false;
    }
    rm->setParent(seg);
    rm->setXmlText(u"A");
    const String rehearsalText = score->createRehearsalMarkText(rm);
    if (!rehearsalText.isEmpty()) {
        rm->setXmlText(rehearsalText);
    }
    rm->setTrack(engraving::trackZeroVoice(cr->track()));

    score->startCmd(TranslatableString::untranslatable("add Rehearsal Mark"));
    score->undo(new engraving::AddElement(rm));
    score->endCmd();
    layoutLinked(score);
    return true;
}

EMSCRIPTEN_KEEPALIVE bool addArticulation(uintptr_t score_ptr, const char* articulationSymbolName, int excerptId)
{
    auto* score=getScore(score_ptr, excerptId);
    if(!score) return false;
    if (!articulationSymbolName || !*articulationSymbolName) {
        LOGW() << "addArticulation: missing articulation symbol name";
        return false;
    }

    auto articulationSymbolId = engraving::SymNames::symIdByName(AsciiStringView(articulationSymbolName), engraving::SymId::noSym);
    if (articulationSymbolId == engraving::SymId::noSym) {
        LOGW() << "addArticulation: unknown symbol name " << articulationSymbolName;
        return false;
    }

    if (score->selection().isNone()) {
        LOGW() << "addArticulation: no selection";
        return false;
    }

    std::vector<engraving::Note*> notes = score->selection().noteList();
    if (notes.empty()) {
        LOGW() << "addArticulation: selection contains no notes";
        return false;
    }

    bool allHave = true;
    for (engraving::Note* note : notes) {
        if (!note) {
            allHave = false;
            break;
        }
        engraving::Chord* chord = note->chord();
        if (!chord) {
            allHave = false;
            break;
        }

        std::set<engraving::SymId> chordArticulations = chord->articulationSymbolIds();
        chordArticulations = engraving::flipArticulations(chordArticulations, engraving::PlacementV::ABOVE);
        chordArticulations = engraving::splitArticulations(chordArticulations);
        if (chordArticulations.find(articulationSymbolId) == chordArticulations.end()) {
            allHave = false;
            break;
        }
    }

    auto updateMode = allHave ? engraving::ArticulationsUpdateMode::Remove : engraving::ArticulationsUpdateMode::Insert;

    std::set<engraving::Chord*> chords;
    for (engraving::Note* note : notes) {
        if (note && note->chord()) {
            chords.insert(note->chord());
        }
    }

    if (chords.empty()) {
        LOGW() << "addArticulation: no chords found for selected notes";
        return false;
    }

    // updateArticulations only has combining rules for accent, marcato, tenuto and staccato (it does nothing
    // for any other symbol). Every other articulation (bows, staccatissimo, harmonics, mutes, ...) is a plain
    // toggle: removed from every chord when all of them have it, otherwise added to the chords that lack it.
    const bool combines = articulationSymbolId == engraving::SymId::articMarcatoAbove
                          || articulationSymbolId == engraving::SymId::articAccentAbove
                          || articulationSymbolId == engraving::SymId::articTenutoAbove
                          || articulationSymbolId == engraving::SymId::articStaccatoAbove;

    score->startCmd(TranslatableString::untranslatable("add Articulation"));
    for (engraving::Chord* chord : chords) {
        if (combines) {
            chord->updateArticulations({ articulationSymbolId }, updateMode);
            continue;
        }
        const std::set<engraving::SymId> present = chord->articulationSymbolIds();
        const bool chordHas = present.find(articulationSymbolId) != present.end();
        if (chordHas == allHave) {
            engraving::Articulation* articulation = engraving::Factory::createArticulation(score->dummy()->chord());
            articulation->setSymId(articulationSymbolId);
            score->toggleArticulation(chord, articulation);
        }
    }
    score->endCmd();
    layoutLinked(score);
    return true;
}

EMSCRIPTEN_KEEPALIVE bool addTempoText(uintptr_t score_ptr, double bpm, int excerptId)
{
    auto* score=getScore(score_ptr, excerptId);
    if(!score) return false;

    if (bpm <= 0) {
        LOGW() << "addTempoText: invalid bpm " << bpm;
        return false;
    }

    engraving::Measure* measure = score->firstMeasure();
    engraving::Segment* seg = nullptr;
    while (measure && !seg) {
        seg = measure->first(engraving::SegmentType::ChordRest);
        if (!seg) {
            measure = measure->nextMeasure();
        }
    }

    if (!seg) {
        LOGW() << "addTempoText: no chord/rest segments in score";
        return false;
    }

    // Prefer updating an existing tempo marking at the start of the score (common in imported files).
    // Fall back to inserting a new one if none exists.
    const engraving::track_idx_t maxTrack
        = score->ntracks() ? static_cast<engraving::track_idx_t>(score->ntracks() - 1) : 0;
    auto existing = seg->findAnnotation(engraving::ElementType::TEMPO_TEXT, 0, maxTrack);
    const double beatsPerSecond = bpm / 60.0;
    const String tempoTextXml = String(u"<sym>metNoteQuarterUp</sym> = %1").arg(int(bpm));

    score->startCmd(TranslatableString::untranslatable("add Tempo Text"));
    if (existing && existing->isTempoText()) {
        auto tempoText = toTempoText(existing);
        // TempoText overrides `undoChangeProperty(...)` as protected, so call via the public base helper.
        auto obj = static_cast<engraving::EngravingObject*>(tempoText);
        obj->undoChangeProperty(engraving::Pid::TEMPO, engraving::BeatsPerSecond(beatsPerSecond));
        obj->undoChangeProperty(engraving::Pid::TEMPO_FOLLOW_TEXT, true);
        obj->undoChangeProperty(engraving::Pid::TEXT, tempoTextXml);
        obj->undoChangeProperty(engraving::Pid::VISIBLE, true);
    } else {
        auto tempoText = engraving::Factory::createTempoText(seg);
        if (!tempoText) {
            score->endCmd();
    layoutLinked(score);
            LOGW() << "addTempoText: Factory returned null";
            return false;
        }
        tempoText->setParent(seg);
        tempoText->setTrack(0);
        tempoText->setTempo(engraving::BeatsPerSecond(beatsPerSecond));
        tempoText->setXmlText(tempoTextXml);
        tempoText->setFollowText(true);
        tempoText->setVisible(true);

        score->undoAddElement(tempoText);
    }
    score->endCmd();
    layoutLinked(score);
    return true;
}

EMSCRIPTEN_KEEPALIVE int getKeySignature(uintptr_t score_ptr, int excerptId)
{
    auto* score=getScore(score_ptr, excerptId);
    if(!score) return 0;

    engraving::Staff* staff = score->staff(0);
    if (!staff) {
        LOGW() << "getKeySignature: no staff in score";
        return 0;
    }

    const engraving::KeySigEvent k = staff->keySigEvent(engraving::Fraction(0, 1));
    return static_cast<int>(k.key());
}

}
