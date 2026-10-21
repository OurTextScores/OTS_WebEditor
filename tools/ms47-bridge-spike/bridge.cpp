// SPDX-License-Identifier: GPL-3.0-only
#include "bootstrap.h"
#include "svgpaint.h"
#include "engraving/dom/select.h"
#include "engraving/dom/note.h"
#include "engraving/dom/chord.h"
#include <emscripten/emscripten.h>
#include <cstring>
#include <cstdlib>

// Keep the existing WasmRes ABI: LE uint32 error, byte count, bytes + NUL.
static const uint8_t* response(const ByteArray& bytes, uint32_t error = 0) {
    auto* result = static_cast<uint8_t*>(std::malloc(9 + bytes.size()));
    uint32_t length = bytes.size();
    std::memcpy(result, &error, 4); std::memcpy(result+4, &length, 4);
    std::memcpy(result+8, bytes.constData(), length); result[8+length] = 0;
    return result;
}
static const uint8_t* textResponse(const std::string& text, uint32_t error = 0) {
    return response(ByteArray(reinterpret_cast<const uint8_t*>(text.data()), text.size()), error);
}
static std::map<uintptr_t, std::shared_ptr<EngravingProject>> projects;
static MasterScore* getScore(uintptr_t id, int excerpt = -1) {
    auto it = projects.find(id);
    return it != projects.end() && excerpt == -1 ? it->second->masterScore() : nullptr;
}

static bool changePitch(uintptr_t id,int excerpt,bool up);

extern "C" {
EMSCRIPTEN_KEEPALIVE void init() {
    const char* root = emscripten_run_script_string("process.env.MS47_RESOURCE_ROOT || '../ms47-build-native/res'");
    boot(root ? root : "../ms47-build-native/res");
}
EMSCRIPTEN_KEEPALIVE int version() { return 470; }
EMSCRIPTEN_KEEPALIVE void setLogLevel(int level) {
    if(level>=0 && level<=2) kors::logger::Logger::instance()->setLevel(static_cast<kors::logger::Level>(level));
}
EMSCRIPTEN_KEEPALIVE const uint8_t* load(const char* format, const uint8_t* data, size_t length, bool layout) {
    std::string ext(format);
    if(ext != "mscz" && ext != "mscx" && ext != "musicxml" && ext != "xml") return textResponse("Unsupported format", 1);
    auto project = EngravingProject::create(nullptr);
    const std::string path = "score."+ext;
    project->setFileInfoProvider(std::make_shared<LocalFileInfoProvider>(path));
    ByteArray bytes(data,length);
    if (ext == "mscx") {
        // MscIoMode::XmlFile is MuseScore's multi-file .mscs container, not raw MSCX.
        // Wrap the raw document in an in-memory ZIP for the native project loader.
        ByteArray archive; io::Buffer output(&archive);
        MscWriter::Params params; params.device=&output; params.filePath="score.mscz"; params.mode=MscIoMode::Zip;
        MscWriter writer(params); auto opened=writer.open();
        if (!opened) return textResponse(opened.toString(), 1);
        writer.writeScoreFile(bytes); writer.close(); bytes=std::move(archive);
    }
    Ret loaded;
    if(ext == "mscz" || ext == "mscx") {
        io::Buffer buffer(&bytes);
        MscReader::Params params; params.device=&buffer; params.filePath=path;
        params.mode=MscIoMode::Zip;
        MscReader reader(params); loaded=reader.open();
        if(loaded) loaded=project->loadMscz(reader,nullptr,true);
    } else {
        auto err=mu::iex::musicxml::importMusicXmlfromBuffer(project->masterScore(),String::fromStdString(path),bytes);
        loaded=err==Err::NoError ? project->setupMasterScore(true) : make_ret(Ret::Code::UnknownError);
    }
    // Native loading also needs the project setup pass after style/parts are read.
    // In particular, padding tables must use the loaded score's staff size.
    if (loaded && (ext == "mscz" || ext == "mscx")) loaded=project->setupMasterScore(true);
    if(!loaded) return textResponse(loaded.toString(),1);
    if(layout) project->masterScore()->doLayout();
    // Existing JS destroy() frees scoreptr after destroying the native score.
    auto* token=static_cast<uint32_t*>(std::malloc(4));
    uint32_t id=reinterpret_cast<uintptr_t>(token); *token=id;
    projects.emplace(id,std::move(project));
    return response(ByteArray(reinterpret_cast<const uint8_t*>(&id),4));
}
EMSCRIPTEN_KEEPALIVE void destroy(uintptr_t id) { projects.erase(id); }
EMSCRIPTEN_KEEPALIVE const uint8_t* saveXml(uintptr_t id,int excerpt) {
    auto* score=getScore(id,excerpt); if(!score) return textResponse("Invalid score or unsupported excerpt",1);
    ByteArray xml; io::Buffer buffer(&xml); buffer.open(io::IODevice::WriteOnly);
    mu::iex::musicxml::saveXml(score,&buffer); buffer.close(); return response(xml);
}
EMSCRIPTEN_KEEPALIVE const uint8_t* saveSvg(uintptr_t id,int page,bool background,bool highlight,int excerpt) {
    auto* score=getScore(id,excerpt);
    if(!score || page<0 || page>=int(score->npages())) return textResponse("Invalid score, excerpt or page",1);
    auto provider=std::make_shared<SvgPaint>();
    muse::draw::Painter painter(provider,"ms47-svg");
    rendering::IScoreRenderer::ScorePaintOptions opt;
    opt.fromPage=page; opt.toPage=page; opt.isSetViewport=false;
    opt.isPrinting=!highlight; opt.printPageBackground=false;
    auto renderer=muse::modularity::globalIoc()->resolve<rendering::IScoreRenderer>("spike");
    renderer->paintScore(&painter,score,opt); painter.endDraw();
    if(!provider->error().empty()) return textResponse(provider->error(),1);
    auto box=score->pages().at(page)->ldata()->bbox();
    return textResponse(provider->svg(box.width(),box.height(),background));
}
EMSCRIPTEN_KEEPALIVE bool selectNextChord(uintptr_t id,int excerpt) {
    auto* score=getScore(id,excerpt); if(!score) return false;
    auto* el=score->move(u"next-chord");
    if(!el) return false;
    score->updateSelection(); score->setSelectionChanged(true); return true;
}
EMSCRIPTEN_KEEPALIVE bool pitchUp(uintptr_t id,int excerpt) { return changePitch(id,excerpt,true); }
EMSCRIPTEN_KEEPALIVE bool undo(uintptr_t id,int excerpt) {
    auto* score=getScore(id,excerpt); if(!score) return false;
    score->undoRedo(true,nullptr); score->doLayout(); return true;
}
EMSCRIPTEN_KEEPALIVE bool redo(uintptr_t id,int excerpt) {
    auto* score=getScore(id,excerpt); if(!score) return false;
    score->undoRedo(false,nullptr); score->doLayout(); return true;
}
}

#include "scoreexports.h"

#include "pitchduration.h"
#include "notationmarks.h"
#include "notationproperties.h"

#include "scoretext.h"
#include "scoresignatures.h"

#include "inspector.h"

#include "undohistory.h"

#include "selection.h"

#include "selectiongeometry.h"

#include "noteinput.h"
#include "chordedits.h"

#include "measuredata.h"
#include "measurerepeats.h"
#include "measurestructure.h"

#include "playbacktimeline.h"
#include "spannertools.h"
#include "frettools.h"
