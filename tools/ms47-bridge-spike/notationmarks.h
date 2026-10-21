// SPDX-License-Identifier: GPL-3.0-only
#pragma once
// Ported from webmscore-fork/web/main.cpp; engine commands remain authoritative.
#include "selectednotes.h"
#include "engraving/dom/dynamic.h"
#include "engraving/dom/hairpin.h"
#include "engraving/dom/fermata.h"
#include "engraving/dom/breath.h"
#include "engraving/dom/arpeggio.h"
#include "engraving/dom/ottava.h"
#include "engraving/dom/trill.h"
#include "engraving/dom/factory.h"
#include "engraving/editing/editdata.h"
#include "engraving/dom/segment.h"
#include "engraving/dom/input.h"
extern "C" {
EMSCRIPTEN_KEEPALIVE bool addDynamic(uintptr_t score_ptr, int dynamicType, int excerptId)
{
    auto* score=getScore(score_ptr, excerptId);
    if(!score) return false;
    auto cr = score->selection().cr();
    if (!cr) {
        LOGW() << "addDynamic: no chord/rest selected";
        return false;
    }
    // 4.7 inserted SFFF/SFFFZ before SFP; preserve all existing JS indices.
    static constexpr engraving::DynamicType legacyTypes[] = {
        engraving::DynamicType::OTHER,
        engraving::DynamicType::PPPPPP,
        engraving::DynamicType::PPPPP,
        engraving::DynamicType::PPPP,
        engraving::DynamicType::PPP,
        engraving::DynamicType::PP,
        engraving::DynamicType::P,
        engraving::DynamicType::MP,
        engraving::DynamicType::MF,
        engraving::DynamicType::F,
        engraving::DynamicType::FF,
        engraving::DynamicType::FFF,
        engraving::DynamicType::FFFF,
        engraving::DynamicType::FFFFF,
        engraving::DynamicType::FFFFFF,
        engraving::DynamicType::FP,
        engraving::DynamicType::PF,
        engraving::DynamicType::SF,
        engraving::DynamicType::SFZ,
        engraving::DynamicType::SFF,
        engraving::DynamicType::SFFZ,
        engraving::DynamicType::SFP,
        engraving::DynamicType::SFPP,
        engraving::DynamicType::RFZ,
        engraving::DynamicType::RF,
        engraving::DynamicType::FZ,
        engraving::DynamicType::M,
        engraving::DynamicType::R,
        engraving::DynamicType::S,
        engraving::DynamicType::Z,
        engraving::DynamicType::N,
    };
    if (dynamicType < 0 || dynamicType >= int(sizeof(legacyTypes)/sizeof(*legacyTypes))) return false;
    auto dtype=legacyTypes[dynamicType];
    score->startCmd(TranslatableString::untranslatable("add Dynamic"));
    auto dyn = new engraving::Dynamic(score->dummy()->segment());
    dyn->setDynamicType(dtype);
    dyn->setXmlText(engraving::Dynamic::dynamicText(dtype));
    engraving::EditData ed;
    ed.dropElement = dyn;
    cr->drop(ed);
    score->endCmd();
    score->doLayout();
    return true;
}

EMSCRIPTEN_KEEPALIVE bool addHairpin(uintptr_t score_ptr, int hairpinType, int excerptId)
{
    auto* score=getScore(score_ptr, excerptId);
    if(!score) return false;
    if (score->selection().isNone()) {
        LOGW() << "addHairpin: no selection";
        return false;
    }
    if (hairpinType < static_cast<int>(engraving::HairpinType::CRESC_HAIRPIN)
        || hairpinType > static_cast<int>(engraving::HairpinType::DIM_LINE)) {
        LOGW() << "addHairpin: invalid hairpin type " << hairpinType;
        return false;
    }

    score->startCmd(TranslatableString::untranslatable("add Hairpin"));
    const auto type = static_cast<engraving::HairpinType>(hairpinType);
    const auto hairpins = score->addHairpins(type);
    score->endCmd();
    score->doLayout();

    const bool added = std::any_of(hairpins.begin(), hairpins.end(), [](engraving::Hairpin* hairpin) {
        return hairpin != nullptr;
    });
    if (!added) {
        LOGW() << "addHairpin: failed to add hairpin";
    }
    return added;
}

EMSCRIPTEN_KEEPALIVE bool addFermata(uintptr_t score_ptr, int fermataVariant, int excerptId)
{
    static const engraving::SymId fermataSymbols[] = {
        engraving::SymId::fermataAbove,
        engraving::SymId::fermataShortAbove,
        engraving::SymId::fermataLongAbove,
        engraving::SymId::fermataVeryShortAbove,
        engraving::SymId::fermataVeryLongAbove,
    };
    if (fermataVariant < 0 || fermataVariant >= static_cast<int>(std::size(fermataSymbols))) {
        LOGW() << "addFermata: invalid variant " << fermataVariant;
        return false;
    }

    auto* score=getScore(score_ptr, excerptId);
    if(!score) return false;
    auto chordRests = selectedChordRests(score);
    const auto symbol = fermataSymbols[fermataVariant];
    chordRests.erase(std::remove_if(chordRests.begin(), chordRests.end(), [symbol](const auto* chordRest) {
        for (auto* annotation : chordRest->segment()->annotations()) {
            if (annotation && annotation->isFermata() && annotation->track() == chordRest->track()
                && engraving::toFermata(annotation)->symId() == symbol) {
                return true;
            }
        }
        return false;
    }), chordRests.end());
    if (chordRests.empty()) {
        LOGW() << "addFermata: no eligible chord/rest selection";
        return false;
    }

    score->startCmd(TranslatableString::untranslatable("add Fermata"));
    for (auto* chordRest : chordRests) {
        auto* fermata = engraving::Factory::createFermata(score->dummy()->segment());
        fermata->setSymId(symbol);
        engraving::EditData editData;
        editData.dropElement = fermata;
        chordRest->drop(editData);
    }
    score->endCmd();
    score->doLayout();
    return true;
}

EMSCRIPTEN_KEEPALIVE bool addBreath(uintptr_t score_ptr, int breathType, int excerptId)
{
    if (breathType < 0 || breathType >= 9 /* existing JS breath indices */) {
        LOGW() << "addBreath: invalid type " << breathType;
        return false;
    }
    auto* score=getScore(score_ptr, excerptId);
    if(!score) return false;
    const auto chordRests = selectedChordRests(score);
    if (chordRests.empty()) {
        LOGW() << "addBreath: no chord/rest selection";
        return false;
    }

    const auto& breathTypeDefinition = engraving::Breath::BREATH_LIST[breathType];
    score->startCmd(TranslatableString::untranslatable("add Breath"));
    for (auto* chordRest : chordRests) {
        auto* breath = engraving::Factory::createBreath(score->dummy()->segment());
        breath->setSymId(breathTypeDefinition.id);
        breath->setPause(breathTypeDefinition.pause);
        engraving::EditData editData;
        editData.dropElement = breath;
        chordRest->drop(editData);
    }
    score->endCmd();
    score->doLayout();
    return true;
}

EMSCRIPTEN_KEEPALIVE bool addArpeggio(uintptr_t score_ptr, int arpeggioType, int excerptId)
{
    if (arpeggioType < static_cast<int>(engraving::ArpeggioType::NORMAL)
        || arpeggioType > static_cast<int>(engraving::ArpeggioType::BRACKET)) {
        LOGW() << "addArpeggio: invalid type " << arpeggioType;
        return false;
    }
    auto* score=getScore(score_ptr, excerptId);
    if(!score) return false;
    const auto chords = selectedChords(score, true);
    if (chords.empty()) {
        LOGW() << "addArpeggio: select at least one chord with two or more notes";
        return false;
    }

    score->startCmd(TranslatableString::untranslatable("add Arpeggio"));
    for (auto* chord : chords) {
        auto* arpeggio = engraving::Factory::createArpeggio(chord);
        arpeggio->setArpeggioType(static_cast<engraving::ArpeggioType>(arpeggioType));
        engraving::EditData editData;
        editData.dropElement = arpeggio;
        chord->drop(editData);
    }
    score->endCmd();
    score->doLayout();
    return true;
}

EMSCRIPTEN_KEEPALIVE bool addOttava(uintptr_t score_ptr, int ottavaType, int excerptId)
{
    auto* score=getScore(score_ptr, excerptId);
    if(!score) return false;
    if (ottavaType < static_cast<int>(engraving::OttavaType::OTTAVA_8VA)
        || ottavaType > static_cast<int>(engraving::OttavaType::OTTAVA_22MB)) {
        LOGW() << "addOttava: invalid ottava type " << ottavaType;
        return false;
    }
    if (score->selection().isNone() || !score->selection().firstChordRest()) {
        LOGW() << "addOttava: no chord/rest selection";
        return false;
    }

    score->startCmd(TranslatableString::untranslatable("add Ottava"));
    score->cmdAddOttava(static_cast<engraving::OttavaType>(ottavaType));
    score->endCmd();
    score->doLayout();
    return true;
}

EMSCRIPTEN_KEEPALIVE bool addTrill(uintptr_t score_ptr, int trillType, int excerptId)
{
    auto* score=getScore(score_ptr, excerptId);
    if(!score) return false;
    if (trillType < static_cast<int>(engraving::TrillType::TRILL_LINE)
        || trillType > static_cast<int>(engraving::TrillType::PRALLPRALL_LINE)) {
        LOGW() << "addTrill: invalid trill type " << trillType;
        return false;
    }

    const auto notes = selectedNormalNotes(score);
    if (notes.empty()) {
        LOGW() << "addTrill: selection contains no notes";
        return false;
    }

    auto* firstChord = notes.front()->chord();
    auto* lastChord = notes.back()->chord();
    if (!firstChord || !lastChord || firstChord->staffIdx() != lastChord->staffIdx()) {
        LOGW() << "addTrill: selection must stay on one staff";
        return false;
    }

    auto* trill = engraving::Factory::createTrill(score->dummy());
    if (!trill) {
        LOGW() << "addTrill: Factory returned null";
        return false;
    }
    trill->setTrillType(static_cast<engraving::TrillType>(trillType));
    trill->setTrack(engraving::staff2track(firstChord->staffIdx(), 0));
    trill->setTrack2(trill->track());
    trill->setTick(firstChord->tick());
    trill->setTick2(lastChord->tick() + lastChord->actualTicks());

    score->startCmd(TranslatableString::untranslatable("add Trill"));
    score->undoAddElement(trill);
    score->endCmd();
    score->doLayout();
    return true;
}

}
