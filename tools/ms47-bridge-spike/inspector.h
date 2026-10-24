// SPDX-License-Identifier: GPL-3.0-only
#pragma once
#include "global/serialization/json.h"
#include "engraving/dom/spanner.h"
static std::vector<engraving::EngravingItem*> selectedInspectorTargets(Score* score)
{
    std::vector<engraving::EngravingItem*> targets;
    std::set<engraving::EngravingItem*> seen;
    auto append = [&targets, &seen](engraving::EngravingItem* item) {
        if (!item) {
            return;
        }
        if (item->isSpannerSegment()) {
            item = toSpannerSegment(item)->spanner();
        }
        if (item && seen.insert(item).second) {
            targets.push_back(item);
        }
    };

    append(score->selection().element());
    for (auto* item : score->selection().elements()) {
        append(item);
    }
    return targets;
}

static JsonObject inspectorProperty(const JsonValue& value, bool mixed, int applicableCount)
{
    JsonObject property;
    property.set("value", mixed ? JsonValue() : value);
    property.set("mixed", mixed);
    property.set("applicableCount", applicableCount);
    return property;
}

extern "C" EMSCRIPTEN_KEEPALIVE const uint8_t* getSelectedElementProperties(uintptr_t score_ptr, int excerptId)
{
    auto* score=getScore(score_ptr, excerptId);
    if(!score) return textResponse("Invalid score",1);
    const auto targets = selectedInspectorTargets(score);
    JsonObject result;
    result.set("selectionCount", static_cast<int>(targets.size()));
    if (targets.empty()) {
        result.set("elementType", String());
        result.set("properties", JsonObject());
        return response(JsonDocument(result).toJson(JsonDocument::Format::Compact));
    }

    const String firstType = String::fromUtf8(targets.front()->typeName());
    bool mixedTypes = false;
    for (auto* target : targets) {
        if (String::fromUtf8(target->typeName()) != firstType) {
            mixedTypes = true;
            break;
        }
    }
    result.set("elementType", mixedTypes ? String(u"Mixed") : firstType);

    JsonObject properties;
    auto addBool = [&properties, &targets](const char* name, engraving::Pid pid) {
        bool first = false;
        bool haveFirst = false;
        bool mixed = false;
        int count = 0;
        for (auto* target : targets) {
            const auto value = target->getProperty(pid);
            if (!value.isValid()) continue;
            const bool current = value.toBool();
            if (!haveFirst) {
                first = current;
                haveFirst = true;
            } else if (current != first) {
                mixed = true;
            }
            ++count;
        }
        if (count > 0) properties.set(std::string(name), inspectorProperty(first, mixed, count));
    };
    auto addEnum = [&properties, &targets](const char* name, engraving::Pid pid, const std::vector<const char*>& labels) {
        int first = 0;
        bool haveFirst = false;
        bool mixed = false;
        int count = 0;
        for (auto* target : targets) {
            const auto value = target->getProperty(pid);
            if (!value.isValid()) continue;
            const int current = value.toInt();
            if (current < 0 || current >= static_cast<int>(labels.size())) continue;
            if (!haveFirst) {
                first = current;
                haveFirst = true;
            } else if (current != first) {
                mixed = true;
            }
            ++count;
        }
        if (count > 0) properties.set(std::string(name), inspectorProperty(String::fromUtf8(labels[first]), mixed, count));
    };

    addBool("visible", engraving::Pid::VISIBLE);
    addBool("small", engraving::Pid::SMALL);

    std::string firstColor;
    bool haveColor = false;
    bool mixedColor = false;
    int colorCount = 0;
    double firstX = 0.0;
    double firstY = 0.0;
    bool haveOffset = false;
    bool mixedX = false;
    bool mixedY = false;
    int offsetCount = 0;
    for (auto* target : targets) {
        const auto colorValue = target->getProperty(engraving::Pid::COLOR);
        if (colorValue.isValid()) {
            const std::string color = colorValue.value<muse::draw::Color>().toString();
            if (!haveColor) {
                firstColor = color;
                haveColor = true;
            } else if (color != firstColor) {
                mixedColor = true;
            }
            ++colorCount;
        }
        const auto offsetValue = target->getProperty(engraving::Pid::OFFSET);
        if (offsetValue.isValid()) {
            const engraving::PointF offset = offsetValue.value<engraving::PointF>();
            const double spatium = target->spatium();
            const double x = spatium > 0.0 ? offset.x() / spatium : 0.0;
            const double y = spatium > 0.0 ? offset.y() / spatium : 0.0;
            if (!haveOffset) {
                firstX = x;
                firstY = y;
                haveOffset = true;
            } else {
                mixedX = mixedX || std::abs(x - firstX) > 0.0001;
                mixedY = mixedY || std::abs(y - firstY) > 0.0001;
            }
            ++offsetCount;
        }
    }
    if (colorCount > 0) properties.set("color", inspectorProperty(String::fromStdString(firstColor), mixedColor, colorCount));
    if (offsetCount > 0) {
        properties.set("offsetX", inspectorProperty(firstX, mixedX, offsetCount));
        properties.set("offsetY", inspectorProperty(firstY, mixedY, offsetCount));
    }

    addEnum("placement", engraving::Pid::PLACEMENT, { "above", "below" });
    addEnum("stemDirection", engraving::Pid::STEM_DIRECTION, { "auto", "up", "down" });
    addEnum("lineStyle", engraving::Pid::LINE_STYLE, { "solid", "dashed", "dotted" });
    result.set("properties", properties);
    return response(JsonDocument(result).toJson(JsonDocument::Format::Compact));
}

static bool parseInspectorBool(const char* value, bool& parsed)
{
    if (value && std::strcmp(value, "true") == 0) {
        parsed = true;
        return true;
    }
    if (value && std::strcmp(value, "false") == 0) {
        parsed = false;
        return true;
    }
    return false;
}

extern "C" EMSCRIPTEN_KEEPALIVE bool setSelectedElementProperty(uintptr_t score_ptr, const char* propertyName, const char* serializedValue, int excerptId)
{
    if (!propertyName || !serializedValue) {
        return false;
    }
    auto* score=getScore(score_ptr, excerptId);
    if(!score) return false;
    const auto targets = selectedInspectorTargets(score);
    if (targets.empty()) {
        LOGW() << "setSelectedElementProperty: no selected elements";
        return false;
    }

    const std::string name(propertyName);
    const std::string value(serializedValue);
    engraving::Pid pid = engraving::Pid::END;
    std::optional<engraving::PropertyValue> propertyValue;
    bool boolValue = false;
    if (name == "visible" && parseInspectorBool(serializedValue, boolValue)) {
        pid = engraving::Pid::VISIBLE;
        propertyValue = boolValue;
    } else if (name == "small" && parseInspectorBool(serializedValue, boolValue)) {
        pid = engraving::Pid::SMALL;
        propertyValue = boolValue;
    } else if (name == "color") {
        const muse::draw::Color color = muse::draw::Color::fromString(value);
        if (!color.isValid()) return false;
        pid = engraving::Pid::COLOR;
        propertyValue = engraving::PropertyValue::fromValue(color);
    } else if (name == "placement" && (value == "above" || value == "below")) {
        pid = engraving::Pid::PLACEMENT;
        propertyValue = value == "above" ? engraving::PlacementV::ABOVE : engraving::PlacementV::BELOW;
    } else if (name == "stemDirection" && (value == "auto" || value == "up" || value == "down")) {
        pid = engraving::Pid::STEM_DIRECTION;
        propertyValue = value == "up" ? engraving::DirectionV::UP : value == "down" ? engraving::DirectionV::DOWN : engraving::DirectionV::AUTO;
    } else if (name == "lineStyle" && (value == "solid" || value == "dashed" || value == "dotted")) {
        pid = engraving::Pid::LINE_STYLE;
        propertyValue = value == "dashed" ? engraving::LineType::DASHED : value == "dotted" ? engraving::LineType::DOTTED : engraving::LineType::SOLID;
    } else if (name != "offsetX" && name != "offsetY") {
        LOGW() << "setSelectedElementProperty: unsupported property " << propertyName;
        return false;
    }

    double numericValue = 0.0;
    if (name == "offsetX" || name == "offsetY") {
        bool ok = false;
        numericValue = String::fromUtf8(serializedValue).toDouble(&ok);
        if (!ok || !std::isfinite(numericValue) || numericValue < -20.0 || numericValue > 20.0) {
            return false;
        }
        pid = engraving::Pid::OFFSET;
    }

    std::vector<std::pair<engraving::EngravingItem*, engraving::PropertyValue> > changes;
    std::set<engraving::EngravingItem*> changedTargets;
    for (auto* originalTarget : targets) {
        auto* target = originalTarget;
        if (pid == engraving::Pid::STEM_DIRECTION && target->isNote()) {
            target = toNote(target)->chord();
        }
        if (!target || !changedTargets.insert(target).second) continue;
        const auto current = target->getProperty(pid);
        if (!current.isValid()) continue;
        engraving::PropertyValue next = propertyValue.value_or(current);
        if (pid == engraving::Pid::OFFSET) {
            engraving::PointF offset = current.value<engraving::PointF>();
            const double scoreValue = numericValue * target->spatium();
            name == "offsetX" ? offset.setX(scoreValue) : offset.setY(scoreValue);
            next = engraving::PropertyValue::fromValue(offset);
        }
        if (current != next) {
            changes.emplace_back(target, next);
        }
    }
    if (changes.empty()) {
        return false;
    }

    score->startCmd(TranslatableString::untranslatable("Change element properties"));
    for (const auto& change : changes) {
        change.first->undoChangeProperty(pid, change.second, engraving::PropertyFlags::UNSTYLED);
    }
    score->endCmd();
    layoutLinked(score);
    return true;
}

