#pragma once
// Parts and excerpts: generate part scores, add/remove/hide instruments, list instrument templates, add fallback fonts.
// Ported from the 4.00 bridge (web/main.cpp). Every other export resolves excerptId through getScore, which returns
// the excerpt's own Score for excerptId >= 0.

#include <fstream>

#include "global/serialization/json.h"
#include "draw/internal/ifontsdatabase.h"
#include "draw/internal/fontsengine.h"
#include "engraving/dom/excerpt.h"
#include "engraving/dom/instrtemplate.h"
#include "engraving/dom/masterscore.h"
#include "engraving/dom/part.h"

// Family and style of a TrueType/OpenType font from its own tables (name ID 1, OS/2 fsSelection), so a font file can
// be registered without knowing its family. 4.00 left this to Qt (QFontDatabase::addApplicationFont).
struct SfntFamily {
    std::string family;
    bool bold = false;
    bool italic = false;
};

static uint16_t sfntU16(const std::string& d, size_t at) { return at + 2 <= d.size() ? uint16_t((uint8_t(d[at]) << 8) | uint8_t(d[at + 1])) : 0; }
static uint32_t sfntU32(const std::string& d, size_t at) { return (uint32_t(sfntU16(d, at)) << 16) | sfntU16(d, at + 2); }

static bool readSfntFamily(const std::string& data, SfntFamily& out)
{
    const uint32_t version = sfntU32(data, 0);
    if (version != 0x00010000 && version != 0x4F54544F /* OTTO */ && version != 0x74727565 /* true */) return false;
    size_t nameTable = 0, os2Table = 0;
    for (uint16_t i = 0, n = sfntU16(data, 4); i < n; ++i) {
        const size_t record = 12 + 16 * size_t(i);
        const std::string tag = data.substr(record, 4);
        if (tag == "name") nameTable = sfntU32(data, record + 8);
        if (tag == "OS/2") os2Table = sfntU32(data, record + 8);
    }
    if (!nameTable || nameTable >= data.size()) return false;
    const size_t strings = nameTable + sfntU16(data, nameTable + 4);
    std::string fallback;
    for (uint16_t i = 0, n = sfntU16(data, nameTable + 2); i < n; ++i) {
        const size_t record = nameTable + 6 + 12 * size_t(i);
        const uint16_t platform = sfntU16(data, record), nameId = sfntU16(data, record + 6);
        const uint16_t length = sfntU16(data, record + 8), offset = sfntU16(data, record + 10);
        if (nameId != 1 || strings + offset + length > data.size()) continue;
        const std::string raw = data.substr(strings + offset, length);
        if (platform == 0 || platform == 3) {          // UTF-16BE
            out.family = String::fromUtf16BE(ByteArray(reinterpret_cast<const uint8_t*>(raw.data()), raw.size())).toStdString();
            break;
        }
        if (platform == 1 && fallback.empty()) fallback = raw;   // Mac Roman, ASCII for practical family names
    }
    if (out.family.empty()) out.family = fallback;
    if (os2Table && os2Table + 64 <= data.size()) {
        const uint16_t fsSelection = sfntU16(data, os2Table + 62);
        out.italic = fsSelection & 0x0001;
        out.bold = fsSelection & 0x0020;
    }
    return !out.family.empty();
}

extern "C" {

// Generate excerpts from the parts if the score has none (4.00 semantics). Uses the same fake-undo initialisation
// the 4.00 bridge did by hand: MasterScore::initAndAddExcerpt(excerpt, true).
EMSCRIPTEN_KEEPALIVE void generateExcerpts(uintptr_t score_ptr)
{
    auto* score = getScore(score_ptr);
    if (!score) return;
    MasterScore* master = score->masterScore();
    if (!master->excerpts().empty()) return;
    const auto excerpts = engraving::Excerpt::createExcerptsFromParts(master->parts(), master);
    for (auto* excerpt : excerpts) {
        master->initAndAddExcerpt(excerpt, true);
    }
    master->setExcerptsChanged(false);
    LOGI() << "Generated excerpts: " << excerpts.size();
}

EMSCRIPTEN_KEEPALIVE bool appendPart(uintptr_t score_ptr, const char* instrumentId, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score || !instrumentId) return false;
    const engraving::InstrumentTemplate* templ = engraving::searchTemplate(String::fromUtf8(instrumentId));
    if (!templ) {
        LOGW() << "appendPart: instrument id not found " << instrumentId;
        return false;
    }
    score->startCmd(TranslatableString::untranslatable("appendPart"));
    score->appendPart(templ);
    score->endCmd();
    layoutLinked(score);
    return true;
}

EMSCRIPTEN_KEEPALIVE bool appendPartByMusicXmlId(uintptr_t score_ptr, const char* instrumentMusicXmlId, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score || !instrumentMusicXmlId) return false;
    const engraving::InstrumentTemplate* templ = engraving::searchTemplateForMusicXmlId(String::fromUtf8(instrumentMusicXmlId));
    if (!templ) {
        LOGW() << "appendPartByMusicXmlId: instrument id not found " << instrumentMusicXmlId;
        return false;
    }
    score->startCmd(TranslatableString::untranslatable("appendPartByMusicXmlId"));
    score->appendPart(templ);
    score->endCmd();
    layoutLinked(score);
    return true;
}

EMSCRIPTEN_KEEPALIVE bool removePart(uintptr_t score_ptr, int partIndex, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    engraving::Part* part = partFromIndex(score, partIndex);
    if (!part) {
        LOGW() << "removePart: invalid part index " << partIndex;
        return false;
    }
    score->startCmd(TranslatableString::untranslatable("removePart"));
    score->cmdRemovePart(part);
    score->endCmd();
    layoutLinked(score);
    return true;
}

EMSCRIPTEN_KEEPALIVE bool setPartVisible(uintptr_t score_ptr, int partIndex, bool visible, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return false;
    engraving::Part* part = partFromIndex(score, partIndex);
    if (!part) {
        LOGW() << "setPartVisible: invalid part index " << partIndex;
        return false;
    }
    score->startCmd(TranslatableString::untranslatable("setPartVisible"));
    part->undoChangeProperty(engraving::Pid::VISIBLE, visible);
    score->endCmd();
    layoutLinked(score);
    return true;
}

EMSCRIPTEN_KEEPALIVE const uint8_t* listInstrumentTemplates(uintptr_t /* score_ptr: templates are global; kept for the 4.00 ABI */)
{
    JsonArray groupsJson;
    for (const engraving::InstrumentGroup* group : engraving::instrumentGroups) {
        JsonObject groupJson;
        groupJson.set("id", group->id);
        groupJson.set("name", group->name);
        JsonArray instrumentsJson;
        for (const engraving::InstrumentTemplate* templ : group->instrumentTemplates) {
            // 4.7 leaves the first long name empty for some templates (recorder, ocarina, ...): fall back to the track name
            String name = templ->longNames.empty() ? String() : templ->longNames.front().toPlainText();
            if (name.empty()) name = templ->trackName;
            if (name.empty()) name = templ->id;
            JsonObject instrumentJson;
            instrumentJson.set("id", templ->id);
            instrumentJson.set("name", name);
            instrumentJson.set("groupId", templ->groupId);
            instrumentJson.set("groupName", group->name);
            instrumentJson.set("familyId", templ->family ? templ->family->id : String());
            instrumentJson.set("familyName", templ->family ? templ->family->name : String());
            instrumentJson.set("staffCount", static_cast<int>(templ->staffCount));
            instrumentJson.set("isExtended", templ->extended);
            instrumentsJson.append(instrumentJson);
        }
        groupJson.set("instruments", instrumentsJson);
        groupsJson.append(groupJson);
    }
    return response(JsonDocument(groupsJson).toJson(JsonDocument::Format::Compact));
}

// Register a font file as a text fallback (CJK fonts on demand, as in 4.00). The family comes from the font file;
// IFontsDatabase::addAdditionalFonts appends it to the text substitution list the font engine uses for missing glyphs.
EMSCRIPTEN_KEEPALIVE bool addFont(const char* fontPath)
{
    if (!fontPath) return false;
    const std::string path(fontPath);
    std::ifstream in(path, std::ios::binary);
    if (!in) {
        LOGE() << "addFont: cannot read " << path;
        return false;
    }
    const std::string data((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
    SfntFamily info;
    if (!readSfntFamily(data, info)) {
        LOGE() << "addFont: not a TrueType/OpenType font " << path;
        return false;
    }
    const auto slash = path.find_last_of('/');
    const std::string dir = slash == std::string::npos ? "." : path.substr(0, slash);
    const std::string file = slash == std::string::npos ? path : path.substr(slash + 1);
    JsonObject entry;
    entry.set("file", file);
    entry.set("family", info.family);
    entry.set("bold", info.bold);
    entry.set("italic", info.italic);
    JsonArray list;
    list.append(entry);
    std::ofstream manifest(dir + "/fontslist.json", std::ios::binary | std::ios::trunc);
    const ByteArray json = JsonDocument(list).toJson(JsonDocument::Format::Compact);
    manifest.write(json.constChar(), json.size());
    manifest.close();
    if (!manifest) return false;
    auto ioc = muse::modularity::globalIoc();
    ioc->resolve<muse::draw::IFontsDatabase>("spike")->addAdditionalFonts(dir);
    // 4.7's font engine attaches fallback faces when it first resolves a font; forget resolved faces so text that
    // was already measured picks up the new fallback (Qt applied application fonts immediately in 4.00).
    if (auto engine = std::dynamic_pointer_cast<muse::draw::FontsEngine>(ioc->resolve<muse::draw::IFontsEngine>("spike"))) {
        engine->resetRequiredFaces();
    }
    for (auto& [id, project] : projects) {
        layoutLinked(project->masterScore());
    }
    LOGI() << "addFont: " << info.family << " from " << path;
    return true;
}

} // extern "C"
