// SPDX-License-Identifier: GPL-3.0-only
#pragma once
// MEI interchange (roadmap E25): upstream's MeiImporter and MeiExporter (src/importexport/mei), without the module's
// IoC registration and file reader. Their one injected dependency, IMeiConfiguration, is registered here with
// MuseScore's defaults (import and export the layout, generated ids); the reader's warning dialog becomes the
// warnings returned with the load.
#include "global/modularity/ioc.h"
#include "imeiconfiguration.h"
#include "internal/meiconverter.h"
#include "internal/meiexporter.h"
#include "internal/meiimporter.h"
#include <cstdio>
#include <fstream>

namespace otsmei {
class Configuration : public mu::iex::mei::IMeiConfiguration
{
public:
    bool meiImportLayout() const override { return m_importLayout; }
    void setMeiImportLayout(bool value) override { m_importLayout = value; }
    muse::async::Channel<bool> meiImportLayoutChanged() const override { return m_importLayoutChanged; }
    bool meiExportLayout() const override { return m_exportLayout; }
    void setMeiExportLayout(bool value) override { m_exportLayout = value; }
    bool meiUseMuseScoreIds() const override { return m_useMuseScoreIds; }
    void setMeiUseMuseScoreIds(bool value) override { m_useMuseScoreIds = value; }

private:
    bool m_importLayout = true;
    bool m_exportLayout = true;
    bool m_useMuseScoreIds = false;
    muse::async::Channel<bool> m_importLayoutChanged;
};

static void ensureConfiguration()
{
    static bool registered = false;
    if (registered) return;
    registered = true;
    muse::modularity::globalIoc()->registerExport<mu::iex::mei::IMeiConfiguration>("iex_mei", std::make_shared<Configuration>());
}

// Imports MEI bytes into the project's master score. MeiImporter reads a file, so the bytes go through one in the
// in-memory file system. Warnings (MuseScore's "problems occurred" list) are returned in `warnings`.
static bool importMei(engraving::MasterScore* score, const ByteArray& bytes, StringList& warnings)
{
    ensureConfiguration();
    const char* path = "/tmp/ots-import.mei";
    {
        std::ofstream file(path, std::ios::binary | std::ios::trunc);
        if (!file) return false;
        file.write(reinterpret_cast<const char*>(bytes.constData()), static_cast<std::streamsize>(bytes.size()));
    }
    mu::iex::mei::MeiImporter importer(score);
    const bool ok = importer.read(muse::io::path_t(path));
    std::remove(path);
    warnings = mu::iex::mei::Convert::logs;
    return ok;
}
} // namespace otsmei
