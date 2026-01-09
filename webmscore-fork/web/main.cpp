#include <emscripten/emscripten.h>

#include <QGuiApplication>
#include <QFontDatabase>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QTemporaryFile>
#include "global/log.h"
#include "global/defer.h"
#include "global/io/buffer.h"

#include "modularity/ioc.h"
#include "context/internal/globalcontext.h"
#include "notation/internal/notationconfiguration.h"
#include "global/io/internal/filesystem.h"
#include "global/internal/cryptographichash.h"
#include "draw/drawmodule.h"
#include "engraving/engravingmodule.h"
#include "mpe/mpemodule.h"
#include "importexport/musicxml/musicxmlmodule.h"
#include "importexport/guitarpro/guitarpromodule.h"
#include "importexport/midi/midimodule.h"
#include "importexport/imagesexport/imagesexportmodule.h"

#include "draw/ifontprovider.h"
#include "engraving/libmscore/score.h"
#include "project/internal/notationproject.h"
#include "engraving/engravingproject.h"
#include "engraving/compat/mscxcompat.h"
#include "project/internal/notationreadersregister.h"
#include "project/internal/notationwritersregister.h"
#include "engraving/libmscore/excerpt.h"
#include "engraving/libmscore/undo.h"
#include "engraving/libmscore/timesig.h"
#include "engraving/libmscore/clef.h"
#include "engraving/libmscore/factory.h"
#include "engraving/libmscore/note.h"
#include "engraving/libmscore/rest.h"
#include "converter/internal/compat/notationmeta.h"
#include "notation/internal/notation.h"
#include "notation/internal/mscnotationwriter.h"
#include "engraving/libmscore/chord.h"
#include "engraving/libmscore/editdata.h"
#include "engraving/libmscore/instrtemplate.h"
#include "engraving/libmscore/part.h"
#include "engraving/libmscore/property.h"
#include "importexport/midi/internal/midiexport/exportmidi.h"
#include "./importexport/positionjsonwriter.h"
#include "engraving/libmscore/page.h"
#include "engraving/libmscore/undo.h"
#include "engraving/libmscore/factory.h"
#include "engraving/libmscore/tempotext.h"
#include "engraving/libmscore/dynamic.h"
#include "engraving/libmscore/rehearsalmark.h"
#include "engraving/libmscore/articulation.h"
#include "engraving/libmscore/barline.h"
#include "engraving/libmscore/figuredbass.h"
#include "engraving/libmscore/text.h"
#include "engraving/libmscore/textbase.h"
#include "engraving/libmscore/segment.h"
#include "engraving/libmscore/volta.h"
#include "engraving/libmscore/key.h"
#include "engraving/libmscore/types.h"
#include "engraving/libmscore/navigate.h"
#include "engraving/infrastructure/imimedata.h"
#include "engraving/types/symnames.h"
#include "engraving/types/types.h"
#include "engraving/types/typesconv.h"
#include "engraving/types/constants.h"

#include "./score.h"
#include "./wasmres.h"
#include "./audio/audio.h"

using namespace mu;
using project::INotationWriter;

std::set<engraving::EngravingProjectPtr> instances;
static auto s_globalContext = std::make_shared<context::GlobalContext>();

namespace {
class SimpleMimeData final : public engraving::IMimeData {
public:
    SimpleMimeData(std::string mimeType, ByteArray data)
        : m_mimeType(std::move(mimeType))
        , m_data(std::move(data)) {}

    std::vector<std::string> formats() const override {
        return { m_mimeType };
    }

    bool hasFormat(const std::string& mimeType) const override {
        return mimeType == m_mimeType;
    }

    ByteArray data(const std::string& mimeType) const override {
        if (mimeType != m_mimeType) {
            return ByteArray();
        }
        return m_data;
    }

    bool hasImage() const override {
        return false;
    }

    std::shared_ptr<draw::Pixmap> imageData() const override {
        return nullptr;
    }

private:
    std::string m_mimeType;
    ByteArray m_data;
};
}

/**
 * MSCZ/MSCX file format version
 */
int _version() {
    return engraving::MSCVERSION;
}

/**
 * init libmscore
 */
void _init(int argc, char** argv) {
    setenv("QT_QPA_PLATFORM", "wasm", 1); // Force wasm platform; offscreen plugin is unavailable in browser
    setenv("QT_QPA_FONTDIR", "/fonts", 1);
    // Qt inspects argv for the platform choice; make sure it always sees "-platform wasm"
    static char arg0[] = "webmscore";
    static char arg1[] = "-platform";
    static char arg2[] = "wasm";
    char* forcedArgv[] = { arg0, arg1, arg2, nullptr };
    int forcedArgc = 3;
    new QGuiApplication(forcedArgc, forcedArgv);
    (void)argc;
    (void)argv;

    modularity::ioc()->registerExport<context::IGlobalContext>("", s_globalContext);
    modularity::ioc()->registerExport<notation::INotationConfiguration>("", new notation::NotationConfiguration());

    // src/framework/global/globalmodule.cpp#67
    modularity::ioc()->registerExport<io::IFileSystem>("", new io::FileSystem());
    modularity::ioc()->registerExport<ICryptographicHash>("", new CryptographicHash());

    // src/framework/draw/drawmodule.cpp
    auto drawM = new draw::DrawModule();
    drawM->registerExports();

    auto engM = new engraving::EngravingModule();
    engM->registerExports();
    engM->onInit(framework::IApplication::RunMode::Converter);
    auto mpeM = new mpe::MpeModule();
    mpeM->registerExports();

    // populate `engraving::instrumentGroups` and `engraving::instrumentTemplates`
    engraving::clearInstrumentTemplates();
    engraving::loadInstrumentTemplates("/instruments.xml");

    // file import/export
    modularity::ioc()->registerExport<project::INotationReadersRegister>("", new project::NotationReadersRegister());
    modularity::ioc()->registerExport<project::INotationWritersRegister>("", new project::NotationWritersRegister());
    auto mxlM = new iex::musicxml::MusicXmlModule();
    mxlM->registerExports();
    mxlM->resolveImports();
    auto gpM = new iex::guitarpro::GuitarProModule();
    gpM->registerExports();
    gpM->resolveImports();
    auto midiM = new iex::midi::MidiModule();
    midiM->registerExports();
    midiM->resolveImports();
    midiM->onInit(framework::IApplication::RunMode::Converter);
    auto imgM = new iex::imagesexport::ImagesExportModule();
    imgM->registerExports();
    imgM->resolveImports();
    imgM->onInit(framework::IApplication::RunMode::Converter);

    auto writers = modularity::ioc()->resolve<project::INotationWritersRegister>("");
    writers->reg({ engraving::MSCZ }, std::make_shared<notation::MscNotationWriter>(engraving::MscIoMode::Zip));
    // writers->reg({ engraving::MSCX }, std::make_shared<notation::MscNotationWriter>(engraving::MscIoMode::Dir));
    writers->reg({ engraving::MSCS }, std::make_shared<notation::MscNotationWriter>(engraving::MscIoMode::XmlFile));

    MainAudio::initModule();
}

/**
 * load (CJK) fonts on demand
 */
bool _addFont(const char* fontPath) {
    String _fontPath = String::fromUtf8(fontPath);
    auto fontProvider = modularity::ioc()->resolve<draw::IFontProvider>("");

    if (-1 == fontProvider->addTextFont(_fontPath)) {
        LOGE() << String(u"Cannot load font <%1>").arg(_fontPath);
        return false;
    } else {
        return true;
    }
}

/**
 * Load MSCX/MSCZ
 * https://github.com/LibreScore/webmscore/blob/v4.0/src/project/internal/notationproject.cpp#L187-L223
 */
Ret _doLoad(engraving::EngravingProjectPtr proj, QString filePath, bool doLayout) {
    // read score using the `compat` method
    engraving::Err err = engraving::compat::loadMsczOrMscx(proj->masterScore(), filePath, true);
    if (err != engraving::Err::NoError) {
        return make_ret(err);
    }

    engraving::MasterScore* score = proj->masterScore();
    IF_ASSERT_FAILED(score) {
        return make_ret(engraving::Err::UnknownError);
    }

    // make `score->update()` in `doSetupMasterScore` have no effect,
    // so that we could "do layout" later
    score->lockUpdates(true);
    DEFER {
        score->lockUpdates(false);
    };

    // Setup master score
    err = proj->setupMasterScore(true);
    if (err != engraving::Err::NoError) {
        return make_ret(err);
    }

    // do layout ...
    score->lockUpdates(false);
    if (doLayout) {
        score->setLayoutAll(); // FIXME: 
        score->update();
        score->switchToPageMode();  // the default _layoutMode is LayoutMode::PAGE, but the score file may be saved in continuous mode
    }

    return make_ok();
}

/**
 * Load other file formats
 * https://github.com/LibreScore/webmscore/blob/v4.0/src/project/internal/notationproject.cpp#L246-L291
 */
Ret _doImport(engraving::EngravingProjectPtr proj, QString filePath, bool doLayout) {
    // Find import reader
    std::string suffix = io::suffix(filePath.toStdString());
    auto readers = modularity::ioc()->resolve<project::INotationReadersRegister>("");
    project::INotationReaderPtr scoreReader = readers->reader(suffix);
    if (!scoreReader) {
        return make_ret(engraving::Err::FileUnknownType);
    }

    // Setup import reader
    project::INotationReader::Options options;
    options[project::INotationReader::OptionKey::ForceMode] = Val(true);

    // Read(import) master score
    engraving::MasterScore* score = proj->masterScore();
    Ret ret = scoreReader->read(score, filePath, options);
    if (!ret.success()) {
        return ret;
    }

    // post-processing for non-native formats
    score->setMetaTag(u"originalFormat", QString::fromStdString(suffix));
    score->connectTies(); // HACK: ???

    if (!doLayout) {
        // make `score->update()` in `doSetupMasterScore` have no effect
        score->lockUpdates(true);
        DEFER {
            score->lockUpdates(false);
        };
    }

    // Setup master score
    engraving::Err err = proj->setupMasterScore(true);
    if (err != engraving::Err::NoError) {
        return make_ret(err);
    }

    return make_ok();
}

/**
 * load score
 */
WasmRes _load(const char* format, const char* data, const uint32_t size, bool doLayout) {
    String _format = String::fromUtf8(format);  // file format of the data

    // create a temporary file, and write `data` into it
    QTemporaryFile tempfile("XXXXXX." + _format);  // filename template for the temporary file
    if (!tempfile.open()) { // a QTemporaryFile will always be opened in `QIODevice::ReadWrite` mode
        throw QString("Cannot create a temporary file");
    } else {
        tempfile.write(data, size);
        tempfile.close(); // calls QFileDevice::flush() and closes the file
    }
    QString filePath = tempfile.fileName(); // temporary filename
    DEFER {
        // delete the temporary file
        tempfile.remove();
    };

    // create notation & engraving project
    auto notationProj = std::make_shared<project::NotationProject>();
    notationProj->setupProject();
    notationProj->setPath(filePath);
    s_globalContext->setCurrentProject(notationProj);

    // save smart pointer to keep the object alive
    auto proj = notationProj->m_engravingProject;
    instances.insert(proj);
    // // `MasterScore::name()` requires a `FileInfoProvider` to get the file name, etc.
    // proj->setFileInfoProvider(std::make_shared<engraving::LocalFileInfoProvider>(filePath));
    
    // do load
    Ret ret = engraving::isMuseScoreFile(format)
        ? _doLoad(proj, filePath, doLayout)
        : _doImport(proj, filePath, doLayout);

    // handle exceptions
    if (!ret.success()) {
        return WasmRes::fromRet(ret);
    }

    engraving::MasterScore* score = proj->masterScore();
    notationProj->m_masterNotation->setMasterScore(score);

    auto score_ptr = reinterpret_cast<uintptr_t>(score);
    return WasmRes(score_ptr);
}

/**
 * Generate excerpts from Parts (only parts that are visible) if no existing excerpts
 */
void _generateExcerpts(uintptr_t score_ptr) {
    MainScore score(score_ptr);

    auto scoreExcerpts = score->excerpts();
    if (scoreExcerpts.size() > 0) {
        // has existing excerpts
        return;
    }

    auto parts = score->parts();
    auto excerpts = engraving::Excerpt::createExcerptsFromParts(parts);

    // TODO: testing
    // https://github.com/LibreScore/webmscore/blob/v4.0/src/engraving/libmscore/unrollrepeats.cpp#L99-L117
    for (auto e : excerpts) {
        engraving::Score* nscore = e->masterScore()->createScore();
        e->setExcerptScore(nscore);
        nscore->style().set(engraving::Sid::createMultiMeasureRests, true);
        auto excerptCmdFake = new engraving::AddExcerpt(e);
        excerptCmdFake->redo(nullptr);
        engraving::Excerpt::createExcerpt(e);

        // add this excerpt back to the score excerpt list
        scoreExcerpts.push_back(e);
    }

    LOGI() << String(u"Generated excerpts: size %1").arg((int)excerpts.size());
}

/**
 * get the score title
 */
WasmRes _title(uintptr_t score_ptr) {
    MainScore score(score_ptr);
    // https://github.com/LibreScore/webmscore/blob/v4.0/src/converter/internal/compat/notationmeta.cpp#L89-L107
    String title = converter::NotationMeta::title(score);
    return WasmRes(title);
}

/**
 * get the score subtitle
 */
WasmRes _subtitle(uintptr_t score_ptr) {
    MainScore score(score_ptr);
    String subtitle;
    const engraving::Text* text = score->getText(engraving::TextStyleType::SUBTITLE);
    if (text) {
        subtitle = text->plainText();
    }
    return WasmRes(subtitle);
}

bool _setHeaderText(uintptr_t score_ptr, engraving::TextStyleType style, const char* plainText, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    const String text = plainText ? String::fromUtf8(plainText) : String();

    score->startCmd();
    engraving::TextBase* header = score->getText(style);
    if (!header) {
        header = score->addText(style, nullptr, /*addToAllScores*/ false);
    }
    if (!header) {
        score->endCmd();
        LOGW() << "setHeaderText: failed to locate or create header text";
        return false;
    }

    header->undoChangeProperty(engraving::Pid::TEXT, engraving::TextBase::plainToXmlText(text));
    score->endCmd();
    return true;
}

bool _setTitleText(uintptr_t score_ptr, const char* plainText, int excerptId)
{
    return _setHeaderText(score_ptr, engraving::TextStyleType::TITLE, plainText, excerptId);
}

bool _setSubtitleText(uintptr_t score_ptr, const char* plainText, int excerptId)
{
    return _setHeaderText(score_ptr, engraving::TextStyleType::SUBTITLE, plainText, excerptId);
}

bool _setComposerText(uintptr_t score_ptr, const char* plainText, int excerptId)
{
    return _setHeaderText(score_ptr, engraving::TextStyleType::COMPOSER, plainText, excerptId);
}

static String _plainTextToString(const char* plainText)
{
    return plainText ? String::fromUtf8(plainText) : String();
}

static bool _applyTextStyle(MainScore& score, engraving::TextStyleType style, const char* plainText)
{
    engraving::EngravingItem* target = score->selection().element();
    if (!target) {
        LOGW() << "addText: no selection";
        return false;
    }

    score->startCmd();
    engraving::TextBase* textItem = score->addText(style, target);
    if (!textItem) {
        score->endCmd();
        LOGW() << "addText: failed to create text style" << static_cast<int>(style);
        return false;
    }

    const String xmlText = engraving::TextBase::plainToXmlText(_plainTextToString(plainText));
    textItem->undoChangeProperty(engraving::Pid::TEXT, xmlText);
    score->endCmd();
    return true;
}

static bool _addTextForStyle(uintptr_t score_ptr, engraving::TextStyleType style, const char* plainText, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    return _applyTextStyle(score, style, plainText);
}

static bool _addFiguredBass(uintptr_t score_ptr, const char* plainText, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    score->startCmd();
    engraving::FiguredBass* fb = score->addFiguredBass();
    if (!fb) {
        score->endCmd();
        LOGW() << "addFiguredBassText: failed to create figured bass";
        return false;
    }

    const String xmlText = engraving::TextBase::plainToXmlText(_plainTextToString(plainText));
    fb->undoChangeProperty(engraving::Pid::TEXT, xmlText);
    score->endCmd();
    return true;
}

static engraving::TextStyleType _harmonyStyle(int variant)
{
    switch (variant) {
        case 1:
            return engraving::TextStyleType::HARMONY_ROMAN;
        case 2:
            return engraving::TextStyleType::HARMONY_NASHVILLE;
        default:
            return engraving::TextStyleType::HARMONY_A;
    }
}

static engraving::Part* partFromIndex(MainScore& score, int partIndex)
{
    const auto& parts = score->parts();
    if (partIndex < 0 || partIndex >= static_cast<int>(parts.size())) {
        return nullptr;
    }
    return parts.at(static_cast<size_t>(partIndex));
}

static bool selectionMeasureRange(MainScore& score, engraving::Measure*& startMeasure, engraving::Measure*& endMeasure)
{
    startMeasure = nullptr;
    endMeasure = nullptr;

    if (score->selection().isNone()) {
        return false;
    }

    if (score->selection().isRange() && score->selection().measureRange(&startMeasure, &endMeasure)) {
        return startMeasure != nullptr;
    }

    engraving::Measure* measure = score->selection().findMeasure();
    if (!measure) {
        if (auto cr = score->selection().cr()) {
            measure = cr->measure();
            if (!measure) {
                measure = score->tick2measure(cr->tick());
            }
        }
    }

    if (!measure) {
        return false;
    }

    startMeasure = measure;
    endMeasure = measure;
    return true;
}

static engraving::BarLine* ensureEndBarLine(engraving::Measure* measure)
{
    if (!measure) {
        return nullptr;
    }

    const engraving::BarLine* existing = measure->endBarLine();
    if (existing) {
        return const_cast<engraving::BarLine*>(existing);
    }

    engraving::Segment* segment = measure->undoGetSegmentR(engraving::SegmentType::EndBarLine, measure->ticks());
    if (!segment) {
        return nullptr;
    }

    engraving::BarLine* barLine = engraving::toBarLine(segment->element(0));
    if (!barLine) {
        barLine = engraving::Factory::createBarLine(segment);
        if (!barLine) {
            return nullptr;
        }
        barLine->setParent(segment);
        barLine->setTrack(0);
        barLine->setGenerated(false);
        if (auto staff = measure->score()->staff(0)) {
            barLine->setSpanStaff(staff->barLineSpan());
            barLine->setSpanFrom(staff->barLineFrom());
            barLine->setSpanTo(staff->barLineTo());
        }
        measure->score()->undoAddElement(barLine);
    }

    return barLine;
}

bool _appendPart(uintptr_t score_ptr, const char* instrumentId, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    if (!instrumentId) {
        LOGW() << "appendPart: missing instrument id";
        return false;
    }
    const String id = String::fromUtf8(instrumentId);
    const engraving::InstrumentTemplate* templ = engraving::searchTemplate(id);
    if (!templ) {
        LOGW() << "appendPart: instrument id not found" << id;
        return false;
    }

    score->startCmd();
    score->appendPart(templ);
    score->endCmd();
    return true;
}

bool _appendPartByMusicXmlId(uintptr_t score_ptr, const char* instrumentMusicXmlId, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    if (!instrumentMusicXmlId) {
        LOGW() << "appendPartByMusicXmlId: missing instrument id";
        return false;
    }
    const String id = String::fromUtf8(instrumentMusicXmlId);
    const engraving::InstrumentTemplate* templ = engraving::searchTemplateForMusicXmlId(id);
    if (!templ) {
        LOGW() << "appendPartByMusicXmlId: instrument id not found" << id;
        return false;
    }

    score->startCmd();
    score->appendPart(templ);
    score->endCmd();
    return true;
}

bool _removePart(uintptr_t score_ptr, int partIndex, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    engraving::Part* part = partFromIndex(score, partIndex);
    if (!part) {
        LOGW() << "removePart: invalid part index" << partIndex;
        return false;
    }

    score->startCmd();
    score->cmdRemovePart(part);
    score->endCmd();
    return true;
}

bool _setPartVisible(uintptr_t score_ptr, int partIndex, bool visible, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    engraving::Part* part = partFromIndex(score, partIndex);
    if (!part) {
        LOGW() << "setPartVisible: invalid part index" << partIndex;
        return false;
    }

    score->startCmd();
    part->undoChangeProperty(engraving::Pid::VISIBLE, visible);
    score->endCmd();
    return true;
}

WasmRes _listInstrumentTemplates()
{
    QJsonArray groupsJson;

    for (const engraving::InstrumentGroup* group : engraving::instrumentGroups) {
        QJsonObject groupJson;
        groupJson.insert("id", group->id.toQString());
        groupJson.insert("name", group->name.toQString());

        QJsonArray instrumentsJson;
        for (const engraving::InstrumentTemplate* templ : group->instrumentTemplates) {
            QJsonObject instrumentJson;
            String name = templ->longNames.empty()
                ? templ->trackName
                : templ->longNames.front().toPlainText();
            instrumentJson.insert("id", templ->id.toQString());
            instrumentJson.insert("name", name.toQString());
            instrumentJson.insert("groupId", templ->groupId.toQString());
            instrumentJson.insert("groupName", group->name.toQString());
            instrumentJson.insert("familyId", templ->family ? templ->family->id.toQString() : QString());
            instrumentJson.insert("familyName", templ->family ? templ->family->name.toQString() : QString());
            instrumentJson.insert("staffCount", static_cast<int>(templ->staffCount));
            instrumentJson.insert("isExtended", templ->extended);
            instrumentsJson.append(instrumentJson);
        }
        groupJson.insert("instruments", instrumentsJson);
        groupsJson.append(groupJson);
    }

    return WasmRes(QJsonDocument(groupsJson).toJson(QJsonDocument::Compact));
}

bool _addNoteFromRest(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    engraving::EngravingItem* selected = score->selection().element();
    if (!selected) {
        LOGW() << "addNoteFromRest: no selection";
        return false;
    }
    if (!selected->isRest()) {
        LOGW() << "addNoteFromRest: selection is not a rest";
        return false;
    }

    engraving::Rest* rest = engraving::toRest(selected);
    engraving::Segment* segment = rest->segment();
    if (!segment) {
        LOGW() << "addNoteFromRest: rest has no segment";
        return false;
    }

    engraving::Staff* staff = rest->staff();
    if (!staff) {
        LOGW() << "addNoteFromRest: rest has no staff";
        return false;
    }

    engraving::Position pos;
    pos.segment = segment;
    pos.staffIdx = rest->staffIdx();
    pos.line = staff->middleLine(segment->tick());

    bool error = false;
    engraving::NoteVal nval = score->noteValForPosition(pos, engraving::AccidentalType::NONE, error);
    if (error) {
        LOGW() << "addNoteFromRest: failed to compute note value";
        return false;
    }

    score->startCmd();
    score->setNoteRest(segment, rest->track(), nval, rest->durationTypeTicks(), engraving::DirectionV::AUTO);
    score->endCmd();
    return true;
}

bool _toggleRepeatStart(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    engraving::Measure* startMeasure = nullptr;
    engraving::Measure* endMeasure = nullptr;
    if (!selectionMeasureRange(score, startMeasure, endMeasure) || !startMeasure) {
        LOGW() << "toggleRepeatStart: no measure selected";
        return false;
    }

    engraving::Measure* target = startMeasure->isMMRest() ? startMeasure->mmRestFirst() : startMeasure;
    if (!target) {
        LOGW() << "toggleRepeatStart: invalid target measure";
        return false;
    }

    for (size_t staffIdx = 0; staffIdx < score->nstaves(); ++staffIdx) {
        if (target->isMeasureRepeatGroupWithPrevM(staffIdx)) {
            LOGW() << "toggleRepeatStart: cannot split measure repeat group";
            return false;
        }
    }

    const bool nextState = !target->repeatStart();
    score->startCmd();
    target->undoChangeProperty(engraving::Pid::REPEAT_START, nextState);
    score->endCmd();
    return true;
}

bool _toggleRepeatEnd(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    engraving::Measure* startMeasure = nullptr;
    engraving::Measure* endMeasure = nullptr;
    if (!selectionMeasureRange(score, startMeasure, endMeasure) || !endMeasure) {
        LOGW() << "toggleRepeatEnd: no measure selected";
        return false;
    }

    engraving::Measure* target = endMeasure->isMMRest() ? endMeasure->mmRestLast() : endMeasure;
    if (!target) {
        LOGW() << "toggleRepeatEnd: invalid target measure";
        return false;
    }

    for (size_t staffIdx = 0; staffIdx < score->nstaves(); ++staffIdx) {
        if (target->isMeasureRepeatGroupWithNextM(staffIdx)) {
            LOGW() << "toggleRepeatEnd: cannot split measure repeat group";
            return false;
        }
    }

    const bool nextState = !target->repeatEnd();
    score->startCmd();
    target->undoChangeProperty(engraving::Pid::REPEAT_END, nextState);
    score->endCmd();
    return true;
}

bool _setRepeatCount(uintptr_t score_ptr, int count, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    if (count < 2) {
        LOGW() << "setRepeatCount: invalid repeat count " << count;
        return false;
    }

    engraving::Measure* startMeasure = nullptr;
    engraving::Measure* endMeasure = nullptr;
    if (!selectionMeasureRange(score, startMeasure, endMeasure) || !endMeasure) {
        LOGW() << "setRepeatCount: no measure selected";
        return false;
    }

    engraving::Measure* target = endMeasure->isMMRest() ? endMeasure->mmRestLast() : endMeasure;
    if (!target) {
        LOGW() << "setRepeatCount: invalid target measure";
        return false;
    }

    for (size_t staffIdx = 0; staffIdx < score->nstaves(); ++staffIdx) {
        if (target->isMeasureRepeatGroupWithNextM(staffIdx)) {
            LOGW() << "setRepeatCount: cannot split measure repeat group";
            return false;
        }
    }

    score->startCmd();
    if (!target->repeatEnd()) {
        target->undoChangeProperty(engraving::Pid::REPEAT_END, true);
    }
    target->undoChangeProperty(engraving::Pid::REPEAT_COUNT, count);
    score->endCmd();
    return true;
}

bool _setBarLineType(uintptr_t score_ptr, int barLineType, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    engraving::Measure* startMeasure = nullptr;
    engraving::Measure* endMeasure = nullptr;
    if (!selectionMeasureRange(score, startMeasure, endMeasure) || !endMeasure) {
        LOGW() << "setBarLineType: no measure selected";
        return false;
    }

    engraving::Measure* target = endMeasure->isMMRest() ? endMeasure->mmRestLast() : endMeasure;
    if (!target) {
        LOGW() << "setBarLineType: invalid target measure";
        return false;
    }

    const auto type = static_cast<engraving::BarLineType>(barLineType);
    switch (type) {
    case engraving::BarLineType::NORMAL:
    case engraving::BarLineType::DOUBLE:
    case engraving::BarLineType::END:
    case engraving::BarLineType::BROKEN:
    case engraving::BarLineType::DOTTED:
    case engraving::BarLineType::REVERSE_END:
    case engraving::BarLineType::HEAVY:
    case engraving::BarLineType::DOUBLE_HEAVY:
        break;
    default:
        LOGW() << "setBarLineType: unsupported barline type " << barLineType;
        return false;
    }

    score->startCmd();
    engraving::BarLine* barLine = ensureEndBarLine(target);
    if (!barLine) {
        score->endCmd();
        LOGW() << "setBarLineType: failed to locate or create barline";
        return false;
    }
    barLine->undoChangeProperty(engraving::Pid::BARLINE_TYPE, engraving::PropertyValue::fromValue(type));
    score->endCmd();
    return true;
}

bool _addVolta(uintptr_t score_ptr, int endingNumber, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    if (endingNumber < 1) {
        LOGW() << "addVolta: invalid ending number " << endingNumber;
        return false;
    }

    engraving::Measure* startMeasure = nullptr;
    engraving::Measure* endMeasure = nullptr;
    if (!selectionMeasureRange(score, startMeasure, endMeasure) || !startMeasure) {
        LOGW() << "addVolta: no measure selected";
        return false;
    }

    engraving::Measure* start = startMeasure->isMMRest() ? startMeasure->mmRestFirst() : startMeasure;
    engraving::Measure* end = endMeasure ? (endMeasure->isMMRest() ? endMeasure->mmRestLast() : endMeasure) : start;
    if (!start || !end) {
        LOGW() << "addVolta: invalid target range";
        return false;
    }

    engraving::Segment* startSegment = start->first(engraving::SegmentType::ChordRest);
    if (!startSegment) {
        startSegment = start->first();
    }
    engraving::Segment* endSegment = end->last();
    if (!startSegment || !endSegment) {
        LOGW() << "addVolta: missing segment for range";
        return false;
    }

    auto volta = engraving::Factory::createVolta(score->dummy());
    if (!volta) {
        LOGW() << "addVolta: Factory returned null";
        return false;
    }
    volta->endings().clear();
    volta->endings().push_back(endingNumber);
    volta->setText(String(u"%1.").arg(endingNumber));

    score->startCmd();
    score->cmdAddSpanner(volta, 0, startSegment, endSegment);
    score->endCmd();
    return true;
}

/**
 * get the number of pages
 */
WasmRes _npages(uintptr_t score_ptr, int excerptId) {
    MainScore score(score_ptr, excerptId);
    return WasmRes(score->npages());
}

/**
 * Export score file using one of the `NotationWriter`s
 * https://github.com/LibreScore/webmscore/blob/v4.0/src/converter/internal/compat/backendapi.cpp#L465-L491
 */
Ret processWriter(String writerName, engraving::MasterScore * score, QIODevice & device, const INotationWriter::Options& options = INotationWriter::Options()) {
    // Find file writer
    auto writers = modularity::ioc()->resolve<project::INotationWritersRegister>("");
    auto writer = writers->writer(writerName.toStdString());
    if (!writer) {
        LOGE() << "Not found writer " << writerName;
        return make_ret(Ret::Code::InternalError);
    }

    // FIXME: persist this `Notation` object
    auto notation = std::make_shared<notation::Notation>(score);

    // Write
    Ret writeRet = writer->write(notation, device, options);
    if (!writeRet) {
        LOGE() << writeRet.toString();
        return writeRet;
    }

    return make_ok();

}

Ret processWriter(String writerName, engraving::MasterScore * score, QByteArray* buffer, const INotationWriter::Options& options = INotationWriter::Options()) {
    QBuffer device(buffer);
    device.open(QIODevice::ReadWrite);
    DEFER {
        device.close();
    };
    
    return processWriter(writerName, score, device, options);
}

/**
 * export score as MusicXML file
 */
WasmRes _saveXml(uintptr_t score_ptr, int excerptId) {
    MainScore score(score_ptr, excerptId);

    QByteArray data;
    processWriter(u"xml", score, &data);
    LOGI() << String(u"excerpt %1, size %2 bytes").arg(excerptId, data.size());

    return WasmRes(data);
}

/**
 * export score as compressed MusicXML file
 */
WasmRes _saveMxl(uintptr_t score_ptr, int excerptId) {
    MainScore score(score_ptr, excerptId);

    QByteArray data;
    processWriter(u"mxl", score, &data);
    LOGI() << String(u"excerpt %1, size %2 bytes").arg(excerptId, data.size());

    return WasmRes(data);
}

/**
 * save part score as MSCZ/MSCX file
 */
WasmRes _saveMsc(uintptr_t score_ptr, bool compressed, int excerptId) {
    MainScore score(score_ptr, excerptId);

    if (!score->isMaster()) {  // clone metaTags from masterScore
        auto j(score->masterScore()->metaTags());
        for (auto p : j) {
            if (p.first != "partName")  // don't copy "partName" should that exist in masterScore
                score->metaTags().insert({p.first, p.second});
            score->metaTags().insert({u"platform", u"webmscore"});
            score->metaTags().insert({u"source", u"https://github.com/LibreScore/webmscore"});
            score->metaTags().insert({u"creationDate", Date::currentDate().toString()});  // update "creationDate"
        }
    }

    QByteArray data;
    Ret ret = processWriter(u"mscz", score, &data);
    if (!ret.success()) {
        return WasmRes::fromRet(ret);
    }

    if (!compressed) {
        // HACK: read the .mscx file inside mscz
        // In MuseScore 4, the so-called "mscx" is exported as a directory
        io::Buffer msczBuf((const uint8_t*)data.constData(), data.size());
        engraving::MscReader::Params params;
        params.device = &msczBuf;
        params.mode = engraving::MscIoMode::Zip;

        engraving::MscReader reader(params);
        reader.open();
        data = reader.readScoreFile().toQByteArray(); // can't use `NoCopy` here because `msczBuf` is destroyed as the code block ends
    }

    if (!score->isMaster()) {  // remove metaTags added above
        auto j(score->masterScore()->metaTags());
        for (auto p : j) {
            // remove all but "partName", should that exist in masterScore
            if (p.first != "partName")
                score->metaTags().erase(p.first);
        }
    }

    LOGI() << String(u"compressed %1, excerpt %2, size %3").arg(compressed, excerptId, data.size());
    return WasmRes(data);
}

/**
 * export score as SVG
 */
WasmRes _saveSvg(uintptr_t score_ptr, int pageNumber, bool drawPageBackground, int excerptId) {
    MainScore score(score_ptr, excerptId);

    // config
    score->switchToPageMode();
    INotationWriter::Options options {
        { INotationWriter::OptionKey::PAGE_NUMBER, Val(pageNumber) },
        { INotationWriter::OptionKey::TRANSPARENT_BACKGROUND, Val(!drawPageBackground) },
        // { INotationWriter::OptionKey::BEATS_COLORS, Val::fromQVariant(beatsColors) }
    };

    QByteArray data;
    Ret ret = processWriter(u"svg", score, &data, options);
    LOGI() << String(u"excerpt %1, page index %2, size %3 bytes").arg(excerptId, pageNumber, data.size());
    if (!ret.success()) {
        return WasmRes::fromRet(ret);
    }

    return WasmRes(data);
}

/**
 * export score as PNG
 */
WasmRes _savePng(uintptr_t score_ptr, int pageNumber, bool drawPageBackground, bool transparent, int excerptId) {
    MainScore score(score_ptr, excerptId);

    // config
    score->switchToPageMode();
    INotationWriter::Options options {
        { INotationWriter::OptionKey::PAGE_NUMBER, Val(pageNumber) },
        { INotationWriter::OptionKey::TRANSPARENT_BACKGROUND, Val(!drawPageBackground) },
    };

    QByteArray data;
    Ret ret = processWriter(u"png", score, &data, options);
    LOGI() << String(u"excerpt %1, page index %2, drawPageBackground %3, transparent %4, size %5 bytes").arg(excerptId).arg(pageNumber).arg(drawPageBackground).arg(transparent).arg(data.size());
    if (!ret.success()) {
        return WasmRes::fromRet(ret);
    }

    return WasmRes(data);
}

/**
 * export score as PDF
 */
WasmRes _savePdf(uintptr_t score_ptr, int excerptId) {
    MainScore score(score_ptr, excerptId);

    INotationWriter::Options options;
    // options[INotationWriter::OptionKey::UNIT_TYPE] = Val(INotationWriter::UnitType::MULTI_PART);

    QByteArray data;
    Ret ret = processWriter(u"pdf", score, &data, options);
    LOGI() << String(u"excerpt %1, size %2 bytes").arg(excerptId, data.size());
    if (!ret.success()) {
        return WasmRes::fromRet(ret);
    }

    return WasmRes(data);
}

/**
 * export score as MIDI
 */
WasmRes _saveMidi(uintptr_t score_ptr, bool midiExpandRepeats, bool exportRPNs, int excerptId) {
    MainScore score(score_ptr, excerptId);

    QBuffer buffer;
    buffer.open(QIODevice::ReadWrite);

    // TODO: refactor to `INotationWriter`
    // use `exportMidi.write` directly
    // https://github.com/LibreScore/webmscore/blob/v4.0/src/importexport/midi/internal/notationmidiwriter.cpp#L57-L64
    iex::midi::ExportMidi exportMidi(score);
    auto synthesizerState = score->synthesizerState();
    exportMidi.write(&buffer, midiExpandRepeats, exportRPNs, synthesizerState);

    int size = buffer.size();
    LOGI() << String(u"excerpt %1, midiExpandRepeats %2, exportRPNs %3, size %4").arg(excerptId).arg(midiExpandRepeats).arg(exportRPNs).arg(size);

    return WasmRes(buffer.data());
}

/**
 * export score as AudioFile (wav/ogg)
 */
WasmRes _saveAudio(uintptr_t score_ptr, const char* format, int excerptId) {
    MainScore score(score_ptr, excerptId);

    // file format of the output file
    // "wav", "ogg", "flac", or "mp3"
    QString _format = QString::fromUtf8(format);
    if (!(_format == "wav" || _format == "ogg" || _format == "flac" || _format == "mp3")) {
        throw QString("Invalid output format");
    }

    // save audio data to a temporary file
    QTemporaryFile tempfile("XXXXXX." + _format);  // filename template for the temporary file
    if (!tempfile.open()) {
        throw QString("Cannot create a temporary file");
    }

    Ret ret = processWriter(_format, score, tempfile);
    int size = tempfile.size();
    QByteArray data = tempfile.readAll();
    
    LOGI() << String(u"excerpt %1, size %2").arg(excerptId).arg(size);
    if (!ret.success()) {
        return WasmRes::fromRet(ret);
    }

    return WasmRes(data);
}

/**
 * save positions of measures or segments (if the `ofSegments` param == true) as JSON
 */
WasmRes _savePositions(uintptr_t score_ptr, bool ofSegments, int excerptId) {
    MainScore score(score_ptr, excerptId);
    score->switchToPageMode();

    using W = notation::PositionJsonWriter;
    W writer(ofSegments ? W::ElementType::SEGMENT : W::ElementType::MEASURE);
    
    QByteArray data = writer.jsonData(score);
    LOGI() << String(u"excerpt %1, ofSegments %2, file size %3").arg(excerptId).arg(ofSegments).arg(data.size());

    return WasmRes(data);
}

/**
 * save score metadata as JSON
 */
WasmRes _saveMetadata(uintptr_t score_ptr) {
    MainScore score(score_ptr);
    auto result = converter::NotationMeta::metaJson(score);
    auto data = result.val;
    return WasmRes(
        ByteArray(data.data(), data.size()) // UTF-8 encoded JSON data
    );
}

// ---------------------------
//  Interaction helpers
// ---------------------------

static bool elementLower(const engraving::EngravingItem* e1, const engraving::EngravingItem* e2)
{
    if (!e1->selectable()) {
        return false;
    }
    if (!e2->selectable()) {
        return true;
    }
    return e1->z() < e2->z();
}

bool _selectElementAtPoint(uintptr_t score_ptr, int pageNumber, double x, double y, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    const auto& pages = score->pages();

    if (pageNumber < 0 || pageNumber >= (int)pages.size()) {
        LOGW() << "selectElementAtPoint: invalid page index " << pageNumber;
        return false;
    }

    engraving::Page* page = pages.at(pageNumber);
    const mu::PointF pt(x, y);

    auto items = page->items(pt);
    if (items.empty()) {
        return false;
    }

    std::sort(items.begin(), items.end(), elementLower);
    engraving::EngravingItem* target = items.front();

    // Skip page frames
    if (target && target->isPage()) {
        target = items.size() > 1 ? items.at(1) : nullptr;
    }

    if (!target) {
        return false;
    }

    score->deselectAll();
    score->select(target, engraving::SelectType::SINGLE, target->staffIdx());
    score->updateSelection();
    score->setSelectionChanged(true);
    return true;
}

bool _clearSelection(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    score->deselectAll();
    score->updateSelection();
    score->setSelectionChanged(true);
    return true;
}

WasmRes _selectionMimeType(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    return WasmRes(score->selection().mimeType());
}

WasmRes _selectionMimeData(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    return WasmRes(score->selection().mimeData());
}

bool _pasteSelection(uintptr_t score_ptr, const char* mimeType, const char* data, uint32_t size, int excerptId)
{
    if (!mimeType || !data || size == 0) {
        return false;
    }

    MainScore score(score_ptr, excerptId);
    const ByteArray payload(data, size);
    SimpleMimeData mime(std::string(mimeType), payload);

    score->startCmd();
    score->cmdPaste(&mime, nullptr);
    score->endCmd();
    return true;
}

bool _selectElementAtPointWithMode(uintptr_t score_ptr, int pageNumber, double x, double y, int mode, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    const auto& pages = score->pages();

    if (pageNumber < 0 || pageNumber >= (int)pages.size()) {
        LOGW() << "selectElementAtPointWithMode: invalid page index " << pageNumber;
        return false;
    }

    // 0 = replace, 1 = add, 2 = toggle
    if (mode < 0 || mode > 2) {
        LOGW() << "selectElementAtPointWithMode: invalid selection mode " << mode;
        return false;
    }

    engraving::Page* page = pages.at(pageNumber);
    const mu::PointF pt(x, y);

    auto items = page->items(pt);
    if (items.empty()) {
        return false;
    }

    std::sort(items.begin(), items.end(), elementLower);
    engraving::EngravingItem* target = items.front();

    // Skip page frames
    if (target && target->isPage()) {
        target = items.size() > 1 ? items.at(1) : nullptr;
    }

    if (!target) {
        return false;
    }

    if (mode == 0) {
        score->deselectAll();
        score->select(target, engraving::SelectType::SINGLE, target->staffIdx());
    } else if (mode == 1) {
        score->select(target, engraving::SelectType::ADD, target->staffIdx());
    } else {
        if (target->selected()) {
            score->deselect(target);
        } else {
            score->select(target, engraving::SelectType::ADD, target->staffIdx());
        }
    }

    score->updateSelection();
    score->setSelectionChanged(true);
    return true;
}

bool _deleteSelection(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    score->startCmd();
    score->cmdDeleteSelection();
    score->endCmd();
    return true;
}

bool _pitchUp(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    score->startCmd();
    score->cmdPitchUp();
    score->endCmd();
    return true;
}

bool _pitchDown(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    score->startCmd();
    score->cmdPitchDown();
    score->endCmd();
    return true;
}

bool _transpose(uintptr_t score_ptr, int semitones, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    if (semitones == 0) {
        return true;
    }

    const bool hadSelection = !score->selection().isNone();
    if (!hadSelection) {
        score->cmdSelectAll();
        if (score->selection().isNone()) {
            LOGW() << "transpose: score is empty";
            return false;
        }
    }

    score->startCmd();
    score->upDownDelta(semitones);
    score->endCmd();

    if (!hadSelection) {
        score->deselectAll();
        score->setSelectionChanged(true);
    }

    return true;
}

bool _setAccidental(uintptr_t score_ptr, int accidentalType, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    if (accidentalType < 0 || accidentalType >= static_cast<int>(engraving::AccidentalType::END)) {
        LOGW() << "setAccidental: invalid accidental type " << accidentalType;
        return false;
    }
    if (score->selection().isNone()) {
        LOGW() << "setAccidental: no selection";
        return false;
    }

    score->startCmd();
    score->changeAccidental(static_cast<engraving::AccidentalType>(accidentalType));
    score->endCmd();
    return true;
}

bool _doubleDuration(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);
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
    score->startCmd();
    score->cmdDoubleDuration();
    score->endCmd();
    return true;
}

bool _halfDuration(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);
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
    score->startCmd();
    score->cmdHalfDuration();
    score->endCmd();
    return true;
}

bool _undo(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    score->undoRedo(/* undo */ true, nullptr);
    return true;
}

bool _redo(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    score->undoRedo(/* undo */ false, nullptr);
    return true;
}

bool _relayout(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    score->setLayoutAll();
    score->update();
    return true;
}

bool _toggleDot(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);
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

    score->startCmd();
    if (cr->isChord() && (toChord(cr)->noteType() != engraving::NoteType::NORMAL)) {
        score->undoChangeChordRestLen(cr, d);
    } else {
        score->changeCRlen(cr, d);
    }
    score->inputState().setDuration(d);
    score->endCmd();
    return true;
}

bool _toggleDoubleDot(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);
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

    score->startCmd();
    if (cr->isChord() && (toChord(cr)->noteType() != engraving::NoteType::NORMAL)) {
        score->undoChangeChordRestLen(cr, d);
    } else {
        score->changeCRlen(cr, d);
    }
    score->inputState().setDuration(d);
    score->endCmd();
    return true;
}

bool _toggleLayoutBreak(uintptr_t score_ptr, engraving::LayoutBreakType type, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    if (score->selection().isNone()) {
        LOGW() << "toggleLayoutBreak: no selection";
        return false;
    }

    score->startCmd();
    score->cmdToggleLayoutBreak(type);
    score->endCmd();
    return true;
}

bool _toggleLineBreak(uintptr_t score_ptr, int excerptId)
{
    return _toggleLayoutBreak(score_ptr, engraving::LayoutBreakType::LINE, excerptId);
}

bool _togglePageBreak(uintptr_t score_ptr, int excerptId)
{
    return _toggleLayoutBreak(score_ptr, engraving::LayoutBreakType::PAGE, excerptId);
}

bool _setVoice(uintptr_t score_ptr, int voiceIndex, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    if (voiceIndex < 0 || voiceIndex > 3) {
        LOGW() << "setVoice: invalid voice index " << voiceIndex;
        return false;
    }
    // Use input state to set current voice
    score->inputState().setVoice(voiceIndex);
    return true;
}

bool _addDynamic(uintptr_t score_ptr, int dynamicType, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    auto cr = score->selection().cr();
    if (!cr) {
        LOGW() << "addDynamic: no chord/rest selected";
        return false;
    }
    if (dynamicType < 0 || dynamicType >= static_cast<int>(engraving::DynamicType::LAST)) {
        LOGW() << "addDynamic: invalid dynamic type " << dynamicType;
        return false;
    }
    auto dtype = static_cast<engraving::DynamicType>(dynamicType);
    score->startCmd();
    auto dyn = new engraving::Dynamic(score->dummy()->segment());
    dyn->setDynamicType(dtype);
    dyn->setXmlText(engraving::Dynamic::dynamicText(dtype));
    engraving::EditData ed;
    ed.dropElement = dyn;
    cr->drop(ed);
    score->endCmd();
    return true;
}

bool _addRehearsalMark(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);
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
    rm->setXmlText(score->createRehearsalMarkText(rm));
    rm->setTrack(cr->track());

    score->startCmd();
    score->undo(new engraving::AddElement(rm));
    score->cmdResequenceRehearsalMarks();
    score->endCmd();
    return true;
}

bool _addTempoText(uintptr_t score_ptr, double bpm, int excerptId)
{
    MainScore score(score_ptr, excerptId);

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

    score->startCmd();
    if (existing && existing->isTempoText()) {
        auto tempoText = toTempoText(existing);
        tempoText->undoSetTempo(beatsPerSecond);
        tempoText->undoSetFollowText(true);
        // TempoText overrides `undoChangeProperty(...)` as protected, so call via the public base helper.
        auto obj = static_cast<engraving::EngravingObject*>(tempoText);
        obj->undoChangeProperty(engraving::Pid::TEXT, tempoTextXml);
        obj->undoChangeProperty(engraving::Pid::VISIBLE, true);
    } else {
        auto tempoText = engraving::Factory::createTempoText(seg);
        if (!tempoText) {
            score->endCmd();
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
    return true;
}

bool _addArticulation(uintptr_t score_ptr, const char* articulationSymbolName, int excerptId)
{
    MainScore score(score_ptr, excerptId);
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

    score->startCmd();
    for (engraving::Chord* chord : chords) {
        chord->updateArticulations({ articulationSymbolId }, updateMode);
    }
    score->endCmd();
    return true;
}

bool _addSlur(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    const auto& sel = score->selection();
    auto selected = sel.uniqueElements();

    if (selected.empty()) {
        LOGW() << "addSlur: no elements selected";
        return false;
    }

    bool added = false;
    score->startCmd();

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
    return added;
}

bool _addTie(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    const auto noteList = engraving::Score::cmdTieNoteList(score->selection(), score->noteEntryMode());
    if (noteList.empty()) {
        LOGW() << "addTie: no notes selected";
        return false;
    }

    // Score::cmdAddTie manages startCmd/endCmd internally.
    score->cmdAddTie(false);
    return true;
}

bool _addGraceNote(uintptr_t score_ptr, int graceType, int excerptId)
{
    MainScore score(score_ptr, excerptId);
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

    score->startCmd();
    score->cmdAddGrace(type, engraving::Constants::division / denominator);
    score->endCmd();
    return true;
}

bool _addTuplet(uintptr_t score_ptr, int tupletCount, int excerptId)
{
    MainScore score(score_ptr, excerptId);
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
    score->startCmd();
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
    return added;
}

bool _setTimeSignature(uintptr_t score_ptr, int numerator, int denominator, int excerptId)
{
    MainScore score(score_ptr, excerptId);
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

    score->startCmd();
    score->cmdAddTimeSig(targetMeasure, 0, ts, /*local*/ false);
    score->endCmd();
    return true;
}

bool _setKeySignature(uintptr_t score_ptr, int fifths, int excerptId)
{
    MainScore score(score_ptr, excerptId);

    if (fifths < static_cast<int>(engraving::Key::MIN) || fifths > static_cast<int>(engraving::Key::MAX)) {
        LOGW() << "setKeySignature: invalid fifths " << fifths;
        return false;
    }

    engraving::KeySigEvent k;
    k.setKey(static_cast<engraving::Key>(fifths));
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

    score->startCmd();
    for (engraving::Staff* staff : score->staves()) {
        if (!staff) {
            continue;
        }
        score->undoChangeKeySig(staff, tick, k);
    }
    score->endCmd();
    return true;
}

int _getKeySignature(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);

    engraving::Staff* staff = score->staff(0);
    if (!staff) {
        LOGW() << "getKeySignature: no staff in score";
        return 0;
    }

    const engraving::KeySigEvent k = staff->keySigEvent(engraving::Fraction(0, 1));
    return static_cast<int>(k.key());
}

bool _setClef(uintptr_t score_ptr, int clefType, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    // ClefType enum values start at 0, use simple range check
    if (clefType < 0 || clefType > static_cast<int>(engraving::ClefType::MAX)) {
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

    score->startCmd();
    score->undoChangeClef(targetStaff, targetItem, static_cast<engraving::ClefType>(clefType));
    score->endCmd();
    return true;
}

/**
 * export functions (can only be C functions)
 */
extern "C" {

    EMSCRIPTEN_KEEPALIVE
    int version() {
        return _version();
    };

    EMSCRIPTEN_KEEPALIVE
    void setLogLevel(const haw::logger::Level level) {
        haw::logger::Logger::instance()->setLevel(level);
    };

    EMSCRIPTEN_KEEPALIVE
    void init(int argc, char** argv) {
        return _init(argc, argv);
    };

    EMSCRIPTEN_KEEPALIVE
    bool addFont(const char* fontPath) {
        return _addFont(fontPath);
    };

    EMSCRIPTEN_KEEPALIVE
    WasmResBytes load(const char* format, const char* data, const uint32_t size, bool doLayout = true) {
        return _load(format, data, size, doLayout);
    };

    EMSCRIPTEN_KEEPALIVE
    void generateExcerpts(uintptr_t score_ptr) {
        return _generateExcerpts(score_ptr);
    };

    EMSCRIPTEN_KEEPALIVE
    WasmResBytes title(uintptr_t score_ptr) {
        return _title(score_ptr);
    };

    EMSCRIPTEN_KEEPALIVE
    WasmResBytes subtitle(uintptr_t score_ptr) {
        return _subtitle(score_ptr);
    };

    EMSCRIPTEN_KEEPALIVE
    bool setTitleText(uintptr_t score_ptr, const char* plainText, int excerptId = -1) {
        return _setTitleText(score_ptr, plainText, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool setSubtitleText(uintptr_t score_ptr, const char* plainText, int excerptId = -1) {
        return _setSubtitleText(score_ptr, plainText, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool setComposerText(uintptr_t score_ptr, const char* plainText, int excerptId = -1) {
        return _setComposerText(score_ptr, plainText, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool setLyricistText(uintptr_t score_ptr, const char* plainText, int excerptId = -1) {
        return _setHeaderText(score_ptr, engraving::TextStyleType::POET, plainText, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool appendPart(uintptr_t score_ptr, const char* instrumentId, int excerptId = -1) {
        return _appendPart(score_ptr, instrumentId, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool appendPartByMusicXmlId(uintptr_t score_ptr, const char* instrumentMusicXmlId, int excerptId = -1) {
        return _appendPartByMusicXmlId(score_ptr, instrumentMusicXmlId, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool removePart(uintptr_t score_ptr, int partIndex, int excerptId = -1) {
        return _removePart(score_ptr, partIndex, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool setPartVisible(uintptr_t score_ptr, int partIndex, bool visible, int excerptId = -1) {
        return _setPartVisible(score_ptr, partIndex, visible, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    WasmResBytes listInstrumentTemplates(uintptr_t score_ptr) {
        (void)score_ptr;
        return _listInstrumentTemplates();
    };

    EMSCRIPTEN_KEEPALIVE
    bool addNoteFromRest(uintptr_t score_ptr, int excerptId = -1) {
        return _addNoteFromRest(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool toggleRepeatStart(uintptr_t score_ptr, int excerptId = -1) {
        return _toggleRepeatStart(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool toggleRepeatEnd(uintptr_t score_ptr, int excerptId = -1) {
        return _toggleRepeatEnd(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool setRepeatCount(uintptr_t score_ptr, int count, int excerptId = -1) {
        return _setRepeatCount(score_ptr, count, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool setBarLineType(uintptr_t score_ptr, int barLineType, int excerptId = -1) {
        return _setBarLineType(score_ptr, barLineType, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool addVolta(uintptr_t score_ptr, int endingNumber, int excerptId = -1) {
        return _addVolta(score_ptr, endingNumber, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    WasmResBytes npages(uintptr_t score_ptr, int excerptId) {
        return _npages(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    WasmResBytes saveXml(uintptr_t score_ptr, int excerptId = -1) {
        return _saveXml(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    WasmResBytes saveMxl(uintptr_t score_ptr, int excerptId = -1) {
        return _saveMxl(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    WasmResBytes saveMsc(uintptr_t score_ptr, bool compressed, int excerptId = -1) {
        return _saveMsc(score_ptr, compressed, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    WasmResBytes saveSvg(uintptr_t score_ptr, int pageNumber, bool drawPageBackground, int excerptId = -1) {
        return _saveSvg(score_ptr, pageNumber, drawPageBackground, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    WasmResBytes savePng(uintptr_t score_ptr, int pageNumber, bool drawPageBackground, bool transparent, int excerptId = -1) {
        return _savePng(score_ptr, pageNumber, drawPageBackground, transparent, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    WasmResBytes savePdf(uintptr_t score_ptr, int excerptId = -1) {
        return _savePdf(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    WasmResBytes saveMidi(uintptr_t score_ptr, bool midiExpandRepeats, bool exportRPNs, int excerptId = -1) {
        return _saveMidi(score_ptr, midiExpandRepeats, exportRPNs, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    WasmResBytes saveAudio(uintptr_t score_ptr, const char* format, int excerptId = -1) {
        return _saveAudio(score_ptr, format, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool selectElementAtPoint(uintptr_t score_ptr, int pageNumber, double x, double y, int excerptId = -1) {
        return _selectElementAtPoint(score_ptr, pageNumber, x, y, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool clearSelection(uintptr_t score_ptr, int excerptId = -1) {
        return _clearSelection(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    WasmResBytes selectionMimeType(uintptr_t score_ptr, int excerptId = -1) {
        return _selectionMimeType(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    WasmResBytes selectionMimeData(uintptr_t score_ptr, int excerptId = -1) {
        return _selectionMimeData(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool pasteSelection(uintptr_t score_ptr, const char* mimeType, const char* data, uint32_t size, int excerptId = -1) {
        return _pasteSelection(score_ptr, mimeType, data, size, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool selectElementAtPointWithMode(uintptr_t score_ptr, int pageNumber, double x, double y, int mode, int excerptId = -1) {
        return _selectElementAtPointWithMode(score_ptr, pageNumber, x, y, mode, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool deleteSelection(uintptr_t score_ptr, int excerptId = -1) {
        return _deleteSelection(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool pitchUp(uintptr_t score_ptr, int excerptId = -1) {
        return _pitchUp(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool pitchDown(uintptr_t score_ptr, int excerptId = -1) {
        return _pitchDown(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool transpose(uintptr_t score_ptr, int semitones, int excerptId = -1) {
        return _transpose(score_ptr, semitones, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool setAccidental(uintptr_t score_ptr, int accidentalType, int excerptId = -1) {
        return _setAccidental(score_ptr, accidentalType, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool doubleDuration(uintptr_t score_ptr, int excerptId = -1) {
        return _doubleDuration(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool halfDuration(uintptr_t score_ptr, int excerptId = -1) {
        return _halfDuration(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool undo(uintptr_t score_ptr, int excerptId = -1) {
        return _undo(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool redo(uintptr_t score_ptr, int excerptId = -1) {
        return _redo(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool relayout(uintptr_t score_ptr, int excerptId = -1) {
        return _relayout(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool toggleDot(uintptr_t score_ptr, int excerptId = -1) {
        return _toggleDot(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool toggleDoubleDot(uintptr_t score_ptr, int excerptId = -1) {
        return _toggleDoubleDot(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool toggleLineBreak(uintptr_t score_ptr, int excerptId = -1) {
        return _toggleLineBreak(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool togglePageBreak(uintptr_t score_ptr, int excerptId = -1) {
        return _togglePageBreak(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool setVoice(uintptr_t score_ptr, int voiceIndex, int excerptId = -1) {
        return _setVoice(score_ptr, voiceIndex, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool addDynamic(uintptr_t score_ptr, int dynamicType, int excerptId = -1) {
        return _addDynamic(score_ptr, dynamicType, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool addRehearsalMark(uintptr_t score_ptr, int excerptId = -1) {
        return _addRehearsalMark(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool addTempoText(uintptr_t score_ptr, double bpm, int excerptId = -1) {
        return _addTempoText(score_ptr, bpm, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool addArticulation(uintptr_t score_ptr, const char* articulationSymbolName, int excerptId = -1) {
        return _addArticulation(score_ptr, articulationSymbolName, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool addSlur(uintptr_t score_ptr, int excerptId = -1) {
        return _addSlur(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool addTie(uintptr_t score_ptr, int excerptId = -1) {
        return _addTie(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool addGraceNote(uintptr_t score_ptr, int graceType, int excerptId = -1) {
        return _addGraceNote(score_ptr, graceType, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool addTuplet(uintptr_t score_ptr, int tupletCount, int excerptId = -1) {
        return _addTuplet(score_ptr, tupletCount, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool addStaffText(uintptr_t score_ptr, const char* plainText, int excerptId = -1) {
        return _addTextForStyle(score_ptr, engraving::TextStyleType::STAFF, plainText, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool addSystemText(uintptr_t score_ptr, const char* plainText, int excerptId = -1) {
        return _addTextForStyle(score_ptr, engraving::TextStyleType::SYSTEM, plainText, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool addExpressionText(uintptr_t score_ptr, const char* plainText, int excerptId = -1) {
        return _addTextForStyle(score_ptr, engraving::TextStyleType::EXPRESSION, plainText, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool addLyricText(uintptr_t score_ptr, const char* plainText, int excerptId = -1) {
        return _addTextForStyle(score_ptr, engraving::TextStyleType::LYRICS_ODD, plainText, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool addHarmonyText(uintptr_t score_ptr, int variant, const char* plainText, int excerptId = -1) {
        return _addTextForStyle(score_ptr, _harmonyStyle(variant), plainText, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool addFingeringText(uintptr_t score_ptr, const char* plainText, int excerptId = -1) {
        return _addTextForStyle(score_ptr, engraving::TextStyleType::FINGERING, plainText, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool addLeftHandGuitarFingeringText(uintptr_t score_ptr, const char* plainText, int excerptId = -1) {
        return _addTextForStyle(score_ptr, engraving::TextStyleType::LH_GUITAR_FINGERING, plainText, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool addRightHandGuitarFingeringText(uintptr_t score_ptr, const char* plainText, int excerptId = -1) {
        return _addTextForStyle(score_ptr, engraving::TextStyleType::RH_GUITAR_FINGERING, plainText, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool addStringNumberText(uintptr_t score_ptr, const char* plainText, int excerptId = -1) {
        return _addTextForStyle(score_ptr, engraving::TextStyleType::STRING_NUMBER, plainText, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool addInstrumentChangeText(uintptr_t score_ptr, const char* plainText, int excerptId = -1) {
        return _addTextForStyle(score_ptr, engraving::TextStyleType::INSTRUMENT_CHANGE, plainText, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool addStickingText(uintptr_t score_ptr, const char* plainText, int excerptId = -1) {
        return _addTextForStyle(score_ptr, engraving::TextStyleType::STICKING, plainText, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool addFiguredBassText(uintptr_t score_ptr, const char* plainText, int excerptId = -1) {
        return _addFiguredBass(score_ptr, plainText, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool setTimeSignature(uintptr_t score_ptr, int numerator, int denominator, int excerptId = -1) {
        return _setTimeSignature(score_ptr, numerator, denominator, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool setKeySignature(uintptr_t score_ptr, int fifths, int excerptId = -1) {
        return _setKeySignature(score_ptr, fifths, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    int getKeySignature(uintptr_t score_ptr, int excerptId = -1) {
        return _getKeySignature(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool setClef(uintptr_t score_ptr, int clefType, int excerptId = -1) {
        return _setClef(score_ptr, clefType, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    uintptr_t synthAudio(uintptr_t score_ptr, float starttime, int excerptId = -1) {
        MainScore score(score_ptr, excerptId);
        return MainAudio::Synth::start(score, starttime);
    };

    EMSCRIPTEN_KEEPALIVE
    const char* processSynth(uintptr_t fn_ptr, bool cancel = false) {
        return MainAudio::Synth(fn_ptr).process(cancel);
    }

    EMSCRIPTEN_KEEPALIVE
    const char* processSynthBatch(uintptr_t fn_ptr, int batchSize, bool cancel = false) {
        return MainAudio::Synth(fn_ptr).processBatch(batchSize, cancel);
    }

    EMSCRIPTEN_KEEPALIVE
    WasmResBytes savePositions(uintptr_t score_ptr, bool ofSegments, int excerptId = -1) {
        return _savePositions(score_ptr, ofSegments, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    WasmResBytes saveMetadata(uintptr_t score_ptr) {
        return _saveMetadata(score_ptr);
    };

    EMSCRIPTEN_KEEPALIVE
    void destroy(uintptr_t score_ptr) {
        // remove the only alive reference to the smart pointer
        engraving::EngravingProjectPtr a = ((engraving::MasterScore*)score_ptr)->project().lock();
        instances.erase(a);
        // destroying the `EngravingProject` also destroys its `MasterScore` in its destructor
    };

}
