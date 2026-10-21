// SPDX-License-Identifier: GPL-3.0-only
#pragma once
#include "engraving/dom/figuredbass.h"

// Figured bass keeps parsed figure items separately from TEXT. Replace the
// complete element so text and parsed items travel through undo together.
// Use upstream's parser; regenerateText() opens/closes its own command.
static void replaceFiguredBass(MasterScore* score,FiguredBass* previous,const char* text) {
    auto* next=previous->clone();
    next->clearItems();
    String plain=String::fromUtf8(text?text:"");
    next->setXmlText(TextBase::plainToXmlText(plain));
    String normalized;
    bool valid=true;
    int line=0;
    for(String value:plain.split(u'\n',muse::SkipEmptyParts)) {
        auto* figure=next->createItem(line++);
        if(!figure->parse(value)) { delete figure; next->clearItems(); valid=false; break; }
        figure->setParent(next);
        figure->setTrack(next->track());
        next->appendItem(figure);
        if(!normalized.empty()) normalized.append(u'\n');
        normalized.append(figure->normalizedText());
    }
    if(valid && !normalized.empty()) next->setXmlText(normalized);
    score->undoChangeElement(previous,next);
    score->select(next,SelectType::SINGLE,next->staffIdx());
}

static bool addStyledText(uintptr_t id,int excerpt,const char* text,TextStyleType style) {
    auto* score=getScore(id,excerpt); if(!score) return false;
    auto* target=score->selection().element(); if(!target) return false;
    score->startCmd(TranslatableString::untranslatable("Add text"));
    TextBase* item=score->addText(style,target);
    if(item) item->undoChangeProperty(Pid::TEXT,TextBase::plainToXmlText(String::fromUtf8(text?text:"")));
    score->endCmd(); score->doLayout(); return item;
}
extern "C" {
EMSCRIPTEN_KEEPALIVE bool setSelectedText(uintptr_t id,const char* text,int excerpt) {
    auto* score=getScore(id,excerpt); if(!score) return false;
    auto* target=score->selection().element();
    if(!target || !target->isTextBase()) {
        target=nullptr;
        for(auto* item:score->selection().elements()) if(item && item->isTextBase()) { target=item; break; }
    }
    if(!target) return false;
    score->startCmd(TranslatableString::untranslatable("Change text"));
    if(target->isFiguredBass()) replaceFiguredBass(score,toFiguredBass(target),text);
    else toTextBase(target)->undoChangeProperty(Pid::TEXT,TextBase::plainToXmlText(String::fromUtf8(text?text:"")));
    score->endCmd(); score->doLayout(); return true;
}
EMSCRIPTEN_KEEPALIVE bool addStaffText(uintptr_t id,const char* text,int excerpt) { return addStyledText(id,excerpt,text,TextStyleType::STAFF); }
EMSCRIPTEN_KEEPALIVE bool addSystemText(uintptr_t id,const char* text,int excerpt) { return addStyledText(id,excerpt,text,TextStyleType::SYSTEM); }
EMSCRIPTEN_KEEPALIVE bool addExpressionText(uintptr_t id,const char* text,int excerpt) { return addStyledText(id,excerpt,text,TextStyleType::EXPRESSION); }
EMSCRIPTEN_KEEPALIVE bool addLyricText(uintptr_t id,const char* text,int excerpt) { return addStyledText(id,excerpt,text,TextStyleType::LYRICS_ODD); }
EMSCRIPTEN_KEEPALIVE bool addFingeringText(uintptr_t id,const char* text,int excerpt) { return addStyledText(id,excerpt,text,TextStyleType::FINGERING); }
EMSCRIPTEN_KEEPALIVE bool addLeftHandGuitarFingeringText(uintptr_t id,const char* text,int excerpt) { return addStyledText(id,excerpt,text,TextStyleType::LH_GUITAR_FINGERING); }
EMSCRIPTEN_KEEPALIVE bool addRightHandGuitarFingeringText(uintptr_t id,const char* text,int excerpt) { return addStyledText(id,excerpt,text,TextStyleType::RH_GUITAR_FINGERING); }
EMSCRIPTEN_KEEPALIVE bool addStringNumberText(uintptr_t id,const char* text,int excerpt) { return addStyledText(id,excerpt,text,TextStyleType::STRING_NUMBER); }
EMSCRIPTEN_KEEPALIVE bool addInstrumentChangeText(uintptr_t id,const char* text,int excerpt) { return addStyledText(id,excerpt,text,TextStyleType::INSTRUMENT_CHANGE); }
EMSCRIPTEN_KEEPALIVE bool addStickingText(uintptr_t id,const char* text,int excerpt) { return addStyledText(id,excerpt,text,TextStyleType::STICKING); }
EMSCRIPTEN_KEEPALIVE bool addHarmonyText(uintptr_t id,int variant,const char* text,int excerpt) {
    auto style=variant==1?TextStyleType::HARMONY_ROMAN:variant==2?TextStyleType::HARMONY_NASHVILLE:TextStyleType::HARMONY_A;
    return addStyledText(id,excerpt,text,style);
}
EMSCRIPTEN_KEEPALIVE bool addFiguredBassText(uintptr_t id,const char* text,int excerpt) {
    auto* score=getScore(id,excerpt); if(!score) return false;
    score->startCmd(TranslatableString::untranslatable("Add figured bass"));
    auto* item=score->addFiguredBass();
    if(item) replaceFiguredBass(score,item,text);
    score->endCmd(); score->doLayout(); return item;
}
}
