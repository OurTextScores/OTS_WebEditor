// SPDX-License-Identifier: GPL-3.0-only
#pragma once
#include "global/serialization/json.h"
#include "engraving/types/typesconv.h"
extern "C" EMSCRIPTEN_KEEPALIVE const uint8_t* getUndoEntries(uintptr_t id,int from,int to,int excerpt) {
    auto* score=getScore(id,excerpt); if(!score) return textResponse("Invalid score",1);
    const auto* stack=score->undoStack();
    JsonArray entries;
    for(int i=std::max(0,from); i<std::min(int(stack->size()),to); ++i) {
        // Upstream exposes the command leading to a state (1-based), whereas
        // the existing JS history API addresses entries (0-based).
        const auto* macro=stack->lastAtIndex(size_t(i)+1);
        JsonArray commands, elements;
        std::set<std::string> seenCommands, seenElements;
        for(const auto* command:macro->commands()) {
            std::string name=command->name();
            if(seenCommands.insert(name).second) commands.append(name);
        }
        for(auto type:macro->changesInfo().changedObjectTypes) {
            std::string name=TConv::toXml(type).ascii();
            if(seenElements.insert(name).second) elements.append(name);
        }
        const auto& selection=macro->undoSelectionInfo();
        JsonObject entry;
        entry.set("commands",commands).set("elements",elements)
            .set("tickStart",selection.isValid()?selection.tickStart.ticks():-1)
            .set("tickEnd",selection.isValid()?selection.tickEnd.ticks():-1);
        entries.append(entry);
    }
    return response(JsonDocument(entries).toJson(JsonDocument::Format::Compact));
}
