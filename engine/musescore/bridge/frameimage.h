// SPDX-License-Identifier: GPL-3.0-only
#pragma once
// A frame's Add ▸ Image (NotationInteraction::addImageToItem): an image file's bytes, typed by its suffix (svg,
// png, jpg, …), go into the selected frame as one undoable edit.
#include "engraving/dom/factory.h"
#include "engraving/dom/image.h"

extern "C" {

EMSCRIPTEN_KEEPALIVE bool addImageToFrame(uintptr_t score_ptr, const char* suffix, const uint8_t* data, uint32_t size,
                                          int excerptId)
{
    auto* score = getScore(score_ptr, excerptId);
    if (!score || !suffix || !data || size == 0) return false;
    auto* frame = score->selection().element();
    if (!frame || !frame->isBox()) return false;
    const std::string ext = String::fromUtf8(suffix).toLower().toStdString();
    engraving::ImageType type = engraving::ImageType::NONE;
    if (ext == "svg" || ext == "svgz") type = engraving::ImageType::SVG;
    else if (ext == "png" || ext == "jpg" || ext == "jpeg" || ext == "bmp" || ext == "tif" || ext == "tiff") type = engraving::ImageType::RASTER;
    if (type == engraving::ImageType::NONE) return false;

    engraving::Image* image = engraving::Factory::createImage(frame);
    image->setImageType(type);
    if (!image->loadFromData(ext, ByteArray(reinterpret_cast<const char*>(data), size))) {
        delete image;
        return false;
    }
    image->setParent(frame);
    score->startCmd(TranslatableString::untranslatable("Add image"));
    score->undoAddElement(image);
    score->endCmd();
    layoutLinked(score);
    return true;
}

} // extern "C"
