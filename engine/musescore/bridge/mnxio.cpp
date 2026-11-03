// SPDX-License-Identifier: GPL-3.0-only
// MNX interchange (roadmap E29): see mnxio.h. The bodies follow upstream's NotationMnxReader::importJson and
// NotationMnxWriter::write.
#include "mnxio.h"

#include "engraving/dom/masterscore.h"
#include "export/mnxexporter.h"
#include "import/mnximporter.h"
#include "mnxdom.h"

#include <exception>

namespace otsmnx {
using mu::iex::mnxio::MnxExporter;
using mu::iex::mnxio::MnxImporter;

bool importMnx(mu::engraving::MasterScore* score, const muse::ByteArray& json, muse::String& error)
{
    try {
        auto doc = mnx::Document::create(reinterpret_cast<const char*>(json.constData()), json.size());
        if (!mnx::validation::schemaValidate(doc)) {
            error = u"File is not a valid MNX document.";
            return false;
        }
        if (doc.global().measures().empty()) {
            error = u"File contains no measures.";
            return false;
        }
        MnxImporter importer(score, std::move(doc));
        importer.importMnx();
        return true;
    } catch (const std::exception& ex) {
        error = muse::String::fromUtf8(ex.what());
        return false;
    }
}

bool exportMnx(mu::engraving::Score* score, std::string& json, muse::String& error)
{
    try {
        MnxExporter exporter(score, /*exportBeams*/ true, /*exportRestPositions*/ false);
        muse::Ret ret = exporter.exportMnx();
        if (!ret) {
            error = muse::String::fromStdString(ret.text());
            return false;
        }
        json = exporter.mnxDocument().root()->dump(4);
        return true;
    } catch (const std::exception& ex) {
        error = muse::String::fromUtf8(ex.what());
        return false;
    }
}
} // namespace otsmnx
