// SPDX-License-Identifier: GPL-3.0-only
#pragma once
#include "draw/ifontprovider.h"
#include "draw/types/fontstypes.h"

// The generic Qt-free FontsEngine uses 360 DPI; engraving uses 1200 DPI.
// Match the desktop QFontProvider's engraving paint device without Qt.
class EngravingFontMetrics : public muse::draw::IFontProvider {
    std::shared_ptr<muse::draw::IFontProvider> provider;
    static muse::draw::Font engravingFont(muse::draw::Font f) {
        if (f.pointSizeF() > 0) f.setPointSizeF(f.pointSizeF() * mu::engraving::DPI / muse::draw::DPI);
        return f;
    }
public:
    EngravingFontMetrics(std::shared_ptr<muse::draw::IFontProvider> source) : provider(std::move(source)) {}
    int addSymbolFont(const muse::String& family, const muse::io::path_t& path) override { return provider->addSymbolFont(family, path); }
    double lineSpacing(const muse::draw::Font& f) const override { return provider->lineSpacing(engravingFont(f)); }
    double xHeight(const muse::draw::Font& f) const override { return provider->xHeight(engravingFont(f)); }
    double height(const muse::draw::Font& f) const override { return provider->height(engravingFont(f)); }
    double capHeight(const muse::draw::Font& f) const override { return provider->capHeight(engravingFont(f)); }
    double ascent(const muse::draw::Font& f) const override { return provider->ascent(engravingFont(f)); }
    double descent(const muse::draw::Font& f) const override { return provider->descent(engravingFont(f)); }
    bool inFont(const muse::draw::Font& f, char32_t c) const override { return provider->inFont(engravingFont(f), c); }
    double horizontalAdvance(const muse::draw::Font& f, const muse::String& s) const override { return provider->horizontalAdvance(engravingFont(f), s); }
    double horizontalAdvance(const muse::draw::Font& f, char32_t c) const override { return provider->horizontalAdvance(engravingFont(f), c); }
    muse::RectF boundingRect(const muse::draw::Font& f, const muse::String& s) const override { return provider->boundingRect(engravingFont(f), s); }
    muse::RectF boundingRect(const muse::draw::Font& f, char32_t c) const override { return provider->boundingRect(engravingFont(f), c); }
    muse::RectF tightBoundingRect(const muse::draw::Font& f, const muse::String& s) const override { return provider->tightBoundingRect(engravingFont(f), s); }
};
