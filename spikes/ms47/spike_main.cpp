// MS47 build spike harness: boot engraving without Qt, load a score from memory,
// lay it out, save MSCZ, export MusicXML, paint page 1 into a draw-command buffer.
//
// usage: ms47_spike <resource-root> <score.mscz|score.mscx|score.musicxml> [out-dir]

#include <chrono>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <map>
#include <sstream>
#ifndef __EMSCRIPTEN__
#include <csignal>
#include <execinfo.h>
#include <unistd.h>
#endif

#include "global/modularity/ioc.h"
#include "global/io/ifilesystem.h"
#include "global/io/buffer.h"
#include "global/io/file.h"
#include "global/iapplication.h"

#include "draw/drawmodule.h"
#include "draw/painter.h"
#include "draw/bufferedpaintprovider.h"
#include "draw/utils/drawdatajson.h"
#include "draw/internal/ifontsdatabase.h"

#include "engraving/engravingmodule.h"
#include "engraving/engravingproject.h"
#include "engraving/iengravingconfiguration.h"
#include "engraving/infrastructure/mscreader.h"
#include "engraving/infrastructure/mscwriter.h"
#include "engraving/infrastructure/localfileinfoprovider.h"
#include "engraving/internal/engravingfontsprovider.h"
#include "engraving/dom/masterscore.h"
#include "engraving/dom/mscore.h"
#include "engraving/dom/instrtemplate.h"
#include "engraving/dom/stafftype.h"
#include "engraving/dom/page.h"
#include "engraving/style/defaultstyle.h"
#include "engraving/rendering/iscorerenderer.h"
#include "engraving/types/symnames.h"
#include "engraving/infrastructure/smufl.h"

#include "importexport/musicxml/imusicxmlconfiguration.h"
#include "importexport/musicxml/internal/export/exportmusicxml.h"
#include "importexport/musicxml/internal/import/importmusicxml.h"

using namespace muse;
using namespace mu::engraving;
namespace fs = std::filesystem;

#define STAGE(x) (std::fprintf(stderr, "[stage] %s\n", x), std::fflush(stderr))

static double nowMs()
{
    using namespace std::chrono;
    return duration<double, std::milli>(steady_clock::now().time_since_epoch()).count();
}

// ---------------------------------------------------------------------------
// Filesystem: real files, with ":/x" (Qt resource paths) served from <resroot>/x
// ---------------------------------------------------------------------------
class SpikeFileSystem : public io::IFileSystem
{
public:
    explicit SpikeFileSystem(fs::path resRoot)
        : m_resRoot(std::move(resRoot)) {}

    fs::path map(const io::path_t& p) const
    {
        const std::string& s = p.toStdString();
        if (s.rfind("://", 0) == 0) {
            return m_resRoot / s.substr(3);
        }
        if (s.rfind(":/", 0) == 0) {
            return m_resRoot / s.substr(2);
        }
        return fs::path(s);
    }

    Ret exists(const io::path_t& path) const override
    {
        std::error_code ec;
        return fs::exists(map(path), ec) ? make_ok() : make_ret(Ret::Code::UnknownError);
    }

    Ret remove(const io::path_t&, bool) override { return make_ret(Ret::Code::NotSupported); }
    Ret clear(const io::path_t&) override { return make_ret(Ret::Code::NotSupported); }
    Ret copy(const io::path_t&, const io::path_t&, bool) override { return make_ret(Ret::Code::NotSupported); }
    Ret move(const io::path_t&, const io::path_t&, bool) override { return make_ret(Ret::Code::NotSupported); }
    Ret makePath(const io::path_t&) const override { return make_ret(Ret::Code::NotSupported); }
    Ret makeLink(const io::path_t&, const io::path_t&) const override { return make_ret(Ret::Code::NotSupported); }

    io::EntryType entryType(const io::path_t& path) const override
    {
        std::error_code ec;
        fs::path p = map(path);
        if (fs::is_directory(p, ec)) {
            return io::EntryType::Dir;
        }
        if (fs::is_regular_file(p, ec)) {
            return io::EntryType::File;
        }
        return io::EntryType::Undefined;
    }

    RetVal<uint64_t> fileSize(const io::path_t& path) const override
    {
        std::error_code ec;
        uint64_t size = fs::file_size(map(path), ec);
        if (ec) {
            return RetVal<uint64_t>::make_ret(Ret::Code::UnknownError);
        }
        return RetVal<uint64_t>::make_ok(size);
    }

    RetVal<io::paths_t> scanFiles(const io::path_t& rootDir, const std::vector<std::string>& filters,
                                  io::ScanMode) const override
    {
        io::paths_t result;
        std::error_code ec;
        for (auto it = fs::recursive_directory_iterator(map(rootDir), ec); !ec && it != fs::recursive_directory_iterator(); ++it) {
            if (!it->is_regular_file()) {
                continue;
            }
            std::string name = it->path().filename().string();
            bool match = filters.empty();
            for (const std::string& f : filters) {
                std::string ext = f.rfind("*", 0) == 0 ? f.substr(1) : f;
                match = match || (name.size() >= ext.size() && name.compare(name.size() - ext.size(), ext.size(), ext) == 0);
            }
            if (match) {
                result.push_back(io::path_t(it->path().string()));
            }
        }
        return RetVal<io::paths_t>::make_ok(result);
    }

    void setAttribute(const io::path_t&, Attribute) const override {}
    bool setPermissionsAllowedForAll(const io::path_t&) const override { return false; }

    RetVal<ByteArray> readFile(const io::path_t& filePath) const override
    {
        ByteArray data;
        Ret ret = readFile(filePath, data);
        if (!ret) {
            return RetVal<ByteArray>::make_ret(ret);
        }
        return RetVal<ByteArray>::make_ok(data);
    }

    Ret readFile(const io::path_t& filePath, ByteArray& data) const override
    {
        std::ifstream in(map(filePath), std::ios::binary);
        if (!in) {
            return make_ret(Ret::Code::UnknownError);
        }
        std::string bytes((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
        data = ByteArray(reinterpret_cast<const uint8_t*>(bytes.data()), bytes.size());
        return make_ok();
    }

    Ret writeFile(const io::path_t& filePath, const ByteArray& data) override
    {
        std::ofstream out(map(filePath), std::ios::binary);
        out.write(reinterpret_cast<const char*>(data.constData()), data.size());
        return out ? make_ok() : make_ret(Ret::Code::UnknownError);
    }

    RetVal<io::StreamId> openStream(const io::path_t&, io::OpenMode) override
    {
        return RetVal<io::StreamId>::make_ret(Ret::Code::NotSupported);
    }

    Ret writeToStream(io::StreamId, const ByteArray&, uint64_t) override { return make_ret(Ret::Code::NotSupported); }
    Ret closeStream(io::StreamId) override { return make_ret(Ret::Code::NotSupported); }

    io::path_t canonicalFilePath(const io::path_t& filePath) const override { return filePath; }
    io::path_t absolutePath(const io::path_t& filePath) const override { return io::path_t(map(filePath).parent_path().string()); }
    io::path_t absoluteFilePath(const io::path_t& filePath) const override { return filePath; }
    DateTime birthTime(const io::path_t&) const override { return DateTime(); }
    DateTime lastModified(const io::path_t&) const override { return DateTime(); }
    Ret isWritable(const io::path_t&) const override { return make_ok(); }

private:
    fs::path m_resRoot;
};

// ---------------------------------------------------------------------------
// Application: the writer asks it for the program version
// ---------------------------------------------------------------------------
class SpikeApplication : public IApplication
{
public:
    String name() const override { return u"ms47-spike"; }
    String title() const override { return u"ms47-spike"; }
    bool unstable() const override { return true; }
    Version version() const override { return Version(4, 7, 4); }
    Version fullVersion() const override { return Version(4, 7, 4); }
    String build() const override { return u"spike"; }
    String revision() const override { return u"0"; }
    RunMode runMode() const override { return RunMode::ConsoleApp; }
    bool noGui() const override { return true; }
    void setup() override {}
    void finish() override {}
    void restart() override {}
    modularity::ContextPtr setupNewContext() override { return nullptr; }
    int contextCount() const override { return 1; }
    std::vector<modularity::ContextPtr> contexts() const override { return {}; }
    const modularity::ContextPtr iocContext() const override { return nullptr; }
    modularity::ModulesIoC* ioc() const override { return modularity::globalIoc(); }
    void processEvents() override {}
};

// ---------------------------------------------------------------------------
// Engraving configuration: fixed defaults, no settings store
// ---------------------------------------------------------------------------
class SpikeEngravingConfiguration : public IEngravingConfiguration
{
public:
    io::path_t appDataPath() const override { return {}; }

    io::path_t defaultStyleFilePath() const override { return {}; }
    void setDefaultStyleFilePath(const io::path_t&) override {}
    async::Channel<io::path_t> defaultStyleFilePathChanged() const override { return {}; }

    io::path_t partStyleFilePath() const override { return {}; }
    void setPartStyleFilePath(const io::path_t&) override {}
    async::Channel<io::path_t> partStyleFilePathChanged() const override { return {}; }

    SizeF defaultPageSize() const override { return SizeF(8.27, 11.69); } // A4, inches

    bool canLayoutIcons() const override { return false; }
    String iconsFontFamily() const override { return {}; }

    Color defaultColor() const override { return Color::BLACK; }
    Color scoreInversionColor() const override { return Color::BLACK; }
    Color lassoColor() const override { return Color::BLACK; }
    Color warningColor() const override { return Color::RED; }
    Color warningSelectedColor() const override { return Color::RED; }
    Color criticalColor() const override { return Color::RED; }
    Color criticalBackgroundColor() const override { return Color::WHITE; }
    Color criticalSelectedColor() const override { return Color::RED; }
    Color thumbnailBackgroundColor() const override { return Color::WHITE; }
    Color noteBackgroundColor() const override { return Color::WHITE; }
    Color fontPrimaryColor() const override { return Color::BLACK; }
    Color voiceColor(voice_idx_t) const override { return Color::BLUE; }

    double guiScaling() const override { return 1.0; }

    Color selectionColor(voice_idx_t, bool, bool) const override { return Color::BLUE; }
    void setSelectionColor(voice_idx_t, Color) override {}
    async::Channel<voice_idx_t, Color> selectionColorChanged() const override { return {}; }

    bool dynamicsApplyToAllVoices() const override { return true; }
    void setDynamicsApplyToAllVoices(bool) override {}
    async::Channel<bool> dynamicsApplyToAllVoicesChanged() const override { return {}; }

    bool autoUpdateFretboardDiagrams() const override { return false; }
    void setAutoUpdateFretboardDiagrams(bool) override {}
    async::Channel<bool> autoUpdateFretboardDiagramsChanged() const override { return {}; }

    Color formattingColor() const override { return Color::BLUE; }
    async::Channel<Color> formattingColorChanged() const override { return {}; }
    Color invisibleColor() const override { return Color(128, 128, 128); }
    async::Channel<Color> invisibleColorChanged() const override { return {}; }
    Color unlinkedColor() const override { return Color(128, 128, 128); }
    async::Channel<Color> unlinkedColorChanged() const override { return {}; }
    Color frameColor() const override { return Color::BLACK; }
    async::Channel<Color> frameColorChanged() const override { return {}; }
    Color scoreGreyColor() const override { return Color(128, 128, 128); }
    Color highlightSelectionColor(voice_idx_t) const override { return Color::BLUE; }

    const DebuggingOptions& debuggingOptions() const override { return m_debug; }
    void setDebuggingOptions(const DebuggingOptions& options) override { m_debug = options; }
    async::Notification debuggingOptionsChanged() const override { return {}; }

    bool isAccessibleEnabled() const override { return false; }
    bool doNotSaveEIDsForBackCompat() const override { return false; }
    void setDoNotSaveEIDsForBackCompat(bool) override {}
    bool allowReadingImagesFromOutsideMscz() const override { return false; }

    bool guitarProImportExperimental() const override { return false; }
    bool negativeFretsAllowed() const override { return false; }
    void setGuitarProMultivoiceEnabled(bool) override {}
    bool guitarProMultivoiceEnabled() const override { return false; }
    bool minDistanceForPartialSkylineCalculated() const override { return false; }
    bool specificSlursLayoutWorkaround() const override { return false; }
    bool preferSameStringForTranspose() const override { return false; }
    void setPreferSameStringForTranspose(bool) override {}

    int maxScaledImageDim() const override { return 4096; }
    void setMaxScaledImageDim(int) override {}

private:
    DebuggingOptions m_debug;
};

// ---------------------------------------------------------------------------
// MusicXML configuration: desktop defaults
// ---------------------------------------------------------------------------
class SpikeMusicXmlConfiguration : public mu::iex::musicxml::IMusicXmlConfiguration
{
public:
    bool importBreaks() const override { return true; }
    void setImportBreaks(bool) override {}
    async::Channel<bool> importBreaksChanged() const override { return {}; }
    bool importLayout() const override { return true; }
    void setImportLayout(bool) override {}
    async::Channel<bool> importLayoutChanged() const override { return {}; }
    bool exportLayout() const override { return true; }
    void setExportLayout(bool) override {}
    bool exportMu3Compat() const override { return false; }
    void setExportMu3Compat(bool) override {}
    MusicXmlExportBreaksType exportBreaksType() const override { return MusicXmlExportBreaksType::All; }
    void setExportBreaksType(MusicXmlExportBreaksType) override {}
    bool exportInvisibleElements() const override { return false; }
    void setExportInvisibleElements(bool) override {}
    bool needUseDefaultFont() const override { return false; }
    void setNeedUseDefaultFont(bool) override {}
    async::Channel<bool> needUseDefaultFontChanged() const override { return {}; }
    void setNeedUseDefaultFontOverride(std::optional<bool>) override {}
    bool needAskAboutApplyingNewStyle() const override { return false; }
    void setNeedAskAboutApplyingNewStyle(bool) override {}
    async::Channel<bool> needAskAboutApplyingNewStyleChanged() const override { return {}; }
    bool inferTextType() const override { return true; }
    void setInferTextType(bool) override {}
    async::Channel<bool> inferTextTypeChanged() const override { return {}; }
    void setInferTextTypeOverride(std::optional<bool>) override {}
};

// ---------------------------------------------------------------------------
// Boot: the module wiring EngravingModule::onInit does when ENGRAVING_NO_INTERNAL is off
// ---------------------------------------------------------------------------
static muse::draw::DrawModule s_drawModule;
static EngravingModule s_engravingModule;

static void boot(const fs::path& resRoot)
{
    using namespace muse::draw;
    auto ioc = muse::modularity::globalIoc();

    ioc->registerExport<io::IFileSystem>("spike", new SpikeFileSystem(resRoot));
    ioc->registerExport<IApplication>("spike", new SpikeApplication());
    ioc->registerExport<mu::iex::musicxml::IMusicXmlConfiguration>("spike", new SpikeMusicXmlConfiguration());
    STAGE("fs registered");

    s_drawModule.registerExports();
    s_engravingModule.registerExports();
    STAGE("modules exports");

    auto config = std::make_shared<SpikeEngravingConfiguration>();
    auto engravingFonts = std::make_shared<EngravingFontsProvider>(nullptr);
    ioc->registerExport<IEngravingConfiguration>("spike", config);
    ioc->registerExport<IEngravingFontsProvider>("spike", engravingFonts);

    s_drawModule.onInit(muse::IApplication::RunMode::ConsoleApp);
    STAGE("draw onInit");

    std::shared_ptr<IFontsDatabase> fdb = ioc->resolve<IFontsDatabase>("spike");
    fdb->addFont(FontDataKey(u"Edwin", false, false), ":/fonts/edwin/Edwin-Roman.otf");
    fdb->addFont(FontDataKey(u"Edwin", false, true), ":/fonts/edwin/Edwin-Italic.otf");
    fdb->addFont(FontDataKey(u"Edwin", true, false), ":/fonts/edwin/Edwin-Bold.otf");
    fdb->addFont(FontDataKey(u"Edwin", true, true), ":/fonts/edwin/Edwin-BdIta.otf");

    auto addMusicFont = [&](const std::string& name, const FontDataKey& key, const io::path_t& path) {
        fdb->addFont(key, path);
        engravingFonts->addInternalFont(name, key.family().id().toStdString(), path);
    };
    addMusicFont("Bravura", FontDataKey(u"Bravura"), ":/fonts/bravura/Bravura.otf");
    fdb->addFont(FontDataKey(u"Bravura Text"), ":/fonts/bravura/BravuraText.otf");
    addMusicFont("Leland", FontDataKey(u"Leland"), ":/fonts/leland/Leland.otf");
    fdb->addFont(FontDataKey(u"Leland Text"), ":/fonts/leland/LelandText.otf");
    addMusicFont("Emmentaler", FontDataKey(u"MScore"), ":/fonts/mscore/MScore.otf");
    fdb->addFont(FontDataKey(u"MScore Text"), ":/fonts/mscore/MScoreText.otf");
    addMusicFont("Petaluma", FontDataKey(u"Petaluma"), ":/fonts/petaluma/Petaluma.otf");
    fdb->addFont(FontDataKey(u"Petaluma Text"), ":/fonts/petaluma/PetalumaText.otf");
    fdb->addFont(FontDataKey(u"FreeSerif"), ":/fonts/FreeSerif.ttf");
    fdb->addFont(FontDataKey(u"FreeSans"), ":/fonts/FreeSans.ttf");
    fdb->addFont(FontDataKey(u"MScoreTabulature"), ":/fonts/mscoreTab.ttf");
    fdb->addFont(FontDataKey(u"MscoreBC"), ":/fonts/mscore-BC.ttf");
    fdb->addFont(FontDataKey(u"Campania"), ":/fonts/campania/Campania.otf");

    fdb->setDefaultFont(Font::Type::Unknown, FontDataKey(u"Edwin"));
    fdb->setDefaultFont(Font::Type::Text, FontDataKey(u"Edwin"));
    fdb->setDefaultFont(Font::Type::Tablature, FontDataKey(u"FreeSerif"));
    fdb->setDefaultFont(Font::Type::MusicSymbolText, FontDataKey(u"Bravura Text"));
    fdb->setDefaultFont(Font::Type::MusicSymbol, FontDataKey(u"Bravura"));
    engravingFonts->setFallbackFont("Bravura");
    STAGE("fonts added");

    Smufl::init();
    STAGE("smufl init");
    engravingFonts->loadAllFonts();
    STAGE("fonts loaded");

    DefaultStyle::instance()->init(config->defaultStyleFilePath(), config->partStyleFilePath(), config->defaultPageSize());
    StaffType::initStaffTypes(config->defaultColor());
    STAGE("style+stafftypes");

    // the part of EngravingModule::onInit that runs regardless of ENGRAVING_NO_INTERNAL (drumset, figured bass, palette score)
    s_engravingModule.onInit(muse::IApplication::RunMode::ConsoleApp);
    STAGE("engraving onInit");

    MScore::noGui = true;
    loadInstrumentTemplates(":/engraving/instruments/instruments.xml");
    STAGE("instruments");
}

static ByteArray readAll(const fs::path& p)
{
    std::ifstream in(p, std::ios::binary);
    std::string bytes((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
    return ByteArray(reinterpret_cast<const uint8_t*>(bytes.data()), bytes.size());
}

static void writeAll(const fs::path& p, const ByteArray& data)
{
    std::ofstream out(p, std::ios::binary);
    out.write(reinterpret_cast<const char*>(data.constData()), data.size());
}

#ifndef __EMSCRIPTEN__
static void onCrash(int sig)
{
    void* frames[64];
    int n = backtrace(frames, 64);
    std::fprintf(stderr, "[crash] signal %d\n", sig);
    backtrace_symbols_fd(frames, n, STDERR_FILENO);
    _exit(128 + sig);
}
#endif

int main(int argc, char** argv)
{
#ifndef __EMSCRIPTEN__
    std::signal(SIGSEGV, onCrash);
    std::signal(SIGABRT, onCrash);
#endif
    if (argc < 3) {
        std::fprintf(stderr, "usage: %s <resource-root> <score> [out-dir]\n", argv[0]);
        return 2;
    }
    const fs::path resRoot = argv[1];
    const fs::path input = argv[2];
    const fs::path outDir = argc > 3 ? fs::path(argv[3]) : fs::current_path();

    double t0 = nowMs();
    boot(resRoot);
    double tBoot = nowMs();

    std::string ext = input.extension().string();
    ByteArray inputData = readAll(input);

    auto project = EngravingProject::create(nullptr);
    project->setFileInfoProvider(std::make_shared<LocalFileInfoProvider>(input.string()));
    MasterScore* score = project->masterScore();
    Ret loaded;
    if (ext == ".mscz" || ext == ".mscx") {
        io::Buffer buf(&inputData);
        MscReader::Params params;
        params.device = &buf;
        params.filePath = input.string();
        params.mode = ext == ".mscz" ? MscIoMode::Zip : MscIoMode::XmlFile;
        MscReader reader(params);
        loaded = reader.open();
        if (loaded) {
            loaded = project->loadMscz(reader, nullptr, true);
        }
    } else {
        Err err = mu::iex::musicxml::importMusicXmlfromBuffer(score, String::fromStdString(input.string()), inputData);
        loaded = err == Err::NoError ? make_ok() : make_ret(Ret::Code::UnknownError);
        if (loaded) {
            loaded = project->setupMasterScore(true);
        }
    }
    double tLoad = nowMs();
    STAGE("loaded");
    if (!loaded) {
        std::printf("{\"ok\":false,\"stage\":\"load\",\"error\":\"%s\"}\n", loaded.toString().c_str());
        return 1;
    }

    score->doLayout();
    STAGE("layout");
    double tLayout = nowMs();

    // count what survived: key signatures and parts, to compare with the 4.00 fork
    size_t parts = score->parts().size();
    size_t measures = score->nmeasures();
    size_t pages = score->npages();

    ByteArray mscz;
    {
        io::Buffer buf(&mscz);
        MscWriter::Params params;
        params.device = &buf;
        params.filePath = "out.mscz";
        params.mode = MscIoMode::Zip;
        MscWriter writer(params);
        writer.open();
        project->writeMscz(writer, false);
        writer.close();
    }
    double tSave = nowMs();
    STAGE("saved");

    ByteArray xml;
    {
        io::Buffer buf(&xml);
        buf.open(io::IODevice::WriteOnly);
        mu::iex::musicxml::saveXml(score, &buf);
        buf.close();
    }
    double tXml = nowMs();
    STAGE("xml");

    size_t drawJsonBytes = 0;
    {
        auto provider = std::make_shared<muse::draw::BufferedPaintProvider>();
        muse::draw::Painter painter(provider, "spike");
        rendering::IScoreRenderer::ScorePaintOptions opt;
        opt.fromPage = 0;
        opt.toPage = 0;
        opt.isSetViewport = false;
        auto renderer = muse::modularity::globalIoc()->resolve<rendering::IScoreRenderer>("spike");
        renderer->paintScore(&painter, score, opt);
        painter.endDraw();
        ByteArray json = muse::draw::DrawDataJson::toJson(provider->drawData(), false);
        drawJsonBytes = json.size();
        writeAll(outDir / "page1.drawdata.json", json);
    }
    double tPaint = nowMs();

    writeAll(outDir / "out.mscz", mscz);
    writeAll(outDir / "out.musicxml", xml);

    std::printf("{\"ok\":true,\"input\":\"%s\",\"parts\":%zu,\"measures\":%zu,\"pages\":%zu,"
                "\"msczBytes\":%zu,\"xmlBytes\":%zu,\"page1DrawJsonBytes\":%zu,"
                "\"ms\":{\"boot\":%.1f,\"load\":%.1f,\"layout\":%.1f,\"saveMscz\":%.1f,\"musicxml\":%.1f,\"paintPage1\":%.1f}}\n",
                input.filename().string().c_str(), parts, measures, pages, mscz.size(), xml.size(), drawJsonBytes,
                tBoot - t0, tLoad - tBoot, tLayout - tLoad, tSave - tLayout, tXml - tSave, tPaint - tXml);
    return 0;
}
