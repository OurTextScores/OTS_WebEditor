// SPDX-License-Identifier: GPL-3.0-only
#pragma once
#include "engraving/dom/text.h"
#include "engraving/dom/rest.h"
#include "engraving/dom/measure.h"
#include "engraving/dom/part.h"
#include "engraving/dom/staff.h"
#include "engraving/editing/undo.h"
#include "engraving/rw/xmlwriter.h"

static const uint8_t* numberResponse(uint32_t value) {
    return response(ByteArray(reinterpret_cast<const uint8_t*>(&value),4));
}
static bool moveSelection(uintptr_t id,int excerpt,const char16_t* command,bool range) {
    auto* score=getScore(id,excerpt); if(!score) return false;
    auto* item=range ? score->selectMove(command) : score->move(command);
    if(!item) return false;
    score->updateSelection(); score->setSelectionChanged(true); return true;
}
static bool changePitch(uintptr_t id,int excerpt,bool up) {
    auto* score=getScore(id,excerpt); if(!score || score->selection().isNone()) return false;
    auto* el=score->selection().element();
    score->startCmd(TranslatableString::untranslatable(up?"Pitch up":"Pitch down"));
    // Match desktop NotationInteraction::movePitch, including rest nudging.
    if(el && el->isRest()) score->cmdMoveRest(toRest(el),up?DirectionV::UP:DirectionV::DOWN);
    else score->upDown(up, UpDownMode::CHROMATIC);
    score->endCmd(); layoutLinked(score); return true;
}
static bool setHeader(uintptr_t id,int excerpt,const char* text,TextStyleType style) {
    auto* score=getScore(id,excerpt); if(!score) return false;
    score->startCmd(TranslatableString::untranslatable("Change header text"));
    TextBase* header=score->getText(style);
    if(!header) header=score->addText(style,nullptr);
    if(header) header->undoChangeProperty(Pid::TEXT,TextBase::plainToXmlText(String::fromUtf8(text?text:"")));
    score->endCmd(); layoutLinked(score); return header;
}
extern "C" {
EMSCRIPTEN_KEEPALIVE const uint8_t* title(uintptr_t id) {
    auto* score=getScore(id); if(!score) return textResponse("Invalid score",1);
    auto* text=score->getText(TextStyleType::TITLE);
    String result=text?text->plainText():String();
    if(result.empty()) result=score->metaTag(u"workTitle");
    if(result.empty()) result=score->name();
    return response(result.toUtf8());
}
EMSCRIPTEN_KEEPALIVE const uint8_t* subtitle(uintptr_t id) {
    auto* score=getScore(id); if(!score) return textResponse("Invalid score",1);
    auto* text=score->getText(TextStyleType::SUBTITLE);
    return response(text?text->plainText().toUtf8():ByteArray());
}
EMSCRIPTEN_KEEPALIVE bool setTitleText(uintptr_t id,const char* text,int excerpt) { return setHeader(id,excerpt,text,TextStyleType::TITLE); }
EMSCRIPTEN_KEEPALIVE bool setSubtitleText(uintptr_t id,const char* text,int excerpt) { return setHeader(id,excerpt,text,TextStyleType::SUBTITLE); }
EMSCRIPTEN_KEEPALIVE bool setComposerText(uintptr_t id,const char* text,int excerpt) { return setHeader(id,excerpt,text,TextStyleType::COMPOSER); }
EMSCRIPTEN_KEEPALIVE bool setLyricistText(uintptr_t id,const char* text,int excerpt) { return setHeader(id,excerpt,text,TextStyleType::LYRICIST); }
EMSCRIPTEN_KEEPALIVE const uint8_t* npages(uintptr_t id,int excerpt) {
    auto* score=getScore(id,excerpt); return score?numberResponse(score->npages()):textResponse("Invalid score",1);
}
EMSCRIPTEN_KEEPALIVE const uint8_t* saveMsc(uintptr_t id,bool compressed,int excerpt) {
    auto* score=getScore(id,excerpt); if(!score) return textResponse("Invalid score or unsupported excerpt",1);
    // 4.00 wrote a part as a standalone score by casting the excerpt to a MasterScore; 4.7 has no such path and no
    // consumer saves parts (see DECISIONS.md, "Saving a part as MSCZ"). Fail explicitly instead of saving the full score.
    if (excerpt != -1) return textResponse("Saving a part as MSCZ/MSCX is not supported",1);
    ByteArray bytes; io::Buffer buffer(&bytes);
    MscWriter::Params params; params.device=&buffer; params.filePath="score.mscz";
    params.mode=MscIoMode::Zip;
    MscWriter writer(params); auto ret=writer.open(); if(!ret) return textResponse(ret.toString(),1);
    bool ok=projects.at(id)->writeMscz(writer,false); writer.close();
    if (!ok) return textResponse("Could not write score",1);
    if (compressed) return response(bytes);
    io::Buffer input(&bytes);
    MscReader::Params readParams; readParams.device=&input; readParams.filePath="score.mscz"; readParams.mode=MscIoMode::Zip;
    MscReader reader(readParams); auto opened=reader.open();
    if (!opened) return textResponse(opened.toString(),1);
    auto document=reader.readScoreFile();
    // A standalone MSCX has no adjacent score_style.mss. Serialize the native
    // style into its Score element, which the upstream reader also accepts.
    ByteArray style; io::Buffer styleBuffer(&style); styleBuffer.open(io::IODevice::WriteOnly);
    XmlWriter xml(&styleBuffer); score->style().save(xml,false); xml.flush(); styleBuffer.close();
    std::string raw(document.constChar(), document.size());
    const auto at=raw.find("<Score>");
    if (at==std::string::npos) return textResponse("Missing score document",1);
    raw.insert(at+7, std::string(style.constChar(),style.size()));
    return textResponse(raw);
}
EMSCRIPTEN_KEEPALIVE bool selectPartMeasureByIndex(uintptr_t id,int partIndex,int measureIndex,int excerpt) {
    auto* score=getScore(id,excerpt);
    if(!score || partIndex<0 || partIndex>=int(score->parts().size()) || measureIndex<0) return false;
    auto* part=score->parts().at(partIndex);
    if(part->staves().empty()) return false;
    auto* measure=score->firstMeasureMM();
    for(int i=0;measure && i<measureIndex;++i) measure=measure->nextMeasureMM();
    if(!measure) return false;
    auto* start=measure->first(SegmentType::ChordRest);
    if(!start) start=measure->first();
    auto* end=measure->last();
    if(!start || !end) return false;
    auto firstStaff=part->staves().front()->idx();
    auto endStaff=part->staves().back()->idx()+1;
    score->deselectAll(); score->selection().setRange(start,end,firstStaff,endStaff);
    score->selection().setState(SelState::RANGE);
    score->selection().setActiveTrack(firstStaff*VOICES);
    score->selection().updateSelectedElements();
    score->updateSelection(); score->setSelectionChanged(true); return true;
}
EMSCRIPTEN_KEEPALIVE bool clearSelection(uintptr_t id,int excerpt) {
    auto* score=getScore(id,excerpt); if(!score) return false;
    for(auto* item:score->selection().elements()) if(item && item->isChord())
        for(auto* note:toChord(item)->notes()) note->setSelected(false);
    score->deselectAll(); score->updateSelection(); score->setSelectionChanged(true); return true;
}
EMSCRIPTEN_KEEPALIVE bool selectAll(uintptr_t id,int excerpt) {
    auto* score=getScore(id,excerpt); if(!score) return false;
    score->cmdSelectAll();
    // As 4.00: a filter that excludes everything leaves no selection (4.7 would keep an empty range)
    if (score->selection().elements().empty()) { score->deselectAll(); return false; }
    return !score->selection().isNone();
}
EMSCRIPTEN_KEEPALIVE bool isSelectionRange(uintptr_t id,int excerpt) {
    auto* score=getScore(id,excerpt); return score && score->selection().isRange();
}
EMSCRIPTEN_KEEPALIVE bool selectPrevChord(uintptr_t id,int excerpt) { return moveSelection(id,excerpt,u"prev-chord",false); }
EMSCRIPTEN_KEEPALIVE bool extendSelectionNextChord(uintptr_t id,int excerpt) { return moveSelection(id,excerpt,u"select-next-chord",true); }
EMSCRIPTEN_KEEPALIVE bool extendSelectionPrevChord(uintptr_t id,int excerpt) { return moveSelection(id,excerpt,u"select-prev-chord",true); }
EMSCRIPTEN_KEEPALIVE bool extendSelectionNextMeasure(uintptr_t id,int excerpt) { return moveSelection(id,excerpt,u"select-next-measure",true); }
EMSCRIPTEN_KEEPALIVE bool extendSelectionPrevMeasure(uintptr_t id,int excerpt) { return moveSelection(id,excerpt,u"select-prev-measure",true); }
EMSCRIPTEN_KEEPALIVE bool extendSelectionStaffAbove(uintptr_t id,int excerpt) { return moveSelection(id,excerpt,u"select-staff-above",true); }
EMSCRIPTEN_KEEPALIVE bool extendSelectionStaffBelow(uintptr_t id,int excerpt) { return moveSelection(id,excerpt,u"select-staff-below",true); }
EMSCRIPTEN_KEEPALIVE bool pitchDown(uintptr_t id,int excerpt) { return changePitch(id,excerpt,false); }
EMSCRIPTEN_KEEPALIVE bool deleteSelection(uintptr_t id,int excerpt) {
    auto* score=getScore(id,excerpt); if(!score || score->selection().isNone()) return false;
    score->startCmd(TranslatableString::untranslatable("Delete selection"));
    score->cmdDeleteSelection(); score->endCmd(); layoutLinked(score); return true;
}
EMSCRIPTEN_KEEPALIVE double getSpatium(uintptr_t id,int excerpt) {
    auto* score=getScore(id,excerpt); return score?toAbi(score->style().spatium()):0;
}
EMSCRIPTEN_KEEPALIVE bool relayout(uintptr_t id,int excerpt) {
    auto* score=getScore(id,excerpt); if(!score) return false;
    layoutAllLinked(score); return true;
}
EMSCRIPTEN_KEEPALIVE const uint8_t* getLayoutMode(uintptr_t id,int excerpt) {
    auto* score=getScore(id,excerpt); return score?numberResponse(uint32_t(score->layoutMode())):textResponse("Invalid score",1);
}
EMSCRIPTEN_KEEPALIVE bool setLayoutMode(uintptr_t id,int mode,int excerpt) {
    auto* score=getScore(id,excerpt);
    if(!score || mode<int(LayoutMode::PAGE) || mode>int(LayoutMode::HORIZONTAL_FIXED)) return false;
    if(score->layoutMode()!=LayoutMode(mode)) { score->setLayoutMode(LayoutMode(mode)); score->setLayoutAll(); layoutLinked(score); }
    return true;
}
EMSCRIPTEN_KEEPALIVE const uint8_t* getUndoInfo(uintptr_t id,int excerpt) {
    auto* score=getScore(id,excerpt); if(!score) return textResponse("Invalid score",1);
    const auto* stack=score->undoStack();
    return textResponse("{\"index\":"+std::to_string(stack->currentIndex())+",\"size\":"+
        std::to_string(stack->size())+",\"clean\":"+(stack->isClean()?"true":"false")+"}");
}
EMSCRIPTEN_KEEPALIVE bool undoRedoTo(uintptr_t id,int target,int excerpt) {
    auto* score=getScore(id,excerpt); if(!score) return false;
    target=std::max(0,std::min(target,int(score->undoStack()->size())));
    int guard=int(score->undoStack()->size())+1;
    while(int(score->undoStack()->currentIndex())!=target && guard-- > 0)
        score->undoRedo(int(score->undoStack()->currentIndex())>target,nullptr);
    layoutLinked(score); return int(score->undoStack()->currentIndex())==target;
}
}
