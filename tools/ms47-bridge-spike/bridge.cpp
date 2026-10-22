// SPDX-License-Identifier: GPL-3.0-only
#include "bootstrap.h"
#include "svgpaint.h"
#include "engraving/dom/page.h"
#include "engraving/dom/system.h"
#include "engraving/dom/staff.h"
#include "engraving/dom/stafflines.h"
#include "engraving/dom/stafftype.h"
#include "engraving/dom/measure.h"
#include "engraving/dom/spanner.h"
#include "engraving/dom/select.h"
#include "engraving/dom/note.h"
#include "engraving/dom/chord.h"
#include "engraving/dom/excerpt.h"
#include "global/serialization/json.h"
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
static std::map<uintptr_t, JsonObject> loadProfiles; // per score, read by loadProfile()
// excerpt -1 is the full score; 0..n-1 index the master score's excerpts (parts), as in the 4.00 bridge.
// Unlike 4.00, an out-of-range excerpt is a null score (a failed call), not a throw, and an excerpt is a Score,
// not a MasterScore cast.
static Score* getScore(uintptr_t id, int excerpt = -1) {
    auto it = projects.find(id);
    if (it == projects.end()) return nullptr;
    MasterScore* master = it->second->masterScore();
    // Range layout at endCmd/undo reaches only "open" linked scores (desktop: visible part tabs); all of ours are
    for (Score* linked : master->scoreList()) linked->setIsOpen(true);
    if (excerpt == -1) return master;
    if (excerpt < 0 || excerpt >= int(master->excerpts().size())) return nullptr;
    return master->excerpts()[excerpt]->excerptScore();
}

// Coordinate unit of the bridge ABI. The 4.00 engine engraved at 360 DPI, and every coordinate it exchanged with JS
// (SVG, boxes, positions, spatium, points) was in those units; editor code assumes engine units == SVG pixels and its
// zoom presets are fractions of that size. 4.7 engraves at 1200 DPI, so convert at the boundary: native inside.
static constexpr double ABI_UNIT = 360.0 / mu::engraving::DPI;
static inline double toAbi(double v) { return v * ABI_UNIT; }
static inline double fromAbi(double v) { return v / ABI_UNIT; }

// After an edit (DECISIONS.md item 9). Every linked score shares one undo stack, so a command or undo through any of
// them can change all of them. As desktop and the 4.00 bridge, endCmd and undoRedo already lay out the edited range in
// every open linked score; update() finishes any layout still pending (a style change's layout-all) and is otherwise
// a no-op. A full doLayout after every edit, as this bridge first did, cost seconds per edit on large scores.
static void layoutLinked(Score* score) {
    score->masterScore()->update();   // lays out every open linked score; getScore() opens them all
}

// Explicit full layout: relayout(), new part scores, font and resource changes
static void layoutAllLinked(Score* score) {
    for (Score* linked : score->scoreList()) {
        linked->setLayoutAll();
        linked->doLayout();
    }
}

static bool changePitch(uintptr_t id,int excerpt,bool up);
static void abortGesturesForScore(MasterScore* master); // dragtools.h
static void releasePlaybackForScore(uintptr_t id);   // playbacktools.h

extern "C" {
EMSCRIPTEN_KEEPALIVE void init() {
#ifdef MS47_BROWSER
    // Browser package (webmscore.lib.*): resources are preloaded at /res in MEMFS; index.js writes fonts and the
    // soundfont into /fonts and / (FS_createDataFile needs the directory to exist)
    std::error_code ec;
    std::filesystem::create_directories("/fonts", ec);
    boot("/res");
#else
    const char* root = emscripten_run_script_string("process.env.MS47_RESOURCE_ROOT || '../ms47-build-native/res'");
    boot(root ? root : "../ms47-build-native/res");
#endif
}
EMSCRIPTEN_KEEPALIVE int version() { return 470; }
EMSCRIPTEN_KEEPALIVE void setLogLevel(int level) {
    if(level>=0 && level<=2) kors::logger::Logger::instance()->setLevel(static_cast<kors::logger::Level>(level));
}
EMSCRIPTEN_KEEPALIVE const uint8_t* load(const char* format, const uint8_t* data, size_t length, bool layout) {
    const double loadStartMs=emscripten_get_now();
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
    const double parsedMs=emscripten_get_now();
    if(layout) project->masterScore()->doLayout();
    JsonObject profile; // loadProfile(): same keys as the 4.00 bridge, plus parse/layout split
    profile.set("format", ext); profile.set("dataBytes", static_cast<int>(length));
    profile.set("doLayoutRequested", layout); profile.set("deferredRequested", false); profile.set("deferredActive", !layout);
    profile.set("parseMs", parsedMs-loadStartMs); profile.set("layoutMs", emscripten_get_now()-parsedMs);
    profile.set("totalLoadMs", emscripten_get_now()-loadStartMs);
    profile.set("pagesAfterLoad", static_cast<int>(project->masterScore()->npages()));
    // Existing JS destroy() frees scoreptr after destroying the native score.
    auto* token=static_cast<uint32_t*>(std::malloc(4));
    uint32_t id=reinterpret_cast<uintptr_t>(token); *token=id;
    projects.emplace(id,std::move(project));
    loadProfiles[id]=profile;
    return response(ByteArray(reinterpret_cast<const uint8_t*>(&id),4));
}
EMSCRIPTEN_KEEPALIVE void destroy(uintptr_t id) {
    if (auto it=projects.find(id); it!=projects.end()) abortGesturesForScore(it->second->masterScore());
    releasePlaybackForScore(id);
    projects.erase(id); loadProfiles.erase(id);
}
EMSCRIPTEN_KEEPALIVE const uint8_t* saveXml(uintptr_t id,int excerpt) {
    auto* score=getScore(id,excerpt); if(!score) return textResponse("Invalid score or unsupported excerpt",1);
    ByteArray xml; io::Buffer buffer(&xml); buffer.open(io::IODevice::WriteOnly);
    mu::iex::musicxml::saveXml(score,&buffer); buffer.close(); return response(xml);
}
EMSCRIPTEN_KEEPALIVE const uint8_t* saveMxl(uintptr_t id,int excerpt) {
    // Compressed MusicXML through upstream's Qt-free ZipWriter (container.xml + score.xml)
    auto* score=getScore(id,excerpt); if(!score) return textResponse("Invalid score or excerpt",1);
    ByteArray mxl; io::Buffer buffer(&mxl); buffer.open(io::IODevice::WriteOnly);
    const bool ok=mu::iex::musicxml::saveMxl(score,&buffer); buffer.close();
    return ok ? response(mxl) : textResponse("Could not write MXL",1);
}

// As upstream SvgWriter (and the 4.00 fork's): staff lines joined per system, then the page's elements in z order, each
// drawn under its own class (type name, plus "selected" as in the 4.00 bridge) so the editor can hit-test the SVG
static std::string svgClass(const EngravingItem* item, const Selection& selection)
{
    std::string cls = item->typeName();
    // Exactly the 4.00 fork's rule (svggenerator getClass): the item itself is the single selection, or a member of a
    // list or copyable range selection. Not item->selected(): segments of a selected spanner would be marked, and the
    // editor treats a click on a "selected" element as a click on the current selection (it keeps it).
    const auto& elements = selection.elements();
    const bool member = std::find(elements.begin(), elements.end(), item) != elements.end();
    // A single selected spanner (4.7 selects the Ottava where 4.00 selected the segment) is drawn as its segments
    const bool singleSpanner = selection.isSingle() && item->isSpannerSegment()
                               && toSpannerSegment(item)->spanner() == selection.element();
    const bool selected = selection.isSingle() ? selection.element() == item || singleSpanner
                          : selection.isRange() ? selection.canCopy() && member
                          : selection.isList() && member;
    if (selected) cls += " selected";
    return cls;
}

static void paintSvgStaffLines(SvgPaint& svg, muse::draw::Painter& painter, Score* score, const Page* page,
                               const rendering::IScoreRenderer& renderer, const rendering::PaintOptions& opt)
{
    for (const System* system : page->systems()) {
        Measure* firstMeasure = system->firstMeasure();
        if (!firstMeasure) continue;   // only frames
        for (size_t staffIndex = 0; staffIndex < system->staves().size(); ++staffIndex) {
            if (!score->staff(staffIndex)->show() || !system->staff(staffIndex)->show()) continue;
            StaffLines* joined = nullptr;
            Shape joinedShape, joinedMask;
            const StaffType* prevType = nullptr;
            auto flush = [&] {
                if (!joined) return;
                joined->mutldata()->setShape(joinedShape);
                joined->mutldata()->setMask(joinedMask);
                svg.setElementClass(svgClass(joined, score->selection()));
                renderer.paintItem(painter, joined, opt);
                delete joined;
                joined = nullptr; prevType = nullptr; joinedShape = Shape(); joinedMask = Shape();
            };
            for (MeasureBase* mb = firstMeasure; mb; mb = system->nextMeasure(mb)) {
                if (!mb->isMeasure()) { flush(); continue; }
                Measure* m = toMeasure(mb);
                StaffLines* sl = m->staffLines(static_cast<int>(staffIndex));
                const bool shown = (m->visible(staffIndex) || m->isCutawayClef(staffIndex)) && sl->visible();
                if (!shown || score->staff(staffIndex)->staffType(m->tick()) != prevType) flush();
                if (!joined) {
                    if (!shown) continue;
                    joined = sl->clone();
                    joinedShape.add(sl->ldata()->shape());
                    joinedMask.add(sl->ldata()->mask());
                    prevType = score->staff(staffIndex)->staffType(m->tick());
                } else {
                    const double lastX = sl->ldata()->bbox().right() + sl->pagePos().x() - joined->pagePos().x();
                    std::vector<LineF> lines = joined->lines();
                    for (LineF& line : lines) line.setP2(PointF(lastX, line.p2().y()));
                    joined->setLines(lines);
                    joinedShape.add(sl->ldata()->shape().translated(sl->pagePos() - joined->pagePos()));
                    joinedMask.add(sl->ldata()->mask().translated(sl->pagePos() - joined->pagePos()));
                }
            }
            flush();
        }
    }
}

EMSCRIPTEN_KEEPALIVE const uint8_t* saveSvg(uintptr_t id,int page,bool background,bool highlight,int excerpt) {
    auto* score=getScore(id,excerpt);
    if(!score || page<0 || page>=int(score->npages())) return textResponse("Invalid score, excerpt or page",1);
    const Page* pg=score->pages().at(page);
    auto provider=std::make_shared<SvgPaint>();
    muse::draw::Painter painter(provider,"ms47-svg");
    painter.setAntialiasing(true);
    auto renderer=muse::modularity::globalIoc()->resolve<rendering::IScoreRenderer>("spike");
    painter.scale(ABI_UNIT,ABI_UNIT);   // SVG in ABI units (360 DPI), as the 4.00 SVG
    rendering::PaintOptions opt;
    opt.isPrinting=!highlight;       // printing hides selection colours and invisible elements
    const bool wasPrinting=score->printing();
    score->setPrinting(opt.isPrinting);
    MScore::pdfPrinting=opt.isPrinting;
    MScore::svgPrinting=true;
    paintSvgStaffLines(*provider,painter,score,pg,*renderer,opt);
    std::vector<EngravingItem*> elements=pg->elements();
    // elementLessThan without its "selected last" rule: the SVG's document order must not change when the selection
    // does (editor code and specs address elements by order; a click reordered every later .Note)
    std::stable_sort(elements.begin(),elements.end(),[](const EngravingItem* a,const EngravingItem* b) {
        if(a->z()!=b->z()) return a->z()<b->z();
        if(a->visible()!=b->visible()) return !a->visible();
        return a->track()<b->track();
    });
    for(const EngravingItem* element:elements) {
        if(!element->collectForDrawing() || element->ldata()->bbox().isEmpty() || element->isStaffLines()) continue;
        provider->setElementClass(svgClass(element,score->selection()));
        renderer->paintItem(painter,element,opt);
    }
    painter.endDraw();
    MScore::svgPrinting=false;
    MScore::pdfPrinting=false;
    score->setPrinting(wasPrinting);
    if(!provider->error().empty()) return textResponse(provider->error(),1);
    auto box=pg->ldata()->bbox();
    return textResponse(provider->svg(toAbi(box.width()),toAbi(box.height()),background));
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
    score->undoRedo(true,nullptr); layoutLinked(score); return true;
}
EMSCRIPTEN_KEEPALIVE bool redo(uintptr_t id,int excerpt) {
    auto* score=getScore(id,excerpt); if(!score) return false;
    score->undoRedo(false,nullptr); layoutLinked(score); return true;
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
#include "systemlocks.h"

#include "playbacktimeline.h"
#include "spannertools.h"
#include "frettools.h"
#include "parttools.h"
#include "metatools.h"
#include "layouttools.h"
#include "dragtools.h"
#include "miditools.h"
#include "playbacktools.h"
#include "pdfpaint.h"
#include "resourcetools.h"
