// SPDX-License-Identifier: GPL-3.0-only
#pragma once
// MS47 build spike harness: boot engraving without Qt, load a score from memory,
// lay it out, save MSCZ, export MusicXML, paint page 1 into a draw-command buffer.
//
// usage: ms47_spike <resource-root> <score.mscz|score.mscx|score.musicxml> [out-dir]

#include <chrono>
#include <cstdio>
#include <filesystem>
#include <set>
#include <array>
#include <cmath>
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
#include "imagetools.h"
namespace fs = std::filesystem;

#define STAGE(x) (std::fprintf(stderr, "[stage] %s\n", x), std::fflush(stderr))

// Font files the engine looked for and did not find (paths relative to the resource root). Browser builds preload a
// minimal resource set and fetch the rest on demand: see resourcetools.h.
static std::set<std::string>& missingResourcePaths()
{
    static std::set<std::string> paths;
    return paths;
}

// ---------------------------------------------------------------------------
// Filesystem: real files, with ":/x" (Qt resource paths) served from <resroot>/x
// ---------------------------------------------------------------------------
class SpikeFileSystem : public io::IFileSystem
{
    void noteMissing(const io::path_t& p) const
    {
        const std::string& s = p.toStdString();
        const size_t skip = s.rfind("://", 0) == 0 ? 3 : s.rfind(":/", 0) == 0 ? 2 : 0;
        if (skip && s.compare(skip, 6, "fonts/") == 0) missingResourcePaths().insert(s.substr(skip));
    }

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
        if (fs::exists(map(path), ec)) return make_ok();
        noteMissing(path);
        return make_ret(Ret::Code::UnknownError);
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
            noteMissing(filePath);
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
    // Desktop EngravingConfiguration defaults (UI colours: drawn only when not printing, e.g. highlighted SVG)
    Color scoreInversionColor() const override { return Color(220, 220, 220); }
    Color lassoColor() const override { return Color("#00323200"); }
    Color warningColor() const override { return Color("#808000"); }
    Color warningSelectedColor() const override { return Color("#565600"); }
    Color criticalColor() const override { return Color::RED; }
    Color criticalBackgroundColor() const override { return Color::RED; }
    Color criticalSelectedColor() const override { return Color("#8B0000"); }
    Color thumbnailBackgroundColor() const override { return Color::WHITE; }
    Color noteBackgroundColor() const override { return Color::WHITE; }
    Color fontPrimaryColor() const override { return Color::BLACK; }
    Color voiceColor(voice_idx_t voice) const override { return voiceColors()[std::min<voice_idx_t>(voice, VOICES)]; }

    double guiScaling() const override { return 1.0; }

    Color selectionColor(voice_idx_t voice, bool itemVisible, bool unlinked) const override
    {
        Color color = unlinked ? unlinkedColor() : voiceColor(voice);
        if (!itemVisible) color.applyTint(.6f);
        return color;
    }
    void setSelectionColor(voice_idx_t, Color) override {}
    async::Channel<voice_idx_t, Color> selectionColorChanged() const override { return {}; }

    bool dynamicsApplyToAllVoices() const override { return true; }
    void setDynamicsApplyToAllVoices(bool) override {}
    async::Channel<bool> dynamicsApplyToAllVoicesChanged() const override { return {}; }

    bool autoUpdateFretboardDiagrams() const override { return true; }
    void setAutoUpdateFretboardDiagrams(bool) override {}
    async::Channel<bool> autoUpdateFretboardDiagramsChanged() const override { return {}; }

    Color formattingColor() const override { return Color("#C31989"); }
    async::Channel<Color> formattingColorChanged() const override { return {}; }
    Color invisibleColor() const override { return Color("#808080"); }
    async::Channel<Color> invisibleColorChanged() const override { return {}; }
    Color unlinkedColor() const override { return Color("#FF9300"); }
    async::Channel<Color> unlinkedColorChanged() const override { return {}; }
    Color frameColor() const override { return Color("#A0A0A4"); }
    async::Channel<Color> frameColorChanged() const override { return {}; }
    Color scoreGreyColor() const override { return Color("#A0A0A4"); }
    Color highlightSelectionColor(voice_idx_t voice) const override { return lighter(selectionColor(voice, true, false), 1.35); }

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
    static const std::array<Color, VOICES + 1>& voiceColors()
    {
        static const std::array<Color, VOICES + 1> colors { Color("#0065BF"), Color("#007F00"), Color("#C53F00"), Color("#C31989"),
                                                            Color("#6038FC") };   // last: "all voices"
        return colors;
    }
    // QColor::lighter: scale the HSV value; what overflows 255 comes off the saturation
    static Color lighter(const Color& c, double factor)
    {
        const double r = c.red() / 255.0, g = c.green() / 255.0, b = c.blue() / 255.0;
        const double maxc = std::max({ r, g, b }), minc = std::min({ r, g, b }), delta = maxc - minc;
        double h = 0;
        if (delta > 0) {
            h = maxc == r ? std::fmod((g - b) / delta, 6.0) : maxc == g ? (b - r) / delta + 2 : (r - g) / delta + 4;
            h *= 60;
            if (h < 0) h += 360;
        }
        double sat = maxc > 0 ? delta / maxc : 0, v = maxc * factor;
        if (v > 1) { sat = std::max(0.0, sat - (v - 1)); v = 1; }
        const double cc = v * sat, x = cc * (1 - std::abs(std::fmod(h / 60, 2.0) - 1)), m = v - cc;
        double rr = 0, gg = 0, bb = 0;
        if (h < 60) { rr = cc; gg = x; } else if (h < 120) { rr = x; gg = cc; } else if (h < 180) { gg = cc; bb = x; }
        else if (h < 240) { gg = x; bb = cc; } else if (h < 300) { rr = x; bb = cc; } else { rr = cc; bb = x; }
        return Color(int(std::lround((rr + m) * 255)), int(std::lround((gg + m) * 255)), int(std::lround((bb + m) * 255)), c.alpha());
    }

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
    bool inferTextType() const override { return false; }   // desktop default; see MUSE_SOUNDS_INTEGRATION_ROADMAP.md on why not on
    void setInferTextType(bool) override {}
    async::Channel<bool> inferTextTypeChanged() const override { return {}; }
    void setInferTextTypeOverride(std::optional<bool>) override {}
};

// ---------------------------------------------------------------------------
#include "fontmetrics.h"

// Boot: the module wiring EngravingModule::onInit does when ENGRAVING_NO_INTERNAL is off
// ---------------------------------------------------------------------------
static muse::draw::DrawModule s_drawModule;
static EngravingModule s_engravingModule;

// Upstream's internal music fonts (EngravingModule::onInit) and their text companions
struct MusicFontFiles {
    const char* name;
    const char* family;
    const char* path;
    const char* textFamily;
    const char* textPath;
};

static const std::vector<MusicFontFiles>& musicFontFiles()
{
    static const std::vector<MusicFontFiles> files {
        { "Bravura", "Bravura", ":/fonts/bravura/Bravura.otf", "Bravura Text", ":/fonts/bravura/BravuraText.otf" },
        { "Leland", "Leland", ":/fonts/leland/Leland.otf", "Leland Text", ":/fonts/leland/LelandText.otf" },
        { "Emmentaler", "MScore", ":/fonts/mscore/MScore.otf", "MScore Text", ":/fonts/mscore/MScoreText.otf" },
        { "Gonville", "Gootville", ":/fonts/gootville/Gootville.otf", "Gootville Text", ":/fonts/gootville/GootvilleText.otf" },
        { "MuseJazz", "MuseJazz", ":/fonts/musejazz/MuseJazz.otf", "MuseJazz Text", ":/fonts/musejazz/MuseJazzText.otf" },
        { "Petaluma", "Petaluma", ":/fonts/petaluma/Petaluma.otf", "Petaluma Text", ":/fonts/petaluma/PetalumaText.otf" },
        { "Finale Maestro", "Finale Maestro", ":/fonts/finalemaestro/FinaleMaestro.otf", "Finale Maestro Text",
          ":/fonts/finalemaestro/FinaleMaestroText.otf" },
        { "Finale Broadway", "Finale Broadway", ":/fonts/finalebroadway/FinaleBroadway.otf", "Finale Broadway Text",
          ":/fonts/finalebroadway/FinaleBroadwayText.otf" },
    };
    return files;
}

// Upstream loads every music font at startup so painters can draw them by family name. Load those whose files are
// present (checked quietly, so absent ones are not reported as missing); fontByName loads the rest once fetched.
static void loadPresentMusicFonts(const std::shared_ptr<EngravingFontsProvider>& engravingFonts)
{
    auto fileSystem = muse::modularity::globalIoc()->resolve<io::IFileSystem>("spike");
    auto* spikeFs = dynamic_cast<SpikeFileSystem*>(fileSystem.get());
    for (const MusicFontFiles& f : musicFontFiles()) {
        std::error_code ec;
        if (spikeFs && fs::exists(spikeFs->map(f.path), ec)) engravingFonts->fontByName(f.name);
    }
}

static fs::path& resourceRootPath()
{
    static fs::path root;
    return root;
}

static void boot(const fs::path& resRoot)
{
    resourceRootPath() = resRoot;
    using namespace muse::draw;
    auto ioc = muse::modularity::globalIoc();

    ioc->registerExport<io::IFileSystem>("spike", new SpikeFileSystem(resRoot));
    ioc->registerExport<ICryptographicHash>("spike", new SpikeCryptographicHash());
    ioc->registerExport<IImageProvider>("spike", new SpikeImageProvider());
    ioc->registerExport<IApplication>("spike", new SpikeApplication());
    ioc->registerExport<mu::iex::musicxml::IMusicXmlConfiguration>("spike", new SpikeMusicXmlConfiguration());
    STAGE("fs registered");

    s_drawModule.registerExports();
    auto genericFontProvider = ioc->resolve<IFontProvider>("spike");
    ioc->unregister<IFontProvider>("draw");
    ioc->registerExport<IFontProvider>("spike", new EngravingFontMetrics(genericFontProvider));
    s_engravingModule.registerExports();
    STAGE("modules exports");

    auto config = std::make_shared<SpikeEngravingConfiguration>();
    auto engravingFonts = std::make_shared<EngravingFontsProvider>(nullptr);
    ioc->registerExport<IEngravingConfiguration>("spike", config);
    ioc->registerExport<IEngravingFontsProvider>("spike", engravingFonts);

    s_drawModule.onInit(muse::IApplication::RunMode::ConsoleApp);
    STAGE("draw onInit");

    std::shared_ptr<IFontsDatabase> fdb = ioc->resolve<IFontsDatabase>("spike");
    // As upstream EngravingModule::onInit. Files outside the preloaded set may be absent until fetched: the font
    // database checks existence on every lookup, and engraving fonts fall back to Bravura until they load.
    fdb->addFont(FontDataKey(u"Edwin", false, false), ":/fonts/edwin/Edwin-Roman.otf");
    fdb->addFont(FontDataKey(u"Edwin", false, true), ":/fonts/edwin/Edwin-Italic.otf");
    fdb->addFont(FontDataKey(u"Edwin", true, false), ":/fonts/edwin/Edwin-Bold.otf");
    fdb->addFont(FontDataKey(u"Edwin", true, true), ":/fonts/edwin/Edwin-BdIta.otf");

    for (const MusicFontFiles& f : musicFontFiles()) {
        fdb->addFont(FontDataKey(String::fromUtf8(f.family)), f.path);
        engravingFonts->addInternalFont(f.name, f.family, f.path);
        fdb->addFont(FontDataKey(String::fromUtf8(f.textFamily)), f.textPath);
    }

    fdb->addFont(FontDataKey(u"FreeSerif"), ":/fonts/FreeSerif.ttf");
    fdb->addFont(FontDataKey(u"FreeSerif", true, false), ":/fonts/FreeSerifBold.ttf");
    fdb->addFont(FontDataKey(u"FreeSerif", false, true), ":/fonts/FreeSerifItalic.ttf");
    fdb->addFont(FontDataKey(u"FreeSerif", true, true), ":/fonts/FreeSerifBoldItalic.ttf");
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

    fdb->insertSubstitution(u"Leland Text", u"Bravura Text");
    fdb->insertSubstitution(u"Bravura Text", u"Leland Text");
    fdb->insertSubstitution(u"MScore Text", u"Leland Text");
    fdb->insertSubstitution(u"Gootville Text", u"Leland Text");
    fdb->insertSubstitution(u"MuseJazz Text", u"Leland Text");
    fdb->insertSubstitution(u"Petaluma Text", u"MuseJazz Text");
    fdb->insertSubstitution(u"Finale Maestro Text", u"Leland Text");
    fdb->insertSubstitution(u"Finale Broadway Text", u"MuseJazz Text");
    fdb->insertSubstitution(u"ScoreFont", u"Leland Text");
    STAGE("fonts added");

    Smufl::init();
    STAGE("smufl init");
    loadPresentMusicFonts(engravingFonts);
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

