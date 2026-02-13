#include <emscripten/emscripten.h>
#include <algorithm>
#include <chrono>
#include <optional>
#include <set>
#include <string>
#include <unordered_map>
#include <vector>

#include <QGuiApplication>
#include <QFontDatabase>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QTemporaryFile>
#include "global/log.h"
#include "global/defer.h"
#include "global/async/processevents.h"
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
#include "playback/iplaybackcontroller.h"
#include "engraving/libmscore/chord.h"
#include "engraving/libmscore/editdata.h"
#include "engraving/libmscore/instrtemplate.h"
#include "engraving/libmscore/part.h"
#include "engraving/libmscore/property.h"
#include "importexport/midi/internal/midiexport/exportmidi.h"
#include "./importexport/positionjsonwriter.h"
#include "engraving/libmscore/page.h"
#include "engraving/libmscore/measurebase.h"
#include "engraving/libmscore/measure.h"
#include "engraving/libmscore/repeatlist.h"
#include "engraving/libmscore/undo.h"
#include "engraving/libmscore/factory.h"
#include "engraving/libmscore/tempotext.h"
#include "engraving/libmscore/dynamic.h"
#include "engraving/libmscore/hairpin.h"
#include "engraving/libmscore/pedal.h"
#include "engraving/libmscore/rehearsalmark.h"
#include "engraving/libmscore/articulation.h"
#include "engraving/libmscore/barline.h"
#include "engraving/libmscore/figuredbass.h"
#include "engraving/libmscore/text.h"
#include "engraving/libmscore/textbase.h"
#include "engraving/libmscore/engravingobject.h"
#include "engraving/libmscore/segment.h"
#include "engraving/libmscore/staff.h"
#include "engraving/libmscore/stafflines.h"
#include "engraving/libmscore/spannermap.h"
#include "engraving/layout/layoutoptions.h"
#include "engraving/libmscore/utils.h"
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

std::unordered_map<uintptr_t, QJsonObject> s_loadProfilesByScore;

static double steadyNowMs()
{
    using Clock = std::chrono::steady_clock;
    return std::chrono::duration<double, std::milli>(Clock::now().time_since_epoch()).count();
}

constexpr int kDeferredLoadBootstrapMeasures = 8;

static bool bootstrapRangeEndTick(engraving::MasterScore* score, engraving::Fraction& endTick)
{
    IF_ASSERT_FAILED(score) {
        return false;
    }

    engraving::Measure* measure = score->firstMeasure();
    if (!measure) {
        return false;
    }

    for (int i = 1; i < kDeferredLoadBootstrapMeasures && measure->nextMeasure(); ++i) {
        measure = measure->nextMeasure();
    }

    endTick = measure->tick() + measure->ticks();
    return true;
}

static void bootstrapDeferredLayout(engraving::MasterScore* score)
{
    IF_ASSERT_FAILED(score) {
        return;
    }

    score->cmdState().reset();

    engraving::Fraction endTick;
    if (bootstrapRangeEndTick(score, endTick)) {
        // Keep deferred mode incremental: layout only a tiny prefix for first paint.
        score->doLayoutRange(engraving::Fraction(0, 1), endTick);
    } else {
        score->setLayoutAll();
        score->update();
    }
}
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
    printf("[WASM BUILD] audition-sequence-fix-v3\n");
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
Ret _doLoad(engraving::EngravingProjectPtr proj, QString filePath, bool doLayout, QJsonObject* loadProfile = nullptr) {
    engraving::MasterScore* score = proj->masterScore();
    IF_ASSERT_FAILED(score) {
        return make_ret(engraving::Err::UnknownError);
    }

    const bool deferLayout = !doLayout;
    if (deferLayout) {
        // Suppress importer-time updates for deferred loading; we will bootstrap layout explicitly later.
        score->lockUpdates(true);
    }

    // read score using the `compat` method
    const double parseStartMs = steadyNowMs();
    engraving::Err err = engraving::compat::loadMsczOrMscx(proj->masterScore(), filePath, true);
    if (loadProfile) {
        (*loadProfile)[QStringLiteral("parseMs")] = steadyNowMs() - parseStartMs;
    }
    if (err != engraving::Err::NoError) {
        if (deferLayout) {
            score->lockUpdates(false);
        }
        return make_ret(err);
    }

    if (!deferLayout) {
        // Eager path still suppresses setup-time layout to avoid duplicate full passes.
        score->lockUpdates(true);
    }

    const double setupStartMs = steadyNowMs();
    err = proj->setupMasterScore(true);
    score->lockUpdates(false);
    if (loadProfile) {
        (*loadProfile)[QStringLiteral("setupMs")] = steadyNowMs() - setupStartMs;
    }
    if (err != engraving::Err::NoError) {
        return make_ret(err);
    }

    const double layoutStartMs = steadyNowMs();
    if (doLayout) {
        score->setLayoutAll();
        score->update();
        score->switchToPageMode();  // the default _layoutMode is LayoutMode::PAGE, but the score file may be saved in continuous mode
    } else {
        bootstrapDeferredLayout(score);
        score->switchToPageMode();
    }
    if (loadProfile) {
        (*loadProfile)[QStringLiteral("initialLayoutMs")] = steadyNowMs() - layoutStartMs;
    }

    return make_ok();
}

/**
 * Load other file formats
 * https://github.com/LibreScore/webmscore/blob/v4.0/src/project/internal/notationproject.cpp#L246-L291
 */
Ret _doImport(engraving::EngravingProjectPtr proj, QString filePath, bool doLayout, QJsonObject* loadProfile = nullptr) {
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
    const bool deferLayout = !doLayout;
    if (deferLayout) {
        // Keep import parser from triggering expensive update/layout work.
        score->lockUpdates(true);
    }

    const double parseStartMs = steadyNowMs();
    Ret ret = scoreReader->read(score, filePath, options);
    if (loadProfile) {
        (*loadProfile)[QStringLiteral("parseMs")] = steadyNowMs() - parseStartMs;
    }
    if (!ret.success()) {
        if (deferLayout) {
            score->lockUpdates(false);
        }
        return ret;
    }

    // post-processing for non-native formats
    score->setMetaTag(u"originalFormat", QString::fromStdString(suffix));
    score->connectTies(); // HACK: ???

    // Setup master score
    const double setupStartMs = steadyNowMs();
    engraving::Err err = proj->setupMasterScore(true);
    if (deferLayout) {
        score->lockUpdates(false);
    }
    if (loadProfile) {
        (*loadProfile)[QStringLiteral("setupMs")] = steadyNowMs() - setupStartMs;
    }
    if (err != engraving::Err::NoError) {
        return make_ret(err);
    }

    const double layoutStartMs = steadyNowMs();
    if (deferLayout) {
        bootstrapDeferredLayout(score);
    }
    if (loadProfile) {
        (*loadProfile)[QStringLiteral("initialLayoutMs")] = steadyNowMs() - layoutStartMs;
    }

    return make_ok();
}

/**
 * load score
 */
WasmRes _load(const char* format, const char* data, const uint32_t size, bool doLayout) {
    String _format = String::fromUtf8(format);  // file format of the data
    QJsonObject loadProfile;
    loadProfile[QStringLiteral("format")] = QString::fromUtf8(format);
    loadProfile[QStringLiteral("dataBytes")] = static_cast<double>(size);
    loadProfile[QStringLiteral("doLayoutRequested")] = doLayout;
    loadProfile[QStringLiteral("deferredRequested")] = !doLayout;
    const bool museScoreFormat = engraving::isMuseScoreFile(format);
    loadProfile[QStringLiteral("readerKind")] = museScoreFormat ? QStringLiteral("native") : QStringLiteral("import");
    const double totalStartMs = steadyNowMs();

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
    Ret ret = museScoreFormat
        ? _doLoad(proj, filePath, doLayout, &loadProfile)
        : _doImport(proj, filePath, doLayout, &loadProfile);

    // handle exceptions
    if (!ret.success()) {
        return WasmRes::fromRet(ret);
    }

    engraving::MasterScore* score = proj->masterScore();
    notationProj->m_masterNotation->setMasterScore(score);

    auto score_ptr = reinterpret_cast<uintptr_t>(score);
    loadProfile[QStringLiteral("totalLoadMs")] = steadyNowMs() - totalStartMs;
    loadProfile[QStringLiteral("pagesAfterLoad")] = static_cast<int>(score->npages());
    loadProfile[QStringLiteral("deferredActive")] = !doLayout;
    s_loadProfilesByScore[score_ptr] = loadProfile;
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

static String _plainTextToString(const char* plainText)
{
    return plainText ? String::fromUtf8(plainText) : String();
}

static bool _setSelectedText(uintptr_t score_ptr, const char* plainText, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    engraving::EngravingItem* target = score->selection().element();
    if (!target || !target->isTextBase()) {
        const auto& selected = score->selection().elements();
        for (auto* candidate : selected) {
            if (candidate && candidate->isTextBase()) {
                target = candidate;
                break;
            }
        }
    }
    if (!target || !target->isTextBase()) {
        LOGW() << "setSelectedText: selection is not a text element";
        return false;
    }

    engraving::TextBase* textItem = toTextBase(target);
    if (!textItem) {
        LOGW() << "setSelectedText: unable to resolve TextBase";
        return false;
    }

    score->startCmd();
    const String xmlText = engraving::TextBase::plainToXmlText(_plainTextToString(plainText));
    textItem->undoChangeProperty(engraving::Pid::TEXT, xmlText);
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

static engraving::Measure* measureAtIndex(MainScore& score, int measureIndex)
{
    if (measureIndex < 0) {
        return nullptr;
    }

    int index = 0;
    for (auto* measure = score->firstMeasureMM(); measure; measure = measure->nextMeasureMM()) {
        if (index == measureIndex) {
            return measure;
        }
        ++index;
    }

    return nullptr;
}

static int measureCount(MainScore& score)
{
    int count = 0;
    for (auto* measure = score->firstMeasureMM(); measure; measure = measure->nextMeasureMM()) {
        ++count;
    }
    return count;
}

static engraving::Measure* layoutMeasureAtIndex(MainScore& score, int measureIndex)
{
    if (measureIndex < 0) {
        return nullptr;
    }

    int index = 0;
    for (auto* measure = score->firstMeasure(); measure; measure = measure->nextMeasure()) {
        if (index == measureIndex) {
            return measure;
        }
        ++index;
    }

    return nullptr;
}

static int layoutMeasureCount(MainScore& score)
{
    int count = 0;
    for (auto* measure = score->firstMeasure(); measure; measure = measure->nextMeasure()) {
        ++count;
    }
    return count;
}

static bool partStaffRange(const engraving::Part* part, engraving::staff_idx_t& staffStart, engraving::staff_idx_t& staffEnd)
{
    staffStart = mu::nidx;
    staffEnd = mu::nidx;

    if (!part) {
        return false;
    }

    const auto& staves = part->staves();
    if (staves.empty()) {
        return false;
    }

    staffStart = staves.front()->idx();
    staffEnd = staffStart + 1;

    for (const auto* staff : staves) {
        if (!staff) {
            continue;
        }
        const auto idx = staff->idx();
        if (idx < staffStart) {
            staffStart = idx;
        }
        if (idx + 1 > staffEnd) {
            staffEnd = idx + 1;
        }
    }

    return staffStart != mu::nidx && staffEnd != mu::nidx;
}

static std::string fractionToString(const engraving::Fraction& fraction)
{
    if (!fraction.isValid() || fraction.denominator() == 0) {
        return "?";
    }

    return std::to_string(fraction.numerator()) + "/" + std::to_string(fraction.denominator());
}

struct LayoutProgressInfo {
    int totalMeasures = 0;
    int laidOutMeasures = 0;
    int availablePages = 0;
    long long loadedUntilTick = -1;
    bool hasMorePages = false;
    bool isComplete = false;
};

static LayoutProgressInfo captureLayoutProgress(MainScore& score)
{
    LayoutProgressInfo info;
    info.totalMeasures = layoutMeasureCount(score);
    info.availablePages = static_cast<int>(score->npages());

    for (auto* measure = score->firstMeasure(); measure; measure = measure->nextMeasure()) {
        if (!measure->system()) {
            continue;
        }

        ++info.laidOutMeasures;
        const long long endTick = static_cast<long long>((measure->tick() + measure->ticks()).ticks());
        if (endTick > info.loadedUntilTick) {
            info.loadedUntilTick = endTick;
        }
    }

    info.hasMorePages = info.totalMeasures > info.laidOutMeasures;
    info.isComplete = !info.hasMorePages;
    return info;
}

static QJsonObject layoutProgressJson(MainScore& score, int targetPage, bool targetSatisfied)
{
    LayoutProgressInfo info = captureLayoutProgress(score);
    QJsonObject json;
    json.insert(QStringLiteral("targetPage"), targetPage);
    json.insert(QStringLiteral("targetSatisfied"), targetSatisfied);
    json.insert(QStringLiteral("availablePages"), info.availablePages);
    json.insert(QStringLiteral("totalMeasures"), info.totalMeasures);
    json.insert(QStringLiteral("laidOutMeasures"), info.laidOutMeasures);
    json.insert(QStringLiteral("loadedUntilTick"), static_cast<double>(info.loadedUntilTick));
    json.insert(QStringLiteral("hasMorePages"), info.hasMorePages);
    json.insert(QStringLiteral("isComplete"), info.isComplete);
    return json;
}

static bool durationBaseFraction(engraving::DurationType type, int& numerator, int& denominator)
{
    numerator = 0;
    denominator = 0;

    switch (type) {
    case engraving::DurationType::V_1024TH: numerator = 1; denominator = 1024; break;
    case engraving::DurationType::V_512TH: numerator = 1; denominator = 512; break;
    case engraving::DurationType::V_256TH: numerator = 1; denominator = 256; break;
    case engraving::DurationType::V_128TH: numerator = 1; denominator = 128; break;
    case engraving::DurationType::V_64TH: numerator = 1; denominator = 64; break;
    case engraving::DurationType::V_32ND: numerator = 1; denominator = 32; break;
    case engraving::DurationType::V_16TH: numerator = 1; denominator = 16; break;
    case engraving::DurationType::V_EIGHTH: numerator = 1; denominator = 8; break;
    case engraving::DurationType::V_QUARTER: numerator = 1; denominator = 4; break;
    case engraving::DurationType::V_HALF: numerator = 1; denominator = 2; break;
    case engraving::DurationType::V_WHOLE: numerator = 1; denominator = 1; break;
    case engraving::DurationType::V_BREVE: numerator = 2; denominator = 1; break;
    case engraving::DurationType::V_LONG: numerator = 4; denominator = 1; break;
    default:
        return false;
    }

    return true;
}

static std::string durationToken(const engraving::ChordRest* chordRest)
{
    if (!chordRest) {
        return "?";
    }

    if (chordRest->isRest()) {
        auto* rest = static_cast<const engraving::Rest*>(chordRest);
        if (rest->isFullMeasureRest()) {
            return "M";
        }
    }

    engraving::TDuration duration = chordRest->actualDurationType();
    if (!duration.isValid()) {
        duration = chordRest->durationType();
    }

    int numerator = 0;
    int denominator = 0;
    if (!durationBaseFraction(duration.type(), numerator, denominator)) {
        return "?";
    }

    std::string base = (numerator == 1)
        ? std::to_string(denominator)
        : std::to_string(numerator) + "/" + std::to_string(denominator);

    if (duration.dots() > 0) {
        base.append(static_cast<size_t>(duration.dots()), '.');
    }

    return base;
}

static std::string chordToken(const engraving::Chord* chord)
{
    if (!chord) {
        return "N?:?";
    }

    struct PitchInfo {
        int pitch = 0;
        int pc = 0;
        int octave = 0;
    };

    std::vector<PitchInfo> pitches;
    pitches.reserve(chord->notes().size());
    for (const auto* note : chord->notes()) {
        if (!note) {
            continue;
        }
        const int pitch = note->epitch();
        int pc = pitch % 12;
        if (pc < 0) {
            pc += 12;
        }
        pitches.push_back({ pitch, pc, note->octave() });
    }

    std::sort(pitches.begin(), pitches.end(), [](const PitchInfo& a, const PitchInfo& b) {
        return a.pitch < b.pitch;
    });

    std::string noteList;
    for (const auto& info : pitches) {
        if (!noteList.empty()) {
            noteList += "+";
        }
        noteList += std::to_string(info.pc) + "o" + std::to_string(info.octave);
    }

    return "N" + noteList + ":" + durationToken(chord);
}

static std::string voiceSignature(const engraving::Measure* measure, engraving::staff_idx_t staffIdx, int voice)
{
    if (!measure) {
        return "";
    }

    std::string signature;
    for (auto* segment = measure->first(engraving::SegmentType::ChordRest); segment; segment = segment->next()) {
        if (!(segment->segmentType() & engraving::SegmentType::ChordRest)) {
            continue;
        }

        auto* element = segment->element(staffIdx * mu::engraving::VOICES + voice);
        if (!element) {
            continue;
        }

        std::string token;
        if (element->isChord()) {
            token = chordToken(static_cast<engraving::Chord*>(element));
        } else if (element->isRest()) {
            token = "R:" + durationToken(static_cast<engraving::Rest*>(element));
        } else {
            continue;
        }

        if (!signature.empty()) {
            signature += " ";
        }
        signature += token;
    }

    return signature;
}

static std::string measureSignature(engraving::Part* part, engraving::Measure* measure)
{
    if (!part || !measure) {
        return "";
    }

    std::string signature = fractionToString(measure->timesig());

    signature += "|";
    std::string keyToken = "?";
    if (!part->staves().empty()) {
        if (auto* staff = part->staves().front()) {
            const auto keyEvent = staff->keySigEvent(measure->tick());
            if (keyEvent.isValid()) {
                keyToken = std::to_string(static_cast<int>(keyEvent.key()));
            }
        }
    }
    signature += keyToken;

    signature += "|";
    signature += std::to_string(static_cast<int>(measure->endBarLineType()));

    signature += "|";
    bool firstStaff = true;
    for (const auto* staff : part->staves()) {
        if (!staff) {
            continue;
        }
        if (!firstStaff) {
            signature += ";";
        }
        firstStaff = false;

        const auto staffIdx = staff->idx();
        std::string staffSig = "S" + std::to_string(staffIdx) + ":";
        for (int voice = 0; voice < mu::engraving::VOICES; ++voice) {
            if (voice > 0) {
                staffSig += ",";
            }
            staffSig += "V" + std::to_string(voice) + "=";
            staffSig += voiceSignature(measure, staffIdx, voice);
        }
        signature += staffSig;
    }

    return signature;
}

static bool selectMeasureRange(MainScore& score, engraving::Measure* measure, engraving::staff_idx_t staffIdx)
{
    if (!measure || staffIdx == mu::nidx) {
        return false;
    }

    engraving::Measure* m = measure;
    const engraving::Fraction tick = m->tick();
    const engraving::Fraction etick = tick + m->ticks();
    engraving::Segment* startSegment = m->tick2segment(tick);
    if (!startSegment) {
        startSegment = m->first(engraving::SegmentType::ChordRest);
    }
    if (!startSegment) {
        return false;
    }
    engraving::Segment* endSegment = (m == score->lastMeasure()) ? nullptr : m->last();

    auto& selection = score->selection();
    if (selection.isNone() || (selection.isList() && !selection.isSingle())) {
        if (selection.isList()) {
            score->deselectAll();
        }
        selection.setRange(startSegment, endSegment, staffIdx, staffIdx + 1);
    } else if (selection.isRange()) {
        selection.extendRangeSelection(startSegment, endSegment, staffIdx, tick, etick);
    } else if (selection.isSingle()) {
        engraving::EngravingItem* oe = selection.element();
        if (oe && (oe->isNote() || oe->isChordRest())) {
            if (oe->isNote()) {
                oe = oe->parentItem();
            }
            engraving::ChordRest* cr = engraving::toChordRest(oe);
            const engraving::Fraction oetick = cr->segment()->tick();
            engraving::Segment* rangeStart = cr->segment();
            engraving::Segment* rangeEnd = m->last();
            if (tick < oetick) {
                rangeStart = m->tick2segment(tick);
                if (etick <= oetick) {
                    const auto st = engraving::SegmentType::ChordRest | engraving::SegmentType::EndBarLine | engraving::SegmentType::Clef;
                    rangeEnd = cr->nextSegmentAfterCR(st);
                }
            }
            engraving::staff_idx_t staffStart = staffIdx;
            engraving::staff_idx_t endStaff = staffIdx + 1;
            if (staffStart > cr->staffIdx()) {
                staffStart = cr->staffIdx();
            } else if (cr->staffIdx() >= endStaff) {
                endStaff = cr->staffIdx() + 1;
            }
            selection.setRange(rangeStart, rangeEnd, staffStart, endStaff);
        } else {
            score->deselectAll();
            selection.setRange(startSegment, endSegment, staffIdx, staffIdx + 1);
        }
    } else {
        return false;
    }
    selection.updateSelectedElements();
    selection.setActiveTrack(staffIdx * mu::engraving::VOICES);
    return true;
}

WasmRes _measureSignatureCount(uintptr_t score_ptr, int partIndex, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    if (!partFromIndex(score, partIndex)) {
        return WasmRes(static_cast<uint32_t>(0));
    }

    const uint32_t count = static_cast<uint32_t>(measureCount(score));
    return WasmRes(count);
}

WasmRes _measureSignatureAt(uintptr_t score_ptr, int partIndex, int measureIndex, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    auto* part = partFromIndex(score, partIndex);
    if (!part) {
        return WasmRes(String());
    }

    auto* measure = measureAtIndex(score, measureIndex);
    if (!measure) {
        return WasmRes(String());
    }

    const std::string signature = measureSignature(part, measure);
    return WasmRes(String::fromUtf8(signature.c_str()));
}

WasmRes _measureSignatures(uintptr_t score_ptr, int partIndex, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    auto* part = partFromIndex(score, partIndex);
    if (!part) {
        return WasmRes(String::fromUtf8("[]"));
    }

    QJsonArray signatures;
    for (auto* measure = score->firstMeasureMM(); measure; measure = measure->nextMeasureMM()) {
        const std::string signature = measureSignature(part, measure);
        signatures.append(QString::fromUtf8(signature.c_str()));
    }

    const QJsonDocument doc(signatures);
    return WasmRes(doc.toJson(QJsonDocument::Compact));
}

WasmRes _measureLineBreaks(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    QJsonArray breaks;
    for (auto* measure = score->firstMeasureMM(); measure; measure = measure->nextMeasureMM()) {
        breaks.append(measure->lineBreak());
    }
    const QJsonDocument doc(breaks);
    return WasmRes(doc.toJson(QJsonDocument::Compact));
}

bool _setMeasureLineBreaks(uintptr_t score_ptr, const char* data, uint32_t size, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    if (!data || size == 0) {
        LOGW() << "setMeasureLineBreaks: empty payload";
        return false;
    }

    QJsonParseError parseError;
    const QJsonDocument doc = QJsonDocument::fromJson(QByteArray(data, static_cast<int>(size)), &parseError);
    if (doc.isNull() || !doc.isArray()) {
        LOGW() << "setMeasureLineBreaks: invalid payload at offset " << parseError.offset
               << " error " << parseError.error;
        return false;
    }

    const QJsonArray breaks = doc.array();
    int index = 0;
    for (auto* measure = score->firstMeasureMM(); measure; measure = measure->nextMeasureMM()) {
        const bool enabled = index < breaks.size() ? breaks.at(index).toBool() : false;
        if (measure->lineBreak() != enabled) {
            measure->undoSetLineBreak(enabled);
        }
        ++index;
    }
    score->setLayoutAll();
    score->update();
    return true;
}

bool _selectPartMeasureByIndex(uintptr_t score_ptr, int partIndex, int measureIndex, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    auto* part = partFromIndex(score, partIndex);
    if (!part) {
        LOGW() << "selectPartMeasureByIndex: invalid part index " << partIndex;
        return false;
    }

    auto* measure = measureAtIndex(score, measureIndex);
    if (!measure) {
        LOGW() << "selectPartMeasureByIndex: invalid measure index " << measureIndex;
        return false;
    }

    engraving::staff_idx_t staffStart = mu::nidx;
    engraving::staff_idx_t staffEnd = mu::nidx;
    if (!partStaffRange(part, staffStart, staffEnd)) {
        LOGW() << "selectPartMeasureByIndex: no staves for part " << partIndex;
        return false;
    }

    auto* startSeg = measure->first(engraving::SegmentType::ChordRest);
    auto* endSeg = measure->last();
    if (!startSeg) {
        startSeg = measure->first();
    }

    if (!startSeg || !endSeg) {
        LOGW() << "selectPartMeasureByIndex: empty measure " << measureIndex;
        return false;
    }

    score->deselectAll();
    score->selection().setRange(startSeg, endSeg, staffStart, staffEnd);
    score->selection().setState(engraving::SelState::RANGE);
    score->selection().setActiveTrack(staffStart * mu::engraving::VOICES);
    score->updateSelection();
    score->setSelectionChanged(true);
    return true;
}

enum class InsertMeasuresTarget {
    AfterSelection = 0,
    BeforeSelection = 1,
    AtStartOfScore = 2,
    AtEndOfScore = 3,
};

static InsertMeasuresTarget parseInsertMeasuresTarget(int target)
{
    switch (target) {
    case 0:
        return InsertMeasuresTarget::AfterSelection;
    case 1:
        return InsertMeasuresTarget::BeforeSelection;
    case 2:
        return InsertMeasuresTarget::AtStartOfScore;
    case 3:
        return InsertMeasuresTarget::AtEndOfScore;
    default:
        LOGW() << "insertMeasures: unknown target " << target << ", defaulting to end of score";
        return InsertMeasuresTarget::AtEndOfScore;
    }
}

static bool computeBeforeMeasureIndex(MainScore& score, InsertMeasuresTarget target, int& beforeIndex)
{
    beforeIndex = -1;

    if (target == InsertMeasuresTarget::AfterSelection || target == InsertMeasuresTarget::BeforeSelection) {
        auto& selection = score->selection();
        if (selection.isNone()) {
            LOGW() << "insertMeasures: selection required for target " << static_cast<int>(target);
            return false;
        }

        if (selection.isRange()) {
            engraving::Measure* startMeasure = nullptr;
            engraving::Measure* endMeasure = nullptr;
            if (selection.measureRange(&startMeasure, &endMeasure)) {
                const int startIndex = startMeasure ? startMeasure->index() : 0;
                const int endIndex = endMeasure ? endMeasure->index() : startIndex;
                beforeIndex = (target == InsertMeasuresTarget::BeforeSelection) ? startIndex : (endIndex + 1);
                return true;
            }
        }

        const auto& elements = selection.elements();
        for (engraving::EngravingItem* element : elements) {
            if (!element) {
                continue;
            }
            engraving::MeasureBase* measure = element->findMeasureBase();
            if (!measure) {
                continue;
            }
            const int index = measure->index();
            if (index < 0) {
                continue;
            }

            if (target == InsertMeasuresTarget::BeforeSelection) {
                if (beforeIndex < 0 || index < beforeIndex) {
                    beforeIndex = index;
                }
            } else {
                if (index + 1 > beforeIndex) {
                    beforeIndex = index + 1;
                }
            }
        }

        if (beforeIndex < 0) {
            LOGW() << "insertMeasures: could not determine insertion point for selection target";
            return false;
        }

        return true;
    }

    if (target == InsertMeasuresTarget::AtStartOfScore) {
        engraving::Measure* firstMeasure = score->firstMeasure();
        if (!firstMeasure) {
            LOGW() << "insertMeasures: score has no measures";
            return false;
        }
        beforeIndex = firstMeasure->index();
        return beforeIndex >= 0;
    }

    if (target == InsertMeasuresTarget::AtEndOfScore) {
        beforeIndex = -1;
        return true;
    }

    return false;
}

static engraving::BarLine* ensureEndBarLine(engraving::Measure* measure);

static bool _insertMeasures(uintptr_t score_ptr, int count, InsertMeasuresTarget target, int excerptId)
{
    if (count < 1) {
        LOGW() << "insertMeasures: invalid count " << count;
        return false;
    }

    MainScore score(score_ptr, excerptId);
    int beforeIndex = -1;
    if (!computeBeforeMeasureIndex(score, target, beforeIndex)) {
        return false;
    }

    engraving::MeasureBase* beforeMeasure = beforeIndex >= 0 ? score->measure(beforeIndex) : nullptr;

    mu::engraving::Score::InsertMeasureOptions options;
    options.createEmptyMeasures = false;
    options.moveSignaturesClef = true;
    options.needDeselectAll = false;

    engraving::Measure* oldLastMeasure = nullptr;
    engraving::BarLineType oldBarLineType = engraving::BarLineType::DOUBLE;
    bool oldHadCustomEnding = false;

    score->startCmd();
    if (target == InsertMeasuresTarget::AtEndOfScore) {
        oldLastMeasure = score->lastMeasure();
        if (oldLastMeasure) {
            if (auto barLine = ensureEndBarLine(oldLastMeasure)) {
                oldBarLineType = barLine->barLineType();
                oldHadCustomEnding = oldBarLineType != engraving::BarLineType::NORMAL;
            }
        }
    }

    for (int i = 0; i < count; ++i) {
        score->insertMeasure(engraving::ElementType::MEASURE, beforeMeasure, options);
    }

    if (target == InsertMeasuresTarget::AtEndOfScore && oldLastMeasure && oldHadCustomEnding) {
        if (auto barLine = ensureEndBarLine(oldLastMeasure)) {
            undoChangeBarLineType(barLine, engraving::BarLineType::NORMAL, true);
        }
        engraving::Measure* newLastMeasure = score->lastMeasure();
        if (newLastMeasure && newLastMeasure != oldLastMeasure) {
            if (auto newBarLine = ensureEndBarLine(newLastMeasure)) {
                undoChangeBarLineType(newBarLine, oldBarLineType, true);
            }
        }
    }

    score->endCmd();
    return true;
}

static bool _removeTrailingEmptyMeasures(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);

    engraving::Measure* lastMeasure = score->lastMeasure();
    if (!lastMeasure) {
        return false;
    }

    // Walk backwards to find the first trailing empty measure
    engraving::Measure* firstToDelete = nullptr;
    engraving::Measure* current = lastMeasure;

    while (current && current->isEmpty(mu::nidx)) {
        firstToDelete = current;
        current = current->prevMeasure();
    }

    // No empty measures to remove
    if (!firstToDelete) {
        return true;
    }

    score->startCmd();
    score->deleteMeasures(firstToDelete, lastMeasure, false);
    score->endCmd();
    return true;
}

static bool _removeSelectedMeasures(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    engraving::Measure* startMeasure = nullptr;
    engraving::Measure* endMeasure = nullptr;

    if (!selectionMeasureRange(score, startMeasure, endMeasure)) {
        LOGW() << "removeSelectedMeasures: no selection";
        return false;
    }

    if (!startMeasure || !endMeasure) {
        LOGW() << "removeSelectedMeasures: invalid measure range";
        return false;
    }

    score->startCmd();
    score->deleteMeasures(startMeasure, endMeasure, false);
    score->endCmd();
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

    score->setLayoutAll();
    score->update();

    QByteArray data;
    Ret ret = processWriter(u"xml", score, &data);
    if (!ret) {
        return WasmRes::fromRet(ret);
    }
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
 * @param highlightSelection - if true, selected elements will be rendered with selection color
 */
WasmRes _saveSvg(uintptr_t score_ptr, int pageNumber, bool drawPageBackground, bool highlightSelection, int excerptId) {
    MainScore score(score_ptr, excerptId);

    // For range selections with highlighting, convert to list temporarily
    bool hadRangeSelection = false;
    engraving::Segment* savedStartSeg = nullptr;
    engraving::Segment* savedEndSeg = nullptr;
    int savedStaffStart = 0;
    int savedStaffEnd = 0;
    std::vector<engraving::Note*> temporarilyMarkedNotes;

    if (highlightSelection && score->selection().isRange()) {
        // Save range parameters
        hadRangeSelection = true;
        savedStartSeg = score->selection().startSegment();
        savedEndSeg = score->selection().endSegment();
        savedStaffStart = score->selection().staffStart();
        savedStaffEnd = score->selection().staffEnd();

        // Collect all notes in the range
        std::vector<engraving::Note*> rangeNotes;
        for (auto* seg = savedStartSeg; seg && seg != savedEndSeg; seg = seg->next1()) {
            if (seg->segmentType() != engraving::SegmentType::ChordRest) {
                continue;
            }
            for (auto staffIdx = savedStaffStart; staffIdx < savedStaffEnd; ++staffIdx) {
                for (int voice = 0; voice < mu::engraving::VOICES; ++voice) {
                    auto* el = seg->element(staffIdx * mu::engraving::VOICES + voice);
                    if (el && el->isChord()) {
                        auto* chord = static_cast<engraving::Chord*>(el);
                        for (auto* note : chord->notes()) {
                            rangeNotes.push_back(note);
                        }
                    }
                }
            }
        }

        // Convert to list selection (don't call deselectAll - it might invalidate segments)
        score->selection().clear();
        for (auto* note : rangeNotes) {
            score->select(note, engraving::SelectType::ADD, 0);
        }
        score->selection().updateState();
    }

    // Mark notes within chords as selected for highlighting (for list selections)
    if (highlightSelection && score->selection().state() == engraving::SelState::LIST) {
        for (auto* el : score->selection().elements()) {
            if (el && el->isChord()) {
                auto* chord = static_cast<engraving::Chord*>(el);
                for (auto* note : chord->notes()) {
                    if (!note->selected()) {
                        note->setSelected(true);
                        temporarilyMarkedNotes.push_back(note);
                    }
                }
            }
        }
    }

    INotationWriter::Options options {
        { INotationWriter::OptionKey::PAGE_NUMBER, Val(pageNumber) },
        { INotationWriter::OptionKey::TRANSPARENT_BACKGROUND, Val(!drawPageBackground) },
        { INotationWriter::OptionKey::HIGHLIGHT_SELECTION, Val(highlightSelection) },
    };

    QByteArray data;
    Ret ret = processWriter(u"svg", score, &data, options);

    // Unmark temporarily selected notes
    for (auto* note : temporarilyMarkedNotes) {
        note->setSelected(false);
    }

    // Restore range selection if we converted it
    if (hadRangeSelection && savedStartSeg && savedEndSeg) {
        // Don't call deselectAll() - it might invalidate the segment pointers
        score->selection().setRange(savedStartSeg, savedEndSeg, savedStaffStart, savedStaffEnd);
    }

    LOGI() << String(u"excerpt %1, page index %2, highlightSelection %3, size %4 bytes").arg(excerptId).arg(pageNumber).arg(highlightSelection).arg(data.size());
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

WasmRes _loadProfile(uintptr_t score_ptr)
{
    QJsonObject json;
    auto it = s_loadProfilesByScore.find(score_ptr);
    if (it == s_loadProfilesByScore.end()) {
        json.insert(QStringLiteral("available"), false);
    } else {
        json = it->second;
        json.insert(QStringLiteral("available"), true);
    }
    return WasmRes(QJsonDocument(json).toJson(QJsonDocument::Compact));
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

static engraving::EngravingItem* pickTopmostTextItem(std::vector<engraving::EngravingItem*>& items)
{
    if (items.empty()) {
        return nullptr;
    }

    std::sort(items.begin(), items.end(), elementLower);
    for (auto it = items.rbegin(); it != items.rend(); ++it) {
        engraving::EngravingItem* item = *it;
        if (!item) {
            continue;
        }
        if (item->isPage()) {
            continue;
        }
        if (item->isTextBase()) {
            return item;
        }
    }

    return nullptr;
}

static engraving::EngravingItem* pickTopmostSelectableItem(std::vector<engraving::EngravingItem*>& items)
{
    if (items.empty()) {
        return nullptr;
    }

    std::sort(items.begin(), items.end(), elementLower);
    for (auto it = items.rbegin(); it != items.rend(); ++it) {
        engraving::EngravingItem* item = *it;
        if (!item || item->isPage() || !item->selectable()) {
            continue;
        }
        return item;
    }

    return nullptr;
}

bool _selectTextElementAtPoint(uintptr_t score_ptr, int pageNumber, double x, double y, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    const auto& pages = score->pages();

    if (pageNumber < 0 || pageNumber >= (int)pages.size()) {
        LOGW() << "selectTextElementAtPoint: invalid page index " << pageNumber;
        return false;
    }

    engraving::Page* page = pages.at(pageNumber);
    const mu::PointF pt(x, y);

    auto items = page->items(pt);
    engraving::EngravingItem* target = pickTopmostTextItem(items);
    if (!target) {
        return false;
    }

    score->deselectAll();
    score->select(target, engraving::SelectType::SINGLE, target->staffIdx());
    score->updateSelection();
    score->setSelectionChanged(true);
    return true;
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

    engraving::EngravingItem* target = pickTopmostSelectableItem(items);

    if (!target) {
        return false;
    }

    printf("[WASM SELECT] page=%d x=%.2f y=%.2f type=%d tick=%d\n",
           pageNumber,
           x,
           y,
           static_cast<int>(target->type()),
           target->tick().ticks());


    bool manuallySetRange = false;
    score->deselectAll();

    // If target is StaffLines (type 13), get the parent Measure and select it as a range
    if (target->type() == engraving::ElementType::STAFF_LINES) {
        auto* measure = target->findMeasure();
        if (measure) {
            auto staffIdx = target->staffIdx();
            if (selectMeasureRange(score, measure, staffIdx)) {
                manuallySetRange = true;
            }
        } else {
            score->select(target, engraving::SelectType::SINGLE, target->staffIdx());
        }
    } else if (target->type() == engraving::ElementType::MEASURE) {
        // Direct Measure selection (in case we ever hit this)
        auto* measure = static_cast<engraving::Measure*>(target);
        auto staffIdx = target->staffIdx();
        if (selectMeasureRange(score, measure, staffIdx)) {
            manuallySetRange = true;
        }
    } else {
        // Normal single element selection
        score->select(target, engraving::SelectType::SINGLE, target->staffIdx());
    }

    if (!manuallySetRange) {
        score->updateSelection();
    }
    score->setSelectionChanged(true);

    // Debug: check result
    const auto& sel = score->selection();

    return true;
}

bool _selectMeasureAtPoint(uintptr_t score_ptr, int pageNumber, double x, double y, int excerptId)
{

    MainScore score(score_ptr, excerptId);
    const auto& pages = score->pages();

    if (pageNumber < 0 || pageNumber >= (int)pages.size()) {
        LOGW() << "selectMeasureAtPoint: invalid page index " << pageNumber;
        return false;
    }

    engraving::Page* page = pages.at(pageNumber);
    const mu::PointF pt(x, y);
    const mu::PointF canvasPt = pt + page->pos();


    engraving::staff_idx_t staffIdx = mu::nidx;
    engraving::Segment* segment = nullptr;
    mu::PointF offset;
    engraving::Measure* measure = score->pos2measure(canvasPt, &staffIdx, nullptr, &segment, &offset);


    if (!measure || staffIdx == mu::nidx) {
        return false;
    }

    auto* staffLines = measure->staffLines(staffIdx);

    if (!staffLines || !staffLines->canvasBoundingRect().contains(canvasPt)) {
        return false;
    }

    score->deselectAll();

    if (!selectMeasureRange(score, measure, staffIdx)) {
        return false;
    }

    score->updateSelection();
    score->setSelectionChanged(true);

    // Debug: check what was selected
    const auto& sel = score->selection();

    return true;
}

bool _clearSelection(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);

    // Before deselectAll, explicitly clear SELECTED flag on notes within chords
    // (in case they were set directly for highlighting purposes)
    for (auto* el : score->selection().elements()) {
        if (el && el->isChord()) {
            auto* chord = static_cast<engraving::Chord*>(el);
            for (auto* note : chord->notes()) {
                note->setSelected(false);
            }
        }
    }

    score->deselectAll();
    score->updateSelection();
    score->setSelectionChanged(true);

    return true;
}

/**
 * Convert a range selection to a list selection by collecting all chord/rest elements
 * OR convert a list of Chords to a list of Notes (for pitch operations)
 * This makes the selection work with mutation operations like pitchUp/pitchDown
 */
bool _convertRangeToListSelection(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);

    // If it's a list selection with Chords, convert Chords to Notes
    if (score->selection().state() == engraving::SelState::LIST) {
        bool hasChords = false;
        for (auto* el : score->selection().elements()) {
            if (el && el->isChord()) {
                hasChords = true;
                break;
            }
        }

        if (hasChords) {
            std::vector<engraving::EngravingItem*> notes;
            for (auto* el : score->selection().elements()) {
                if (el && el->isChord()) {
                    auto* chord = static_cast<engraving::Chord*>(el);
                    for (auto* note : chord->notes()) {
                        notes.push_back(note);
                    }
                } else if (el && el->isRest()) {
                    notes.push_back(el);
                }
            }

            score->deselectAll();
            for (auto* note : notes) {
                score->select(note, engraving::SelectType::ADD, 0);
            }
            score->updateSelection();
            score->setSelectionChanged(true);
            return true;
        }

        return true;
    }

    if (!score->selection().isRange()) {
        return true;
    }

    auto* startSeg = score->selection().startSegment();
    auto* endSeg = score->selection().endSegment();
    auto staffStart = score->selection().staffStart();
    auto staffEnd = score->selection().staffEnd();

    // Collect all chord/rest elements AND their notes in the range
    std::vector<engraving::EngravingItem*> rangeElements;
    for (auto* seg = startSeg; seg && seg != endSeg; seg = seg->next1()) {
        if (seg->segmentType() != engraving::SegmentType::ChordRest) {
            continue;
        }
        for (auto staffIdx = staffStart; staffIdx < staffEnd; ++staffIdx) {
            for (int voice = 0; voice < mu::engraving::VOICES; ++voice) {
                auto* el = seg->element(staffIdx * mu::engraving::VOICES + voice);
                if (el && el->isChord()) {
                    // For chords, select the individual notes (pitch operations work on notes)
                    auto* chord = static_cast<engraving::Chord*>(el);
                    for (auto* note : chord->notes()) {
                        rangeElements.push_back(note);
                    }
                } else if (el && el->isRest()) {
                    rangeElements.push_back(el);
                }
            }
        }
    }

    // Clear and rebuild as list selection with individual notes
    score->deselectAll();
    for (auto* el : rangeElements) {
        score->select(el, engraving::SelectType::ADD, 0);
    }

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

    // 0 = replace, 1 = add, 2 = toggle, 3 = range
    if (mode < 0 || mode > 3) {
        LOGW() << "selectElementAtPointWithMode: invalid selection mode " << mode;
        return false;
    }

    engraving::Page* page = pages.at(pageNumber);
    const mu::PointF pt(x, y);

    auto items = page->items(pt);
    if (items.empty()) {
        return false;
    }

    engraving::EngravingItem* target = pickTopmostSelectableItem(items);

    if (!target) {
        return false;
    }

    if (mode == 0) {
        score->deselectAll();
        score->select(target, engraving::SelectType::SINGLE, target->staffIdx());
    } else if (mode == 1) {
        score->select(target, engraving::SelectType::ADD, target->staffIdx());
    } else if (mode == 2) {
        if (target->selected()) {
            score->deselect(target);
        } else {
            score->select(target, engraving::SelectType::ADD, target->staffIdx());
        }
    } else if (mode == 3) {
        // RANGE selection - extends selection from current to target element
        score->select(target, engraving::SelectType::RANGE, target->staffIdx());
    }

    score->updateSelection();
    score->setSelectionChanged(true);
    return true;
}

bool _selectNextChord(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    // Use move() with "next-chord" - this uses SelectType::SINGLE to replace selection
    // instead of selectMove() which uses SelectType::RANGE and extends selection
    auto* el = score->move(u"next-chord");
    if (el) {
        score->updateSelection();
        score->setSelectionChanged(true);
        return true;
    }
    return false;
}

bool _selectPrevChord(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    // Use move() with "prev-chord" - this uses SelectType::SINGLE to replace selection
    // instead of selectMove() which uses SelectType::RANGE and extends selection
    auto* el = score->move(u"prev-chord");
    if (el) {
        score->updateSelection();
        score->setSelectionChanged(true);
        return true;
    }
    return false;
}

bool _extendSelectionNextChord(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    // Use selectMove() with "select-next-chord" - this uses SelectType::RANGE to extend selection
    auto* el = score->selectMove(u"select-next-chord");
    if (el) {
        score->updateSelection();
        score->setSelectionChanged(true);
        return true;
    }
    return false;
}

bool _extendSelectionPrevChord(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    // Use selectMove() with "select-prev-chord" - this uses SelectType::RANGE to extend selection
    auto* el = score->selectMove(u"select-prev-chord");
    if (el) {
        score->updateSelection();
        score->setSelectionChanged(true);
        return true;
    }
    return false;
}

static engraving::EngravingItem* resolvePrimarySelectionElement(engraving::Score* score)
{
    if (!score) {
        return nullptr;
    }

    auto& selection = score->selection();
    if (auto* selected = selection.element()) {
        return selected;
    }

    if (auto* activeCr = selection.activeCR()) {
        return activeCr;
    }

    if (auto* currentCr = selection.currentCR()) {
        return currentCr;
    }

    if (auto* firstCr = selection.firstChordRest()) {
        return firstCr;
    }

    if (!selection.elements().empty()) {
        // Prefer the most recently-added list-selection element over the first one.
        // Using front() can pin audition to an older element when list selection grows.
        return selection.elements().back();
    }

    return nullptr;
}

static engraving::EngravingItem* resolvePreviewPlayableElement(engraving::EngravingItem* selected)
{
    if (!selected) {
        return nullptr;
    }

    // MuseScore audition behavior plays the whole chord when a notehead is the
    // selected/playable target (e.g. adding to an existing chord).
    if (selected->isNote()) {
        auto* note = engraving::toNote(selected);
        if (note && note->chord()) {
            return note->chord();
        }
        return selected;
    }

    if (selected->isChord() || selected->isHarmony()) {
        return selected;
    }

    if (auto* chord = selected->findAncestor(mu::engraving::ElementType::CHORD)) {
        return chord;
    }

    if (auto* note = selected->findAncestor(mu::engraving::ElementType::NOTE)) {
        return note;
    }

    if (auto* harmony = selected->findAncestor(mu::engraving::ElementType::HARMONY)) {
        return harmony;
    }

    return nullptr;
}

static std::optional<midi::tick_t> resolveSelectionRawTick(engraving::MasterScore* score)
{
    if (!score) {
        return std::nullopt;
    }

    const auto& selection = score->selection();
    if (selection.isRange()) {
        if (auto* start = selection.startSegment()) {
            return start->tick().ticks();
        }
    }

    if (auto* cr = selection.activeCR()) {
        return cr->tick().ticks();
    }

    if (auto* cr = selection.currentCR()) {
        return cr->tick().ticks();
    }

    if (auto* firstCr = selection.firstChordRest()) {
        return firstCr->tick().ticks();
    }

    if (auto* el = resolvePrimarySelectionElement(score)) {
        if (el->isSegment()) {
            return el->tick().ticks();
        }
        if (auto* seg = el->findAncestor(mu::engraving::ElementType::SEGMENT)) {
            return seg->tick().ticks();
        }
        return el->tick().ticks();
    }

    if (auto* firstMeasure = score->firstMeasure()) {
        return firstMeasure->tick().ticks();
    }

    return 0;
}

static float selectionPlaybackStartTime(engraving::MasterScore* score)
{
    const auto rawTick = resolveSelectionRawTick(score);
    if (!rawTick.has_value()) {
        return 0.f;
    }

    const midi::tick_t playedTick = score->repeatList().tick2utick(rawTick.value());
    return static_cast<float>(score->utick2utime(playedTick));
}

static bool waitForPlaybackReady(playback::IPlaybackController* playbackController, int maxPumps = 400)
{
    if (!playbackController) {
        return false;
    }

    for (int i = 0; i < maxPumps; ++i) {
        const bool hasSequence = playbackController->currentTrackSequenceId() != -1;
        const bool hasTracks = !playbackController->instrumentTrackIdMap().empty();
        if (hasSequence && hasTracks) {
            if (i > 0) {
                LOGI() << "waitForPlaybackReady: ready after " << i << " processEvents() pumps";
            }
            return true;
        }
        mu::async::processEvents();
    }

    LOGW() << "waitForPlaybackReady: timed out waiting for sequence/tracks";
    return false;
}

bool _triggerSelectionPreview(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    const auto& selection = score->selection();
    LOGI() << "triggerSelectionPreview: sel state=" << static_cast<int>(selection.state())
           << " isSingle=" << selection.isSingle()
           << " isRange=" << selection.isRange()
           << " isList=" << selection.isList()
           << " size=" << selection.elements().size();

    auto* selected = resolvePreviewPlayableElement(resolvePrimarySelectionElement(score));

    if (!selected) {
        for (auto it = selection.elements().rbegin(); it != selection.elements().rend(); ++it) {
            selected = resolvePreviewPlayableElement(*it);
            if (selected) {
                break;
            }
        }
    }

    if (!selected) {
        selected = resolvePreviewPlayableElement(score->selection().activeCR());
    }

    if (!selected) {
        selected = resolvePreviewPlayableElement(score->selection().currentCR());
    }

    if (!selected) {
        selected = resolvePreviewPlayableElement(score->selection().firstChordRest());
    }

    if (!selected) {
        LOGW() << "triggerSelectionPreview: no playable selection found";
        printf("[WASM PREVIEW] no playable selection\n");
        return false;
    }

    printf("[WASM PREVIEW] type=%d tick=%d\n",
           static_cast<int>(selected->type()),
           selected->tick().ticks());

    LOGI() << "triggerSelectionPreview: selected type=" << static_cast<int>(selected->type())
           << " tick=" << selected->tick().ticks();

    auto playbackController = modularity::ioc()->resolve<playback::IPlaybackController>("");
    if (!playbackController) {
        LOGW() << "triggerSelectionPreview: playback controller unavailable";
        return false;
    }

    waitForPlaybackReady(playbackController.get());
    playbackController->reset();
    mu::async::processEvents();

    const std::vector<const notation::EngravingItem*> elements { selected };
    playbackController->playElements(elements);
    mu::async::processEvents();
    mu::async::processEvents();
    return true;
}

float _selectionPlaybackStartTime(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    return selectionPlaybackStartTime(score);
}

uintptr_t _synthAudioFromSelection(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    const float starttime = selectionPlaybackStartTime(score);
    return MainAudio::Synth::start(score, starttime);
}

uintptr_t _synthAudioSelectionPreview(uintptr_t score_ptr, float durationSeconds, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    LOGI() << "synthAudioSelectionPreview: requested durationSeconds=" << durationSeconds;
    if (!_triggerSelectionPreview(score_ptr, excerptId)) {
        LOGW() << "synthAudioSelectionPreview: preview trigger failed";
        return 0;
    }

    const uintptr_t synth = MainAudio::Synth::startPreview(score, durationSeconds);
    LOGI() << "synthAudioSelectionPreview: synth iterator created";
    return synth;
}

WasmRes _getSelectionBoundingBox(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);

    // Try multiple ways to get the selected element
    mu::engraving::EngravingItem* el = score->selection().element();

    // If element() returns null, try getting from the elements list
    if (!el && !score->selection().elements().empty()) {
        el = score->selection().elements().front();
    }

    // Still null? Try activeCR
    if (!el) {
        el = score->selection().activeCR();
    }

    if (!el) {
        return WasmRes(String());
    }

    // Get page position and bounding box
    mu::PointF pagePosition = el->pagePos();
    mu::RectF bbox = el->bbox();

    // Find which page this element is on
    int pageNumber = 0;
    const auto& pages = score->pages();
    for (size_t i = 0; i < pages.size(); ++i) {
        if (el->findAncestor(mu::engraving::ElementType::PAGE) == pages[i]) {
            pageNumber = static_cast<int>(i);
            break;
        }
    }

    // Build JSON string using mu::String
    String json = String(u"{\"page\":%1,\"x\":%2,\"y\":%3,\"width\":%4,\"height\":%5}")
        .arg(pageNumber)
        .arg(pagePosition.x())
        .arg(pagePosition.y())
        .arg(bbox.width())
        .arg(bbox.height());


    return WasmRes(json);
}

WasmRes _getSelectionBoundingBoxes(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    const auto& sel = score->selection();


    String json = u"[";
    bool first = true;

    // Handle range selections (like when a measure is selected)
    if (sel.isRange()) {
        auto* startSeg = sel.startSegment();
        auto* endSeg = sel.endSegment();
        auto staffStart = sel.staffStart();
        auto staffEnd = sel.staffEnd();


        if (startSeg) {
            int segCount = 0;
            int elementCount = 0;
            // Iterate through all segments in the range
            for (auto* seg = startSeg; seg && seg != endSeg; seg = seg->next1()) {
                if (seg->segmentType() != engraving::SegmentType::ChordRest) {
                    continue;
                }
                segCount++;

                // Iterate through all staves in the selection
                for (auto staffIdx = staffStart; staffIdx < staffEnd; ++staffIdx) {
                    // Check all voices in this staff
                    for (int voice = 0; voice < mu::engraving::VOICES; ++voice) {
                        auto* el = seg->element(staffIdx * mu::engraving::VOICES + voice);
                        if (!el || (!el->isChord() && !el->isRest())) {
                            continue;
                        }
                        elementCount++;

                        // For Chords, use the first note's bounding box (noteheads are child elements)
                        mu::RectF pageBbox;
                        if (el->isChord()) {
                            auto* chord = static_cast<engraving::Chord*>(el);
                            if (!chord->notes().empty()) {
                                // Use the first note's bounding box
                                pageBbox = chord->notes()[0]->pageBoundingRect();
                            } else {
                                // Fallback to chord's own bbox
                                pageBbox = el->pageBoundingRect();
                            }
                        } else {
                            // For rests and other elements, use their own bbox
                            pageBbox = el->pageBoundingRect();
                        }

                        // Find which page this element is on
                        int pageNumber = 0;
                        const auto& pages = score->pages();
                        for (size_t i = 0; i < pages.size(); ++i) {
                            if (el->findAncestor(mu::engraving::ElementType::PAGE) == pages[i]) {
                                pageNumber = static_cast<int>(i);
                                break;
                            }
                        }

                        if (!first) {
                            json += u",";
                        }
                        first = false;

                        json += String(u"{\"page\":%1,\"x\":%2,\"y\":%3,\"width\":%4,\"height\":%5}")
                            .arg(pageNumber)
                            .arg(pageBbox.x())
                            .arg(pageBbox.y())
                            .arg(pageBbox.width())
                            .arg(pageBbox.height());
                    }
                }
            }
        }
    } else {
        // Handle list selections (individual elements)
        const auto& elements = sel.elements();

        for (auto* el : elements) {
            if (!el) continue;

            // For Chords, use the first note's bounding box (noteheads are child elements)
            mu::RectF pageBbox;
            if (el->isChord()) {
                auto* chord = static_cast<engraving::Chord*>(el);
                if (!chord->notes().empty()) {
                    // Use the first note's bounding box
                    pageBbox = chord->notes()[0]->pageBoundingRect();
                } else {
                    // Fallback to chord's own bbox
                    pageBbox = el->pageBoundingRect();
                }
            } else {
                // For rests and other elements, use their own bbox
                pageBbox = el->pageBoundingRect();
            }

            // Find which page this element is on
            int pageNumber = 0;
            const auto& pages = score->pages();
            for (size_t i = 0; i < pages.size(); ++i) {
                if (el->findAncestor(mu::engraving::ElementType::PAGE) == pages[i]) {
                    pageNumber = static_cast<int>(i);
                    break;
                }
            }

            if (!first) {
                json += u",";
            }
            first = false;

            json += String(u"{\"page\":%1,\"x\":%2,\"y\":%3,\"width\":%4,\"height\":%5}")
                .arg(pageNumber)
                .arg(pageBbox.x())
                .arg(pageBbox.y())
                .arg(pageBbox.width())
                .arg(pageBbox.height());
        }
    }

    json += u"]";
    return WasmRes(json);
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

    // Convert range to list selection with Notes before calling cmdPitchUp
    _convertRangeToListSelection(score_ptr, excerptId);

    score->startCmd();
    score->cmdPitchUp();
    score->endCmd();

    return true;
}

bool _pitchDown(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);

    // Convert range to list selection with Notes before calling cmdPitchDown
    _convertRangeToListSelection(score_ptr, excerptId);

    score->startCmd();
    score->cmdPitchDown();
    score->endCmd();
    return true;
}

bool _flipStem(uintptr_t score_ptr, int excerptId)
{
    printf("[DEBUG] _flipStem called\n");
    MainScore score(score_ptr, excerptId);
    if (score->selection().isNone()) {
        LOGW() << "flipStem: no selection";
        printf("[DEBUG] flipStem: no selection\n");
        return false;
    }

    std::set<engraving::Chord*> chords;
    std::vector<engraving::Note*> notes = score->selection().noteList();
    for (engraving::Note* note : notes) {
        if (note && note->chord()) {
            chords.insert(note->chord());
        }
    }

    if (chords.empty()) {
        engraving::EngravingItem* selected = score->selection().element();
        if (selected) {
            if (selected->isChord()) {
                chords.insert(engraving::toChord(selected));
            } else if (selected->isNote()) {
                chords.insert(engraving::toNote(selected)->chord());
            } else if (auto* cr = score->selection().cr()) {
                if (cr->isChord()) {
                    chords.insert(engraving::toChord(cr));
                }
            }
        }
    }

    if (chords.empty()) {
        LOGW() << "flipStem: selection is not a chord or note";
        printf("[DEBUG] flipStem: selection is not a chord or note\n");
        return false;
    }

    score->startCmd();
    for (engraving::Chord* chord : chords) {
        if (!chord) {
            continue;
        }

        engraving::DirectionV currentDir = chord->stemDirection();
        engraving::DirectionV newDir;
        if (currentDir == engraving::DirectionV::UP) {
            newDir = engraving::DirectionV::DOWN;
        } else if (currentDir == engraving::DirectionV::DOWN) {
            newDir = engraving::DirectionV::UP;
        } else {
            newDir = chord->up() ? engraving::DirectionV::DOWN : engraving::DirectionV::UP;
        }
        chord->undoChangeProperty(engraving::Pid::STEM_DIRECTION, static_cast<int>(newDir));
    }
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

    // Convert Chords to Notes for transpose operation (uses upDown which needs uniqueNotes)
    _convertRangeToListSelection(score_ptr, excerptId);

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

bool _layoutUntilPage(uintptr_t score_ptr, int targetPage, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    if (targetPage < 0) {
        targetPage = 0;
    }

    if (static_cast<int>(score->npages()) > targetPage) {
        return true;
    }

    const int totalMeasures = layoutMeasureCount(score);
    if (totalMeasures <= 0) {
        score->setLayoutAll();
        score->update();
        return static_cast<int>(score->npages()) > targetPage;
    }

    // Expand the laid-out range in geometric chunks until the target page exists.
    int probeMeasureIndex = std::min(totalMeasures - 1, 7);
    int attempts = 0;
    while (attempts < 32) {
        auto* probeMeasure = layoutMeasureAtIndex(score, probeMeasureIndex);
        if (!probeMeasure) {
            break;
        }

        const engraving::Fraction endTick = probeMeasure->tick() + probeMeasure->ticks();
        score->doLayoutRange(engraving::Fraction(0, 1), endTick);
        if (static_cast<int>(score->npages()) > targetPage) {
            return true;
        }

        if (probeMeasureIndex >= totalMeasures - 1) {
            break;
        }

        const int nextProbe = std::min(totalMeasures - 1, probeMeasureIndex * 2 + 1);
        if (nextProbe <= probeMeasureIndex) {
            break;
        }
        probeMeasureIndex = nextProbe;
        ++attempts;
    }

    // Fallback for edge cases where incremental ranges still did not materialize target page.
    score->setLayoutAll();
    score->update();
    return static_cast<int>(score->npages()) > targetPage;
}

WasmRes _layoutUntilPageState(uintptr_t score_ptr, int targetPage, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    if (targetPage < 0) {
        targetPage = 0;
    }

    const bool targetSatisfied = _layoutUntilPage(score_ptr, targetPage, excerptId);
    return WasmRes(QJsonDocument(layoutProgressJson(score, targetPage, targetSatisfied)).toJson(QJsonDocument::Compact));
}

bool _setLayoutMode(uintptr_t score_ptr, int layoutMode, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    const int minMode = static_cast<int>(engraving::LayoutMode::PAGE);
    const int maxMode = static_cast<int>(engraving::LayoutMode::HORIZONTAL_FIXED);
    if (layoutMode < minMode || layoutMode > maxMode) {
        LOGW() << "setLayoutMode: invalid mode " << layoutMode;
        return false;
    }

    const auto mode = static_cast<engraving::LayoutMode>(layoutMode);
    if (score->layoutMode() == mode) {
        return true;
    }

    score->setLayoutMode(mode);
    score->setLayoutAll();
    score->update();
    return true;
}

WasmRes _getLayoutMode(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    return WasmRes(static_cast<uint32_t>(score->layoutMode()));
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

bool _setDurationType(uintptr_t score_ptr, int durationType, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    auto* el = score->selection().element();
    if (!el) {
        LOGW() << "setDurationType: no element selected";
        return false;
    }
    if (el->isNote()) {
        el = el->parentItem();
    }
    if (!el || !el->isChordRest()) {
        LOGW() << "setDurationType: selection is not chord/rest";
        return false;
    }

    if (durationType < static_cast<int>(engraving::DurationType::V_LONG)
        || durationType >= static_cast<int>(engraving::DurationType::V_ZERO)) {
        LOGW() << "setDurationType: invalid duration type " << durationType;
        return false;
    }

    auto cr = toChordRest(el);
    engraving::TDuration d(static_cast<engraving::DurationType>(durationType));
    d.setDots(0);
    if (!d.isValid() || d.isMeasure()) {
        LOGW() << "setDurationType: resulting duration invalid";
        return false;
    }

    score->startCmd();
    if (cr->isChord() && (toChord(cr)->noteType() != engraving::NoteType::NORMAL)) {
        score->undoChangeChordRestLen(cr, d);
    } else {
        score->changeCRlen(cr, d);
    }
    score->inputState().setDuration(d);
    score->inputState().setRest(cr->isRest());
    score->endCmd();
    return true;
}


bool _setNoteEntryMode(uintptr_t score_ptr, bool enabled, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    score->setNoteEntryMode(enabled);
    if (enabled && !score->inputState().duration().isValid()) {
        score->inputState().setDuration(engraving::TDuration(engraving::DurationType::V_QUARTER));
    }
    return true;
}

bool _setNoteEntryMethod(uintptr_t score_ptr, int method, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    if (method < static_cast<int>(engraving::NoteEntryMethod::UNKNOWN)
        || method > static_cast<int>(engraving::NoteEntryMethod::TIMEWISE)) {
        LOGW() << "setNoteEntryMethod: invalid method " << method;
        return false;
    }
    score->setNoteEntryMethod(static_cast<engraving::NoteEntryMethod>(method));
    return true;
}

bool _setInputStateFromSelection(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    auto* el = score->selection().element();
    if (el && el->isNote()) {
        el = el->parentItem();
    }
    auto* cr = el && el->isChordRest() ? engraving::toChordRest(el) : score->selection().cr();
    if (!cr) {
        LOGW() << "setInputStateFromSelection: no chord/rest selected";
        return false;
    }

    score->inputState().setTrack(cr->track());
    score->inputState().setSegment(cr->segment());
    auto duration = cr->durationType();
    if (duration.isMeasure()) {
        duration = engraving::TDuration(cr->measure()->timesig());
    }
    score->inputState().setDuration(duration);
    score->inputState().setRest(cr->isRest());
    return true;
}

bool _setInputAccidentalType(uintptr_t score_ptr, int accidentalType, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    if (accidentalType < 0 || accidentalType >= static_cast<int>(engraving::AccidentalType::END)) {
        LOGW() << "setInputAccidentalType: invalid accidental type " << accidentalType;
        return false;
    }
    score->inputState().setAccidentalType(static_cast<engraving::AccidentalType>(accidentalType));
    score->inputState().setRest(false);
    return true;
}

bool _setInputDurationType(uintptr_t score_ptr, int durationType, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    if (durationType < static_cast<int>(engraving::DurationType::V_LONG)
        || durationType >= static_cast<int>(engraving::DurationType::V_ZERO)) {
        LOGW() << "setInputDurationType: invalid duration type " << durationType;
        return false;
    }

    engraving::TDuration d(static_cast<engraving::DurationType>(durationType));
    d.setDots(0);
    if (!d.isValid() || d.isMeasure()) {
        LOGW() << "setInputDurationType: invalid duration selection";
        return false;
    }

    score->inputState().setDuration(d);
    return true;
}

bool _toggleInputDot(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    auto duration = score->inputState().duration();
    const int nextDots = duration.dots() > 0 ? 0 : 1;
    score->inputState().setDots(nextDots);
    return true;
}

bool _addPitchByStep(uintptr_t score_ptr, int note, bool addToChord, bool insert, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    if (note < 0 || note > 6) {
        LOGW() << "addPitchByStep: invalid note index " << note;
        return false;
    }
    auto& is = score->inputState();
    if (is.track() == mu::nidx) {
        LOGW() << "addPitchByStep: input track invalid";
        return false;
    }
    // Always sync input state from selection to ensure duration matches the selected element.
    // This prevents re-pitching a note from also changing its duration.
    if (!_setInputStateFromSelection(score_ptr, excerptId)) {
        if (!is.segment()) {
            LOGW() << "addPitchByStep: no input segment";
            return false;
        }
    }
    is.setRest(false);

    const engraving::Drumset* ds = is.drumset();
    int octave = 4;
    if (ds) {
        char note1 = "CDEFGAB"[note];
        int pitch = -1;
        int voice = 0;
        for (int i = 0; i < 127; ++i) {
            if (!ds->isValid(i)) {
                continue;
            }
            if (ds->shortcut(i) && (ds->shortcut(i) == note1)) {
                pitch = i;
                voice = ds->voice(i);
                break;
            }
        }
        if (pitch == -1) {
            LOGW() << "addPitchByStep: drum shortcut " << note1 << " not defined";
            return false;
        }
        is.setDrumNote(pitch);
        is.setTrack(engraving::trackZeroVoice(is.track()) + voice);
        octave = pitch / 12;
        if (is.segment()) {
            auto* seg = is.segment();
            while (seg) {
                if (seg->element(is.track())) {
                    break;
                }
                seg = seg->prev(engraving::SegmentType::ChordRest);
            }
            if (seg) {
                is.setSegment(seg);
            } else {
                is.setSegment(is.segment()->measure()->first(engraving::SegmentType::ChordRest));
            }
        }
    } else {
        static const int tab[] = { 0, 2, 4, 5, 7, 9, 11 };
        engraving::EngravingItem* el = score->selection().element();
        if (addToChord && el && el->isNote()) {
            auto* chord = engraving::toNote(el)->chord();
            auto* n = chord->upNote();
            int tpc = n->tpc();
            octave = (n->epitch() - int(engraving::tpc2alter(tpc))) / engraving::PITCH_DELTA_OCTAVE;
            if (note <= engraving::tpc2step(tpc)) {
                octave++;
            }
        } else {
            int curPitch = 60;
            if (is.segment()) {
                auto* staff = score->staff(is.track() / engraving::VOICES);
                auto* seg = is.segment()->prev1(engraving::SegmentType::ChordRest
                    | engraving::SegmentType::Clef
                    | engraving::SegmentType::HeaderClef);
                while (seg) {
                    if (seg->isChordRestType()) {
                        auto* p = seg->element(is.track());
                        if (p && p->isChord()) {
                            auto* n = engraving::toChord(p)->downNote();
                            curPitch = n->epitch() - static_cast<int>(engraving::tpc2alter(n->tpc()));
                            break;
                        }
                    } else if (seg->isClefType() || seg->isHeaderClefType()) {
                        auto* p = seg->element(engraving::trackZeroVoice(is.track()));
                        if (p && p->isClef()) {
                            auto* clef = engraving::toClef(p);
                            auto ctb = staff->clef(clef->tick() - engraving::Fraction::fromTicks(1));
                            if (ctb != clef->clefType() || clef->tick().isZero()) {
                                curPitch = engraving::line2pitch(4, clef->clefType(), engraving::Key::C);
                                break;
                            }
                        }
                    }
                    seg = seg->prev1MM(engraving::SegmentType::ChordRest
                        | engraving::SegmentType::Clef
                        | engraving::SegmentType::HeaderClef);
                }
                octave = curPitch / 12;
            }

            int delta = octave * 12 + tab[note] - curPitch;
            if (delta > 6) {
                --octave;
            } else if (delta < -6) {
                ++octave;
            }
        }
    }

    int step = octave * 7 + note;
    score->cmdAddPitch(step, addToChord, insert);
    return true;
}

bool _enterRest(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    auto& is = score->inputState();
    if (is.track() == mu::nidx) {
        LOGW() << "enterRest: input track invalid";
        return false;
    }
    if (!is.segment()) {
        if (!_setInputStateFromSelection(score_ptr, excerptId)) {
            LOGW() << "enterRest: no input segment";
            return false;
        }
    }
    auto duration = is.duration();
    if (!duration.isValid() || duration.isMeasure()) {
        duration = engraving::TDuration(engraving::DurationType::V_QUARTER);
        is.setDuration(duration);
    }
    score->cmdEnterRest(duration);
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
    auto& inputState = score->inputState();
    if (inputState.track() == mu::nidx || !inputState.segment()) {
        if (!_setInputStateFromSelection(score_ptr, excerptId)) {
            LOGW() << "setVoice: no selection to seed input state";
            return false;
        }
    }
    // Use input state to set current voice
    score->inputState().setVoice(voiceIndex);
    return true;
}

bool _changeSelectedElementsVoice(uintptr_t score_ptr, int voiceIndex, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    if (voiceIndex < 0 || voiceIndex > 3) {
        LOGW() << "changeSelectedElementsVoice: invalid voice index " << voiceIndex;
        return false;
    }
    if (score->selection().isNone()) {
        LOGW() << "changeSelectedElementsVoice: no selection";
        return false;
    }

    struct StaffTickRange {
        engraving::staff_idx_t staff = 0;
        engraving::Fraction start = engraving::Fraction(0, 1);
        engraving::Fraction end = engraving::Fraction(0, 1);
    };

    std::vector<StaffTickRange> ranges;
    for (auto* selected : score->selection().elements()) {
        if (!selected || !selected->isNote()) {
            continue;
        }
        auto* chord = engraving::toNote(selected)->chord();
        if (!chord || !chord->measure()) {
            continue;
        }
        const auto staff = chord->staffIdx();
        const auto start = chord->measure()->tick();
        const auto end = chord->measure()->tick() + chord->measure()->ticks();
        auto it = std::find_if(ranges.begin(), ranges.end(), [staff](const StaffTickRange& range) {
            return range.staff == staff;
        });
        if (it == ranges.end()) {
            ranges.push_back({ staff, start, end });
        } else {
            if (start < it->start) {
                it->start = start;
            }
            if (end > it->end) {
                it->end = end;
            }
        }
    }

    score->startCmd();
    // Older libmscore builds only support moving selected notes across voices.
    score->changeSelectedNotesVoice(voiceIndex);
    if (voiceIndex > 0 && !ranges.empty()) {
        for (const auto& range : ranges) {
            const auto track = range.staff * engraving::VOICES + voiceIndex;
            auto* seg = score->tick2segment(range.start, true, engraving::SegmentType::ChordRest, false);
            for (; seg && seg->tick() < range.end; seg = seg->next(engraving::SegmentType::ChordRest)) {
                auto* item = seg->element(track);
                if (!item || !item->isRest()) {
                    continue;
                }
                auto* rest = engraving::toRest(item);
                rest->undoChangeProperty(engraving::Pid::GAP, true);
            }
        }
    }
    score->endCmd();
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

bool _addHairpin(uintptr_t score_ptr, int hairpinType, int excerptId)
{
    MainScore score(score_ptr, excerptId);
    if (score->selection().isNone()) {
        LOGW() << "addHairpin: no selection";
        return false;
    }
    if (hairpinType < static_cast<int>(engraving::HairpinType::CRESC_HAIRPIN)
        || hairpinType > static_cast<int>(engraving::HairpinType::DECRESC_LINE)) {
        LOGW() << "addHairpin: invalid hairpin type " << hairpinType;
        return false;
    }

    score->startCmd();
    const auto type = static_cast<engraving::HairpinType>(hairpinType);
    const auto hairpins = score->addHairpins(type);
    score->endCmd();

    const bool added = std::any_of(hairpins.begin(), hairpins.end(), [](engraving::Hairpin* hairpin) {
        return hairpin != nullptr;
    });
    if (!added) {
        LOGW() << "addHairpin: failed to add hairpin";
    }
    return added;
}

static engraving::staff_idx_t resolvePedalStaffIdx(engraving::Score* score, engraving::staff_idx_t staffIdx, const engraving::Fraction& tick)
{
    if (!score || staffIdx == mu::nidx) {
        return staffIdx;
    }
    auto* staff = score->staff(staffIdx);
    if (!staff || !staff->part() || staff->part()->nstaves() <= 1) {
        return staffIdx;
    }
    const auto familyId = staff->part()->familyId();
    const auto instrumentId = staff->part()->instrumentId(tick);
    const bool isKeyboardFamily = familyId == String(u"keyboard") || familyId == String(u"keyboards");
    const bool isPianoLike = instrumentId.contains(u"piano", mu::CaseInsensitive)
        || instrumentId.contains(u"keyboard", mu::CaseInsensitive);
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

static bool resolvePedalSelectionRange(MainScore& score, PedalSelectionRange& out, const char* logPrefix)
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
        if (activeTrack == mu::nidx) {
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
    for (int voice = 0; voice < engraving::VOICES; ++voice) {
        const auto track = engraving::staff2track(staffIdx, voice);
        auto* cr = segment->cr(track);
        if (cr) {
            return cr;
        }
    }
    return nullptr;
}

static bool resolvePedalTextAnchor(MainScore& score, engraving::ChordRest*& outCr, const char* logPrefix)
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
        if (activeTrack != mu::nidx) {
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

static bool applyTextMarkup(MainScore& score, engraving::TextStyleType style, engraving::ChordRest* target, const String& xmlText, const char* logPrefix)
{
    if (!target) {
        LOGW() << logPrefix << ": no target for text";
        return false;
    }

    score->startCmd();
    engraving::TextBase* textItem = score->addText(style, target);
    if (!textItem) {
        score->endCmd();
        LOGW() << logPrefix << ": failed to create text";
        return false;
    }
    textItem->undoChangeProperty(engraving::Pid::TEXT, xmlText);
    score->endCmd();
    return true;
}

bool _addPedal(uintptr_t score_ptr, int pedalVariant, int excerptId)
{
    MainScore score(score_ptr, excerptId);
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

    score->startCmd();
    score->cmdAddSpanner(pedal, selectionRange.staffIdx, selectionRange.startSeg, selectionRange.endSeg);
    score->endCmd();
    return true;
}

bool _addSostenutoPedal(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);
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

    score->startCmd();
    score->cmdAddSpanner(pedal, selectionRange.staffIdx, selectionRange.startSeg, selectionRange.endSeg);
    score->endCmd();
    return true;
}

bool _addUnaCorda(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);
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

bool _splitPedal(uintptr_t score_ptr, int excerptId)
{
    MainScore score(score_ptr, excerptId);
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
        if (activeTrack != mu::nidx) {
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

    score->startCmd();
    score->undoRemoveElement(pedal);
    score->cmdAddSpanner(leftPedal, staffIdx, startSeg, splitSeg);
    score->cmdAddSpanner(rightPedal, staffIdx, splitSeg, endSeg);
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
    rm->setXmlText(u"A");
    const String rehearsalText = score->createRehearsalMarkText(rm);
    if (!rehearsalText.isEmpty()) {
        rm->setXmlText(rehearsalText);
    }
    rm->setTrack(engraving::trackZeroVoice(cr->track()));

    score->startCmd();
    score->undo(new engraving::AddElement(rm));
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

bool _setTimeSignatureWithType(uintptr_t score_ptr, int numerator, int denominator, int timeSigType, int excerptId)
{
    MainScore score(score_ptr, excerptId);
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
    bool setSelectedText(uintptr_t score_ptr, const char* plainText, int excerptId = -1) {
        return _setSelectedText(score_ptr, plainText, excerptId);
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
    bool insertMeasures(uintptr_t score_ptr, int count, int target, int excerptId = -1) {
        return _insertMeasures(score_ptr, count, parseInsertMeasuresTarget(target), excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool removeTrailingEmptyMeasures(uintptr_t score_ptr, int excerptId = -1) {
        return _removeTrailingEmptyMeasures(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool removeSelectedMeasures(uintptr_t score_ptr, int excerptId = -1) {
        return _removeSelectedMeasures(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    WasmResBytes npages(uintptr_t score_ptr, int excerptId) {
        return _npages(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    WasmResBytes measureSignatureCount(uintptr_t score_ptr, int partIndex, int excerptId = -1) {
        return _measureSignatureCount(score_ptr, partIndex, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    WasmResBytes measureSignatureAt(uintptr_t score_ptr, int partIndex, int measureIndex, int excerptId = -1) {
        return _measureSignatureAt(score_ptr, partIndex, measureIndex, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    WasmResBytes measureSignatures(uintptr_t score_ptr, int partIndex, int excerptId = -1) {
        return _measureSignatures(score_ptr, partIndex, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    WasmResBytes measureLineBreaks(uintptr_t score_ptr, int excerptId = -1) {
        return _measureLineBreaks(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool setMeasureLineBreaks(uintptr_t score_ptr, const char* data, uint32_t size, int excerptId = -1) {
        return _setMeasureLineBreaks(score_ptr, data, size, excerptId);
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
    WasmResBytes saveSvg(uintptr_t score_ptr, int pageNumber, bool drawPageBackground, bool highlightSelection = false, int excerptId = -1) {
        return _saveSvg(score_ptr, pageNumber, drawPageBackground, highlightSelection, excerptId);
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
    bool selectMeasureAtPoint(uintptr_t score_ptr, int pageNumber, double x, double y, int excerptId = -1) {
        return _selectMeasureAtPoint(score_ptr, pageNumber, x, y, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool selectPartMeasureByIndex(uintptr_t score_ptr, int partIndex, int measureIndex, int excerptId = -1) {
        return _selectPartMeasureByIndex(score_ptr, partIndex, measureIndex, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool selectTextElementAtPoint(uintptr_t score_ptr, int pageNumber, double x, double y, int excerptId = -1) {
        return _selectTextElementAtPoint(score_ptr, pageNumber, x, y, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool clearSelection(uintptr_t score_ptr, int excerptId = -1) {
        return _clearSelection(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool convertRangeToListSelection(uintptr_t score_ptr, int excerptId = -1) {
        return _convertRangeToListSelection(score_ptr, excerptId);
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
    bool selectNextChord(uintptr_t score_ptr, int excerptId = -1) {
        return _selectNextChord(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool selectPrevChord(uintptr_t score_ptr, int excerptId = -1) {
        return _selectPrevChord(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool extendSelectionNextChord(uintptr_t score_ptr, int excerptId = -1) {
        return _extendSelectionNextChord(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool extendSelectionPrevChord(uintptr_t score_ptr, int excerptId = -1) {
        return _extendSelectionPrevChord(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    WasmResBytes getSelectionBoundingBox(uintptr_t score_ptr, int excerptId = -1) {
        return _getSelectionBoundingBox(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    WasmResBytes getSelectionBoundingBoxes(uintptr_t score_ptr, int excerptId = -1) {
        return _getSelectionBoundingBoxes(score_ptr, excerptId);
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
    bool flipStem(uintptr_t score_ptr, int excerptId = -1) {
        return _flipStem(score_ptr, excerptId);
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
    bool layoutUntilPage(uintptr_t score_ptr, int targetPage, int excerptId = -1) {
        return _layoutUntilPage(score_ptr, targetPage, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    WasmResBytes layoutUntilPageState(uintptr_t score_ptr, int targetPage, int excerptId = -1) {
        return _layoutUntilPageState(score_ptr, targetPage, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool setLayoutMode(uintptr_t score_ptr, int layoutMode, int excerptId = -1) {
        return _setLayoutMode(score_ptr, layoutMode, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    WasmResBytes getLayoutMode(uintptr_t score_ptr, int excerptId = -1) {
        return _getLayoutMode(score_ptr, excerptId);
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
    bool setNoteEntryMode(uintptr_t score_ptr, bool enabled, int excerptId = -1) {
        return _setNoteEntryMode(score_ptr, enabled, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool setNoteEntryMethod(uintptr_t score_ptr, int method, int excerptId = -1) {
        return _setNoteEntryMethod(score_ptr, method, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool setInputStateFromSelection(uintptr_t score_ptr, int excerptId = -1) {
        return _setInputStateFromSelection(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool setInputAccidentalType(uintptr_t score_ptr, int accidentalType, int excerptId = -1) {
        return _setInputAccidentalType(score_ptr, accidentalType, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool setInputDurationType(uintptr_t score_ptr, int durationType, int excerptId = -1) {
        return _setInputDurationType(score_ptr, durationType, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool toggleInputDot(uintptr_t score_ptr, int excerptId = -1) {
        return _toggleInputDot(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool addPitchByStep(uintptr_t score_ptr, int note, bool addToChord, bool insert, int excerptId = -1) {
        return _addPitchByStep(score_ptr, note, addToChord, insert, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool enterRest(uintptr_t score_ptr, int excerptId = -1) {
        return _enterRest(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool setDurationType(uintptr_t score_ptr, int durationType, int excerptId = -1) {
        return _setDurationType(score_ptr, durationType, excerptId);
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
    bool changeSelectedElementsVoice(uintptr_t score_ptr, int voiceIndex, int excerptId = -1) {
        return _changeSelectedElementsVoice(score_ptr, voiceIndex, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool addDynamic(uintptr_t score_ptr, int dynamicType, int excerptId = -1) {
        return _addDynamic(score_ptr, dynamicType, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool addHairpin(uintptr_t score_ptr, int hairpinType, int excerptId = -1) {
        return _addHairpin(score_ptr, hairpinType, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool addPedal(uintptr_t score_ptr, int pedalVariant, int excerptId = -1) {
        return _addPedal(score_ptr, pedalVariant, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool addSostenutoPedal(uintptr_t score_ptr, int excerptId = -1) {
        return _addSostenutoPedal(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool addUnaCorda(uintptr_t score_ptr, int excerptId = -1) {
        return _addUnaCorda(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    bool splitPedal(uintptr_t score_ptr, int excerptId = -1) {
        return _splitPedal(score_ptr, excerptId);
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
    bool setTimeSignatureWithType(uintptr_t score_ptr, int numerator, int denominator, int timeSigType, int excerptId = -1) {
        return _setTimeSignatureWithType(score_ptr, numerator, denominator, timeSigType, excerptId);
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
    uintptr_t synthAudioFromSelection(uintptr_t score_ptr, int excerptId = -1) {
        return _synthAudioFromSelection(score_ptr, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    uintptr_t synthAudioSelectionPreview(uintptr_t score_ptr, float durationSeconds, int excerptId = -1) {
        return _synthAudioSelectionPreview(score_ptr, durationSeconds, excerptId);
    };

    EMSCRIPTEN_KEEPALIVE
    float selectionPlaybackStartTime(uintptr_t score_ptr, int excerptId = -1) {
        return _selectionPlaybackStartTime(score_ptr, excerptId);
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
    WasmResBytes loadProfile(uintptr_t score_ptr) {
        return _loadProfile(score_ptr);
    };

    EMSCRIPTEN_KEEPALIVE
    void destroy(uintptr_t score_ptr) {
        s_loadProfilesByScore.erase(score_ptr);
        // remove the only alive reference to the smart pointer
        engraving::EngravingProjectPtr a = ((engraving::MasterScore*)score_ptr)->project().lock();
        instances.erase(a);
        // destroying the `EngravingProject` also destroys its `MasterScore` in its destructor
    };

}
