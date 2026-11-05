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
#include "engraving/editing/editstaff.h"
#include "engraving/editing/editpart.h"
#include "engraving/editing/editexcerpt.h"
#include "engraving/dom/utils.h"
#include "engraving/dom/stafftype.h"
#include "engraving/dom/staff.h"
#include "engraving/dom/instrchange.h"

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

// The score's parts (excerpts), in excerptId order (roadmap E18): [{"name", "instruments": [part names]}]. An empty
// array when the score has none (generateExcerpts makes one per instrument).
EMSCRIPTEN_KEEPALIVE const uint8_t* listExcerpts(uintptr_t score_ptr)
{
    auto* score = getScore(score_ptr);
    if (!score) return textResponse("Invalid score", 1);
    JsonArray list;
    for (const auto* excerpt : score->masterScore()->excerpts()) {
        JsonObject item;
        item.set("name", excerpt->name().toStdString());
        JsonArray instruments;
        JsonArray partIndices;
        const auto& scoreParts = score->masterScore()->parts();
        for (const auto* part : excerpt->parts()) {
            instruments.append(part->partName().toStdString());
            const auto at = std::find(scoreParts.begin(), scoreParts.end(), part);
            partIndices.append(at == scoreParts.end() ? -1 : int(at - scoreParts.begin()));
        }
        item.set("instruments", instruments);
        // Which of the full score's instruments (indices into its parts) the part has
        item.set("partIndices", partIndices);
        list.append(item);
    }
    return response(JsonDocument(list).toJson(JsonDocument::Format::Compact));
}

// Managing parts (roadmap E18, slice 4), as MuseScore's Parts dialog does it (PartListModel, MasterNotation::
// setExcerpts): each change is one undoable command on the master score; names are made unique the way MuseScore
// makes them (formatUniqueExcerptName).
static StringList excerptLowerNames(MasterScore* master, const engraving::Excerpt* except = nullptr)
{
    StringList names;
    for (const auto* excerpt : master->excerpts()) {
        if (excerpt != except) names.push_back(excerpt->name().toLower());
    }
    return names;
}

static engraving::Excerpt* excerptAt(MasterScore* master, int index)
{
    return index >= 0 && index < int(master->excerpts().size()) ? master->excerpts()[index] : nullptr;
}

static void finishExcerptChange(MasterScore* master)
{
    master->setExcerptsChanged(false);
    master->endCmd();
    layoutAllLinked(master);
}

// A new part with these of the full score's instruments ({"name", "parts": [indices into its parts]}). Returns the new
// part's index, or -1 (no instruments, or an index off the score).
EMSCRIPTEN_KEEPALIVE int createExcerpt(uintptr_t score_ptr, const char* json)
{
    auto* score = getScore(score_ptr);
    if (!score || !json) return -1;
    MasterScore* master = score->masterScore();
    const JsonObject request = JsonDocument::fromJson(ByteArray(json)).rootObject();
    const JsonArray indices = request.value("parts").toArray();
    std::vector<Part*> parts;
    for (size_t i = 0; i < indices.size(); ++i) {
        const int index = indices.at(i).toInt();
        if (index < 0 || index >= int(master->parts().size())) return -1;
        Part* part = master->parts()[index];
        if (std::find(parts.begin(), parts.end(), part) == parts.end()) parts.push_back(part);
    }
    if (parts.empty()) return -1;
    // In the score's order, as MuseScore's parts list them
    std::sort(parts.begin(), parts.end(), [master](const Part* a, const Part* b) {
        return muse::indexOf(master->parts(), a) < muse::indexOf(master->parts(), b);
    });
    String name = request.value("name").toString().trimmed();
    if (name.isEmpty()) name = u"Part";
    auto* excerpt = new engraving::Excerpt(master);
    excerpt->setParts(parts);
    excerpt->setName(engraving::formatUniqueExcerptName(name, excerptLowerNames(master)));
    master->startCmd(TranslatableString::untranslatable("Add part"));
    master->initAndAddExcerpt(excerpt, false);
    finishExcerptChange(master);
    return int(muse::indexOf(master->excerpts(), excerpt));
}

// Renames a part. False for an empty name or one another part has (MuseScore's Parts dialog refuses both).
EMSCRIPTEN_KEEPALIVE bool renameExcerpt(uintptr_t score_ptr, int index, const char* name)
{
    auto* score = getScore(score_ptr);
    if (!score || !name) return false;
    MasterScore* master = score->masterScore();
    auto* excerpt = excerptAt(master, index);
    const String title = String::fromUtf8(name).trimmed();
    if (!excerpt || title.isEmpty() || excerptLowerNames(master, excerpt).contains(title.toLower())) return false;
    if (title == excerpt->name()) return true;
    master->startCmd(TranslatableString::untranslatable("Rename part"));
    master->undo(new engraving::ChangeExcerptTitle(excerpt, title));
    master->endCmd();
    return true;
}

// Deletes a part (its score only: the music stays in the full score).
EMSCRIPTEN_KEEPALIVE bool removeExcerpt(uintptr_t score_ptr, int index)
{
    auto* score = getScore(score_ptr);
    if (!score) return false;
    MasterScore* master = score->masterScore();
    auto* excerpt = excerptAt(master, index);
    if (!excerpt) return false;
    master->startCmd(TranslatableString::untranslatable("Remove part"));
    master->deleteExcerpt(excerpt);
    finishExcerptChange(master);
    return true;
}

// A copy of a part, with its layout and part-only changes, named "<name> (copy)", after it. Returns its index, or -1.
EMSCRIPTEN_KEEPALIVE int duplicateExcerpt(uintptr_t score_ptr, int index)
{
    auto* score = getScore(score_ptr);
    if (!score) return -1;
    MasterScore* master = score->masterScore();
    auto* source = excerptAt(master, index);
    if (!source) return -1;
    auto* copy = new engraving::Excerpt(*source);
    copy->setName(engraving::formatUniqueExcerptName(source->name() + u" (copy)", excerptLowerNames(master)));
    master->startCmd(TranslatableString::untranslatable("Duplicate part"));
    master->initAndAddExcerpt(copy, false);
    auto& excerpts = master->excerpts();
    muse::moveItem(excerpts, muse::indexOf(excerpts, copy), size_t(index + 1));
    finishExcerptChange(master);
    return int(muse::indexOf(master->excerpts(), copy));
}

// Makes a part again from the full score, dropping its own layout and part-only changes (MasterNotation::resetExcerpt),
// in its place in the list.
EMSCRIPTEN_KEEPALIVE bool resetExcerpt(uintptr_t score_ptr, int index)
{
    auto* score = getScore(score_ptr);
    if (!score) return false;
    MasterScore* master = score->masterScore();
    auto* old = excerptAt(master, index);
    if (!old) return false;
    master->startCmd(TranslatableString::untranslatable("Reset part"));
    master->deleteExcerpt(old);
    auto* fresh = new engraving::Excerpt(*old, false);
    master->initAndAddExcerpt(fresh, false);
    auto& excerpts = master->excerpts();
    muse::moveItem(excerpts, muse::indexOf(excerpts, fresh), size_t(index));
    finishExcerptChange(master);
    return true;
}

// Parts put back as part of loading the score, not as edits (roadmap E18, slice 5: an applied MusicXML edit reloads
// the score, and MusicXML has no parts). `json` is [{"name", "parts": [indices into the score's parts]}]; a part with no
// instrument on this score is skipped. No undo step, as generateExcerpts. Returns how many were added.
EMSCRIPTEN_KEEPALIVE int restoreExcerpts(uintptr_t score_ptr, const char* json)
{
    auto* score = getScore(score_ptr);
    if (!score || !json) return 0;
    MasterScore* master = score->masterScore();
    const JsonDocument doc = JsonDocument::fromJson(ByteArray(json));
    if (!doc.isArray()) return 0;
    const JsonArray list = doc.rootArray();
    int added = 0;
    for (size_t i = 0; i < list.size(); ++i) {
        const JsonObject item = list.at(i).toObject();
        const JsonArray indices = item.value("parts").toArray();
        std::vector<Part*> parts;
        for (size_t k = 0; k < indices.size(); ++k) {
            const int index = indices.at(k).toInt();
            if (index < 0 || index >= int(master->parts().size())) continue;
            Part* part = master->parts()[index];
            if (std::find(parts.begin(), parts.end(), part) == parts.end()) parts.push_back(part);
        }
        if (parts.empty()) continue;
        std::sort(parts.begin(), parts.end(), [master](const Part* a, const Part* b) {
            return muse::indexOf(master->parts(), a) < muse::indexOf(master->parts(), b);
        });
        String name = item.value("name").toString().trimmed();
        if (name.isEmpty()) name = u"Part";
        auto* excerpt = new engraving::Excerpt(master);
        excerpt->setParts(parts);
        excerpt->setName(engraving::formatUniqueExcerptName(name, excerptLowerNames(master)));
        master->initAndAddExcerpt(excerpt, true);
        ++added;
    }
    if (added) {
        master->setExcerptsChanged(false);
        layoutAllLinked(master);
    }
    return added;
}

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
    layoutAllLinked(master);   // new part scores have never been laid out
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
        layoutAllLinked(project->masterScore());
    }
    LOGI() << "addFont: " << info.family << " from " << path;
    return true;
}

// MuseScore's Select instrument… on an instrument change (NotationInteraction::selectInstrument): the selected
// instrument change takes the instrument template's instrument, with its clefs, key and transposition.
EMSCRIPTEN_KEEPALIVE bool changeInstrumentAt(uintptr_t score_ptr, const char* instrumentId, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score || !instrumentId) return false;
    // The single selection, else the one instrument change in a list or range (as Realize takes chord symbols).
    engraving::EngravingItem* element = score->selection().element();
    if (!element || !element->isInstrumentChange()) {
        element = nullptr;
        for (auto* e : score->selection().elements()) {
            if (e && e->isInstrumentChange()) { element = e; break; }
        }
    }
    if (!element) return false;
    const engraving::InstrumentTemplate* templ = engraving::searchTemplate(String::fromUtf8(instrumentId));
    if (!templ) return false;
    engraving::Instrument instrument = engraving::Instrument::fromTemplate(templ);
    auto* change = engraving::toInstrumentChange(element);
    score->startCmd(TranslatableString::untranslatable("Change instrument"));
    change->setInit(true);
    change->setupInstrument(&instrument);
    score->endCmd();
    layoutLinked(score);
    return true;
}

// MuseScore's Staff/Part Properties (EditStaff), for staff `staffIdx`: its part's names and the staff's settings.
// {partName, longName, shortName, visible, small, lines, invisibleLines, cutaway, hideWhenEmpty (0 auto, 1 always,
// 2 never)}, or {} for a staff that does not exist.
EMSCRIPTEN_KEEPALIVE const uint8_t* getStaffProperties(uintptr_t score_ptr, int staffIdx, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return textResponse("Invalid score", 1);
    JsonObject result;
    if (staffIdx >= 0 && static_cast<size_t>(staffIdx) < score->nstaves()) {
        engraving::Staff* staff = score->staff(staffIdx);
        engraving::Part* part = staff->part();
        const engraving::StaffType* type = staff->staffType(Fraction(0, 1));
        const auto& longs = part->longNames();
        const auto& shorts = part->shortNames();
        result.set("partName", part->partName());
        result.set("longName", longs.empty() ? String() : longs.front().toPlainText());
        result.set("shortName", shorts.empty() ? String() : shorts.front().toPlainText());
        result.set("visible", staff->visible());
        result.set("small", type->isSmall());
        result.set("lines", type->lines());
        result.set("invisibleLines", type->invisible());
        result.set("cutaway", staff->cutaway());
        result.set("hideWhenEmpty", static_cast<int>(staff->hideWhenEmpty()));
    }
    return response(JsonDocument(result).toJson(JsonDocument::Format::Compact));
}

// Applies the keys present (as getStaffProperties names them) as one undoable edit, as EditStaff does.
EMSCRIPTEN_KEEPALIVE bool setStaffProperties(uintptr_t score_ptr, int staffIdx, const char* json, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score || staffIdx < 0 || static_cast<size_t>(staffIdx) >= score->nstaves()) return false;
    const JsonObject o = JsonDocument::fromJson(ByteArray(json ? json : "{}")).rootObject();
    engraving::Staff* staff = score->staff(staffIdx);
    engraving::Part* part = staff->part();
    const Fraction tick(0, 1);

    score->startCmd(TranslatableString::untranslatable("Edit staff properties"));
    if (o.contains("longName")) {
        score->undo(new engraving::ChangeInstrumentLong(tick, part, { engraving::StaffName(o.value("longName").toString()) }));
    }
    if (o.contains("shortName")) {
        score->undo(new engraving::ChangeInstrumentShort(tick, part, { engraving::StaffName(o.value("shortName").toString()) }));
    }
    if (o.contains("partName")) {
        score->undo(new engraving::ChangePart(part, new engraving::Instrument(*part->instrument()), o.value("partName").toString()));
    }
    if (o.contains("visible") || o.contains("cutaway")) {
        score->undo(new engraving::ChangeStaff(staff,
                                               o.contains("visible") ? o.value("visible").toBool() : staff->visible(),
                                               staff->defaultClefType(), staff->userDist(),
                                               o.contains("cutaway") ? o.value("cutaway").toBool() : staff->cutaway(),
                                               staff->hideSystemBarLine(), staff->mergeMatchingRests(),
                                               staff->reflectTranspositionInLinkedTab()));
    }
    if (o.contains("hideWhenEmpty")) {
        staff->undoChangeProperty(engraving::Pid::HIDE_WHEN_EMPTY,
                                  engraving::PropertyValue::fromValue(engraving::AutoOnOff(o.value("hideWhenEmpty").toInt())));
    }
    if (o.contains("small") || o.contains("lines") || o.contains("invisibleLines")) {
        engraving::StaffType type = *staff->staffType(tick);
        if (o.contains("small")) type.setSmall(o.value("small").toBool());
        if (o.contains("lines")) type.setLines(std::max(1, std::min(14, o.value("lines").toInt())));
        if (o.contains("invisibleLines")) type.setInvisible(o.value("invisibleLines").toBool());
        score->undo(new engraving::ChangeStaffType(staff, type));
    }
    score->endCmd();
    layoutLinked(score);
    return true;
}

} // extern "C"
