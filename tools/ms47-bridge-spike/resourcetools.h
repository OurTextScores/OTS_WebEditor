#pragma once
// On-demand resources (DECISIONS.md items 3 and 8). Browser builds preload a minimal set; the engine records font files
// it looked for and did not find (bootstrap.h), and reports scripts the bundled text fonts cannot draw. The JS loader
// fetches both from the resource CDN into the engine's file system and calls resourcesAdded, which lays scores out
// again with the new fonts. A score that needs nothing extra costs nothing.

#include <set>

#include "global/serialization/json.h"
#include "engraving/dom/textbase.h"

namespace ms47resources {

// Fallback font ids by script; the JS loader maps them to files (WebMscore.fallbackFonts). Han without kana or hangul
// is reported as Chinese.
static void addScriptFallbacks(const String& text, bool& han, bool& kana, bool& hangul)
{
    for (char32_t c : text.toStdU32String()) {
        if ((c >= 0x3040 && c <= 0x30FF) || (c >= 0x31F0 && c <= 0x31FF) || (c >= 0xFF66 && c <= 0xFF9F)) kana = true;
        else if ((c >= 0xAC00 && c <= 0xD7AF) || (c >= 0x1100 && c <= 0x11FF) || (c >= 0x3130 && c <= 0x318F)) hangul = true;
        else if ((c >= 0x4E00 && c <= 0x9FFF) || (c >= 0x3400 && c <= 0x4DBF) || (c >= 0x20000 && c <= 0x2FA1F)
                 || (c >= 0x3000 && c <= 0x303F) || (c >= 0xF900 && c <= 0xFAFF) || (c >= 0xFF00 && c <= 0xFF65)) han = true;
    }
}

static std::vector<std::string> scriptFallbacks(Score* score)
{
    bool han = false, kana = false, hangul = false;
    for (Score* s : score->masterScore()->scoreList()) {
        s->scanElements([&](EngravingItem* item) {
            if (item && item->isTextBase()) addScriptFallbacks(toTextBase(item)->plainText(), han, kana, hangul);
        });
        for (const auto& [key, value] : s->masterScore()->metaTags()) addScriptFallbacks(value, han, kana, hangul);
        for (const Part* part : s->parts()) {
            addScriptFallbacks(part->partName(), han, kana, hangul);
            addScriptFallbacks(part->longName(), han, kana, hangul);
            addScriptFallbacks(part->shortName(), han, kana, hangul);
        }
    }
    std::vector<std::string> ids;
    if (kana) ids.push_back("ja");
    if (hangul) ids.push_back("ko");
    if (han && !kana) ids.push_back("zh");
    return ids;
}

static bool present(const std::string& relativePath)
{
    std::error_code ec;
    return fs::exists(resourceRootPath() / relativePath, ec);
}
} // namespace ms47resources

extern "C" {

// {"files": [paths relative to resourceRoot()], "fallbacks": ["ja" | "ko" | "zh"]} for this score
EMSCRIPTEN_KEEPALIVE const uint8_t* missingResources(uintptr_t score_ptr, int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score) return textResponse("Invalid score or excerpt", 1);
    JsonArray files;
    for (const std::string& path : missingResourcePaths()) {
        if (!ms47resources::present(path)) files.append(String::fromStdString(path));
    }
    JsonArray fallbacks;
    for (const std::string& id : ms47resources::scriptFallbacks(score)) fallbacks.append(String::fromStdString(id));
    JsonObject json;
    json.set("files", files);
    json.set("fallbacks", fallbacks);
    return response(JsonDocument(json).toJson(JsonDocument::Format::Compact));
}

// Where fetched resources go: the preloaded package's mount point in browsers, the staged directory in Node
EMSCRIPTEN_KEEPALIVE const uint8_t* resourceRoot()
{
    return textResponse(resourceRootPath().string());
}

// Store a fetched resource under the resource root (relative path, no "..")
EMSCRIPTEN_KEEPALIVE bool writeResource(const char* relativePath, const uint8_t* data, size_t length)
{
    const fs::path relative = fs::path(relativePath ? relativePath : "").lexically_normal();
    if (relative.empty() || relative.is_absolute() || *relative.begin() == "..") return false;
    const fs::path target = resourceRootPath() / relative;
    std::error_code ec;
    fs::create_directories(target.parent_path(), ec);
    std::ofstream out(target, std::ios::binary | std::ios::trunc);
    out.write(reinterpret_cast<const char*>(data), static_cast<std::streamsize>(length));
    return static_cast<bool>(out);
}

// After the JS loader wrote fetched files: forget them as missing, let text fonts resolve again, load music fonts whose
// files arrived, and lay every open score out with them. Returns how many recorded files are still missing.
EMSCRIPTEN_KEEPALIVE int resourcesAdded()
{
    auto& missing = missingResourcePaths();
    for (auto it = missing.begin(); it != missing.end();) {
        it = ms47resources::present(*it) ? missing.erase(it) : std::next(it);
    }
    auto ioc = muse::modularity::globalIoc();
    if (auto engine = std::dynamic_pointer_cast<muse::draw::FontsEngine>(ioc->resolve<muse::draw::IFontsEngine>("spike"))) {
        engine->resetRequiredFaces();
    }
    loadPresentMusicFonts(std::dynamic_pointer_cast<engraving::EngravingFontsProvider>(ioc->resolve<engraving::IEngravingFontsProvider>("spike")));
    for (auto& [id, project] : projects) {
        for (Score* score : project->masterScore()->scoreList()) {
            score->setLayoutAll();
        }
        layoutAllLinked(project->masterScore());
    }
    return static_cast<int>(missing.size());
}

} // extern "C"
