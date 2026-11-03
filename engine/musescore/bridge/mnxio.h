// SPDX-License-Identifier: GPL-3.0-only
#pragma once
// MNX interchange (roadmap E29): upstream's MnxImporter and MnxExporter (src/importexport/mnx) on mnxdom, without
// the module's IoC registration, reader and writer. mnxio.cpp is built into ots_mnx with exceptions on (mnxdom,
// nlohmann::json and the importer throw on bad input); these functions catch them, so the bridge, built without
// exceptions, only sees a result.
#include "global/types/bytearray.h"
#include "global/types/string.h"
#include <string>

namespace mu::engraving {
class MasterScore;
class Score;
}

namespace otsmnx {
// MNX JSON into the master score, as MuseScore's File > Open does: schema-validated first (MuseScore's default,
// exact validation), refused when there are no measures. `error` says why it was refused.
bool importMnx(mu::engraving::MasterScore* score, const muse::ByteArray& json, muse::String& error);
// The score as MNX JSON with MuseScore's export defaults: beams exported, rest positions not, 4-space indent.
bool exportMnx(mu::engraving::Score* score, std::string& json, muse::String& error);
}
