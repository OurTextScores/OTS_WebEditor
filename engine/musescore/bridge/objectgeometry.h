// SPDX-License-Identifier: GPL-3.0-only
#pragma once

#include <cmath>

// Atomic, read-only snapshot. No native pointer or persistent identity crosses the ABI.
extern "C" {
EMSCRIPTEN_KEEPALIVE const uint8_t* hitTestScoreObject(uintptr_t id, int pageNumber, double x, double y, int excerpt)
{
    JsonObject result;
    result.set("schemaVersion", 1);
    result.set("coordinateSpace", "page-local-360dpi");
    const auto finish = [&result](const char* status) {
        result.set("status", status);
        return response(JsonDocument(result).toJson(JsonDocument::Format::Compact));
    };
    if (!std::isfinite(x) || !std::isfinite(y) || pageNumber < 0) return finish("invalid-input");
    auto* score = getScore(id, excerpt);
    if (!score) return finish("invalid-input");
    const auto& pages = score->pages();
    if (pages.empty()) return finish("unavailable");
    if (pageNumber >= int(pages.size())) return finish("invalid-input");
    auto* page = pages.at(pageNumber);
    if (!page) return finish("unavailable");
    const double nativeX = fromAbi(x), nativeY = fromAbi(y);
    if (!std::isfinite(nativeX) || !std::isfinite(nativeY)) return finish("invalid-input");
    auto items = selectableItemsAtPoint(page, muse::PointF(nativeX, nativeY));
    auto* item = pickTopmostSelectableItem(items);
    if (!item) return finish("no-hit");
    if (!item->visible()) return finish("unavailable");
    if (!item->isNote() && !item->isRest()) return finish("unsupported");
    auto* measure = item->findMeasure();
    int measureIndex = 0;
    auto* current = score->firstMeasure();
    while (current && current != measure) { current = current->nextMeasure(); ++measureIndex; }
    JsonObject location;
    location.set("measureIndex", current ? JsonValue(measureIndex) : JsonValue());
    location.set("staffIndex", item->staffIdx() != muse::nidx ? JsonValue(int(item->staffIdx())) : JsonValue());
    location.set("voiceIndex", int(item->voice()));
    result.set("kind", item->isNote() ? "note" : "rest");
    result.set("location", location);
    const auto box = item->pageBoundingRect();
    if (!std::isfinite(box.x()) || !std::isfinite(box.y()) || !std::isfinite(box.width()) ||
        !std::isfinite(box.height()) || box.width() <= 0 || box.height() <= 0) {
        result.set("geometry", JsonValue());
    } else {
        JsonObject geometry;
        geometry.set("page", pageNumber);
        geometry.set("x", toAbi(box.x())); geometry.set("y", toAbi(box.y()));
        geometry.set("width", toAbi(box.width())); geometry.set("height", toAbi(box.height()));
        result.set("geometry", geometry);
    }
    return finish("ok");
}
}
