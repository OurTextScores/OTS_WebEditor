// SPDX-License-Identifier: GPL-3.0-only
#pragma once
// Ported from webmscore-fork/web/main.cpp; engine commands remain authoritative.
#include "selectednotes.h"
#include "engraving/dom/accidental.h"
#include "engraving/dom/durationtype.h"
#include "engraving/editing/editdata.h"
#include "engraving/dom/segment.h"
#include "engraving/dom/input.h"
extern "C" {
EMSCRIPTEN_KEEPALIVE bool setAccidental(uintptr_t score_ptr, int accidentalType, int excerptId)
{
    auto* score=getScore(score_ptr, excerptId);
    if(!score) return false;
    if (accidentalType < 0 || accidentalType >= static_cast<int>(engraving::AccidentalType::END)) {
        LOGW() << "setAccidental: invalid accidental type " << accidentalType;
        return false;
    }
    if (score->selection().isNone()) {
        LOGW() << "setAccidental: no selection";
        return false;
    }

    score->startCmd(TranslatableString::untranslatable("set Accidental"));
    score->changeAccidental(static_cast<engraving::AccidentalType>(accidentalType));
    score->endCmd();
    score->doLayout();
    return true;
}

EMSCRIPTEN_KEEPALIVE bool doubleDuration(uintptr_t score_ptr, int excerptId)
{
    auto* score=getScore(score_ptr, excerptId);
    if(!score) return false;
    if (auto el = score->selection().element()) {
        engraving::ChordRest* cr = nullptr;
        if (el->isChordRest()) {
            cr = toChordRest(el);
        } else if (el->isNote()) {
            cr = toChordRest(el->parentItem());
        }
        if (cr) {
            score->inputState().setDuration(mu::engraving::TDuration(cr->durationType()));
            score->inputState().setRest(cr->isRest());
        }
    }
    score->startCmd(TranslatableString::untranslatable("double Duration"));
    score->cmdDoubleDuration();
    score->endCmd();
    score->doLayout();
    return true;
}

EMSCRIPTEN_KEEPALIVE bool halfDuration(uintptr_t score_ptr, int excerptId)
{
    auto* score=getScore(score_ptr, excerptId);
    if(!score) return false;
    if (auto el = score->selection().element()) {
        engraving::ChordRest* cr = nullptr;
        if (el->isChordRest()) {
            cr = toChordRest(el);
        } else if (el->isNote()) {
            cr = toChordRest(el->parentItem());
        }
        if (cr) {
            score->inputState().setDuration(mu::engraving::TDuration(cr->durationType()));
            score->inputState().setRest(cr->isRest());
        }
    }
    score->startCmd(TranslatableString::untranslatable("half Duration"));
    score->cmdHalfDuration();
    score->endCmd();
    score->doLayout();
    return true;
}

EMSCRIPTEN_KEEPALIVE bool toggleDot(uintptr_t score_ptr, int excerptId)
{
    auto* score=getScore(score_ptr, excerptId);
    if(!score) return false;
    auto* el = score->selection().element();
    if (!el) {
        LOGW() << "toggleDot: no element selected";
        return false;
    }
    if (el->isNote()) {
        el = el->parentItem();
    }
    if (!el || !el->isChordRest()) {
        LOGW() << "toggleDot: selection is not chord/rest";
        return false;
    }

    auto cr = toChordRest(el);
    engraving::TDuration d = cr->durationType();
    const int newDots = d.dots() > 0 ? 0 : 1;
    d.setDots(newDots);
    if (!d.isValid()) {
        LOGW() << "toggleDot: resulting duration invalid";
        return false;
    }

    score->startCmd(TranslatableString::untranslatable("toggle Dot"));
    if (cr->isChord() && (toChord(cr)->noteType() != engraving::NoteType::NORMAL)) {
        score->undoChangeChordRestLen(cr, d);
    } else {
        score->changeCRlen(cr, d);
    }
    score->inputState().setDuration(d);
    score->endCmd();
    score->doLayout();
    return true;
}

EMSCRIPTEN_KEEPALIVE bool toggleDoubleDot(uintptr_t score_ptr, int excerptId)
{
    auto* score=getScore(score_ptr, excerptId);
    if(!score) return false;
    auto* el = score->selection().element();
    if (!el) {
        LOGW() << "toggleDoubleDot: no element selected";
        return false;
    }
    if (el->isNote()) {
        el = el->parentItem();
    }
    if (!el || !el->isChordRest()) {
        LOGW() << "toggleDoubleDot: selection is not chord/rest";
        return false;
    }

    auto cr = toChordRest(el);
    engraving::TDuration d = cr->durationType();
    const int newDots = d.dots() == 2 ? 0 : 2;
    d.setDots(newDots);
    if (!d.isValid()) {
        LOGW() << "toggleDoubleDot: resulting duration invalid";
        return false;
    }

    score->startCmd(TranslatableString::untranslatable("toggle Double Dot"));
    if (cr->isChord() && (toChord(cr)->noteType() != engraving::NoteType::NORMAL)) {
        score->undoChangeChordRestLen(cr, d);
    } else {
        score->changeCRlen(cr, d);
    }
    score->inputState().setDuration(d);
    score->endCmd();
    score->doLayout();
    return true;
}

}
