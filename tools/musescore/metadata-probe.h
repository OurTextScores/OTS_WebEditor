// Real-engine fault injection, compiled only into the Node verification harness, never the browser package.
// Production setupMasterScore currently lays out even load(..., false); detach layout parents temporarily
// to exercise the incomplete-layout paths without changing production loading behavior.
extern "C" EMSCRIPTEN_KEEPALIVE const uint8_t* probeMissingLayout(uintptr_t id)
{
    auto* score = getScore(id);
    if (!score) return textResponse("Invalid score", 1);
    std::vector<std::pair<Measure*, System*>> parents;
    int index = 0;
    for (auto* measure = score->firstMeasureMM(); measure; measure = measure->nextMeasureMM()) {
        if (index++ % 2 == 0) {
            parents.emplace_back(measure, measure->system());
            measure->setParent(nullptr);
        }
    }
    JsonObject result;
    result.set("measures", positionsJson(score, false));
    result.set("segments", positionsJson(score, true));
    for (const auto& [measure, parent] : parents) measure->setParent(parent);
    return response(JsonDocument(result).toJson(JsonDocument::Format::Compact));
}
