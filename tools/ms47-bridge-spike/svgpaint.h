// SPDX-License-Identifier: GPL-3.0-only
#pragma once
#include "draw/bufferedpaintprovider.h"
#include "draw/ifontprovider.h"
#include <iomanip>
#include <algorithm>
#include <sstream>
#include "svgfontoutlines.h"
#include "imagetools.h"

// Painter::drawText(rect, flags, text) as single-line runs: alignment, line breaks and clipping. Returns false for
// word wrap and tab expansion, which the engraving painter never requests for score content.
template<class Provider, class Run>
static bool layoutRectText(Provider& provider, const muse::RectF& r, int flags, const muse::String& value, Run&& run)
{
    using namespace muse::draw;
    if(flags & (TextWordWrap | TextExpandTabs)) return false;
    auto fp=muse::modularity::globalIoc()->resolve<IFontProvider>("spike");
    muse::String content=value;
    if(flags & TextSingleLine) {
        auto str=content.toStdString(); std::replace(str.begin(),str.end(),'\n',' ');
        content=muse::String::fromStdString(str);
    }
    auto lines=content.split(u'\n');
    if(lines.empty()) return true;
    const auto& font=provider.font();
    const double ascent=fp->ascent(font), descent=fp->descent(font);
    const double spacing=fp->lineSpacing(font);
    const double height=ascent+descent+(lines.size()-1)*spacing;
    double y=r.top()+ascent;
    if(flags & AlignVCenter) y=r.top()+(r.height()-height)/2+ascent;
    else if(flags & AlignBottom) y=r.bottom()-height+ascent;
    if(!(flags & TextDontClip)) { provider.save(); provider.setClipRect(r); }
    for(const auto& line:lines) {
        double x=r.left();
        const double width=fp->horizontalAdvance(font,line);
        if(flags & AlignHCenter) x+=(r.width()-width)/2;
        else if(flags & AlignRight) x+=r.width()-width;
        run(muse::PointF(x,y),line); y+=spacing;
    }
    if(!(flags & TextDontClip)) provider.restore();
    return true;
}

// Streaming SVG provider. Reuse upstream state/save/restore, but emit immediately
// so overlapping primitives retain painter order (DrawData groups by primitive).
class SvgPaint : public muse::draw::BufferedPaintProvider {
    using Point = muse::PointF;
    using Rect = muse::RectF;
    using Font = muse::draw::Font;
    using Path = muse::draw::PainterPath;
    std::ostringstream out;
    std::string failure;
    SvgFontOutlines outlines;
    std::string elementClass;   // 4.00 SVG contract: the drawn element's type name (+ " selected"), see saveSvg
    struct Clip { std::string clip, mask; bool enabled=false; } clip;
    std::vector<Clip> clips;
    unsigned clipId=0;
    std::string matrix() const {
        const auto& t=transform(); std::ostringstream s;
        s << std::setprecision(10) << "matrix(" << t.m11() << ' ' << t.m12() << ' ' << t.m21() << ' ' << t.m22() << ' ' << t.dx() << ' ' << t.dy() << ')';
        return s.str();
    }
    void rect(const Rect& r,const char* fill) {
        out << "<rect x=\"" << r.x() << "\" y=\"" << r.y() << "\" width=\"" << r.width() << "\" height=\"" << r.height() << "\" fill=\"" << fill << "\"/>";
    }

    std::map<muse::draw::FontDataKey, muse::draw::FontData> fonts;
    static std::string base64(const muse::ByteArray& bytes) {
        static const char chars[]="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        std::string s;
        for(size_t i=0;i<bytes.size();i+=3) {
            unsigned a=bytes.constData()[i], b=i+1<bytes.size()?bytes.constData()[i+1]:0, c=i+2<bytes.size()?bytes.constData()[i+2]:0;
            unsigned v=(a<<16)|(b<<8)|c;
            s+=chars[(v>>18)&63]; s+=chars[(v>>12)&63];
            s+=i+1<bytes.size()?chars[(v>>6)&63]:'='; s+=i+2<bytes.size()?chars[v&63]:'=';
        }
        return s;
    }
public:
    double deviceLogicalDpi() const override { return mu::engraving::DPI; }
    void setElementClass(std::string cls) { elementClass = std::move(cls); }
    SvgPaint() { out << std::setprecision(10); }
    static std::string escape(const std::string& s) {
        std::string r;
        for (char c : s) {
            switch(c) {
            case '&': r += "&amp;"; break;
            case '<': r += "&lt;"; break;
            case '>': r += "&gt;"; break;
            case '"': r += "&quot;"; break;
            default: r += c;
            }
        }
        return r;
    }
    static std::string color(const muse::draw::Color& c) {
        return "rgba("+std::to_string(c.red())+","+std::to_string(c.green())+","+
            std::to_string(c.blue())+","+std::to_string(c.alpha()/255.0)+")";
    }
    void group(bool text = false) {
        using namespace muse::draw;
        out << "<g";
        if(clip.enabled && !clip.clip.empty()) out << " clip-path=\"url(#" << clip.clip << ")\"";
        out << "><g";
        if(clip.enabled && !clip.mask.empty()) out << " mask=\"url(#" << clip.mask << ")\"";
        out << '>';
        const auto& t = transform();
        out << "<g transform=\"matrix(" << t.m11() << ' ' << t.m12() << ' ' << t.m21() << ' '
            << t.m22() << ' ' << t.dx() << ' ' << t.dy() << ")\"";
        if(!elementClass.empty()) out << " class=\"" << elementClass << "\"";
        out << " fill=\"" << (text ? color(pen().color()) : brush().style() == BrushStyle::NoBrush ? "none" : color(brush().color())) << "\"";
        out << " stroke=\"" << (text || pen().style() == PenStyle::NoPen ? "none" : color(pen().color())) << "\" stroke-width=\"" << pen().widthF() << "\"";
        out << " stroke-linecap=\"" << (pen().capStyle()==PenCapStyle::RoundCap ? "round" : pen().capStyle()==PenCapStyle::FlatCap ? "butt" : "square") << "\"";
        out << " stroke-linejoin=\"" << (pen().joinStyle()==PenJoinStyle::RoundJoin ? "round" : pen().joinStyle()==PenJoinStyle::MiterJoin ? "miter" : "bevel") << "\"";
        const auto dashes = pen().dashPattern();
        if (!dashes.empty()) {
            out << " stroke-dasharray=\"";
            for (double d : dashes) out << d * pen().widthF() << ' ';
            out << "\"";
        }
        out << '>';
    }
    void drawPath(const Path& p) override {
        group(); out << "<path fill-rule=\"" << (int(p.fillRule()) == 0 ? "evenodd" : "nonzero") << "\" d=\"";
        for (size_t i=0; i<p.elementCount(); ++i) {
            auto e = p.elementAt(i);
            switch (int(e.type)) {
            case 0: out << "M" << e.x << ',' << e.y; break;
            case 1: out << "L" << e.x << ',' << e.y; break;
            case 2: {
                auto b=p.elementAt(++i); auto c=p.elementAt(++i);
                out << "C" << e.x << ',' << e.y << ' ' << b.x << ',' << b.y << ' ' << c.x << ',' << c.y;
                break;
            }
            default: failure="Unexpected SVG path element";
            }
        }
        out << "\"/></g></g></g>";
    }
    void drawPolygon(const Point* p, size_t n, muse::draw::PolygonMode mode) override {
        using namespace muse::draw;
        group();
        const char* tag = mode == PolygonMode::Polyline ? "polyline" : "polygon";
        out << '<' << tag << " fill-rule=\"" << (mode == PolygonMode::OddEven ? "evenodd" : "nonzero") << "\" points=\"";
        for(size_t i=0;i<n;++i) out << p[i].x() << ',' << p[i].y() << ' ';
        out << "\"/></g></g></g>";
    }
    void text(const Font& f, const Point& p, const muse::String& s) {
        using namespace muse::draw;
        const auto requested = dataKeyForFont(f);
        if (f.family().id() == u"Bravura Text") {
            auto db=muse::modularity::globalIoc()->resolve<IFontsDatabase>("spike");
            const auto data=db->fontData(requested,f.type());
            group(true);
            if (!data.valid() || !outlines.draw(f,p,s,data,deviceLogicalDpi(),out)) failure="Could not outline SVG font run";
            out << "</g></g></g>"; return;
        }
        if (!fonts.count(requested)) {
            auto db=muse::modularity::globalIoc()->resolve<IFontsDatabase>("spike");
            auto data=db->fontData(requested,f.type());
            if(!data.valid()) failure="Missing SVG font";
            fonts.emplace(requested,std::move(data));
        }
        group(true);
        // Match the engraving font metrics and painter's 1200-DPI coordinates.
        out << "<text x=\"" << p.x() << "\" y=\"" << p.y() << "\" font-family=\"" << escape(f.family().id().toStdString())
            << "\" font-size=\"" << (f.pixelSize()>0 ? f.pixelSize() : f.pointSizeF()*deviceLogicalDpi()/72.0)
            << "\" font-weight=\"" << (f.bold()?"bold":"normal") << "\" font-style=\"" << (f.italic()?"italic":"normal")
            << "\" xml:space=\"preserve\">" << escape(s.toStdString()) << "</text></g></g></g>";
    }
    void drawText(const Point& p, const muse::String& s) override { text(font(),p,s); }
    void drawTextWorkaround(const Font& f,const Point& p,const muse::String& s) override { text(f,p,s); }
    void drawSymbol(const Point& p,char32_t c) override { text(font(),p,muse::String::fromUcs4(c)); }
    void drawText(const Rect& r,int flags,const muse::String& value) override {
        if(!layoutRectText(*this,r,flags,value,[&](const Point& at,const muse::String& line) { text(font(),at,line); }))
            failure="SVG wrapped/tabbed text not yet ported";
    }
    // Score images keep their encoded bytes (imagetools.h): embed them at the pixmap's size under the current transform
    void drawPixmap(const Point& p,const muse::draw::Pixmap& pm) override {
        const ImageHeader h=readImageHeader(pm.data());
        if(!h.mime) { failure="Unsupported SVG image data"; return; }
        group();
        out << "<image x=\"" << p.x() << "\" y=\"" << p.y() << "\" width=\"" << pm.width() << "\" height=\"" << pm.height()
            << "\" preserveAspectRatio=\"none\" href=\"data:" << h.mime << ";base64," << base64(pm.data()) << "\"/></g></g></g>";
    }
    void drawTiledPixmap(const Rect&,const muse::draw::Pixmap&,const Point&) override { failure="SVG tiled images not yet ported"; }
    void save() override { BufferedPaintProvider::save(); clips.push_back(clip); }
    void restore() override { BufferedPaintProvider::restore(); if(!clips.empty()) { clip=clips.back(); clips.pop_back(); } }
    bool hasClipping() const override { return clip.enabled; }
    void setClipping(bool enable) override { clip.enabled=enable; }
    void setClipRect(const Rect& r) override {
        clip.clip="clip"+std::to_string(++clipId); clip.enabled=true;
        out << "<defs><clipPath clipPathUnits=\"userSpaceOnUse\" id=\"" << clip.clip << "\" transform=\"" << matrix() << "\">";
        rect(r,"white"); out << "</clipPath></defs>";
    }
    void setMask(const Rect& background,const std::vector<Rect>& holes) override {
        clip.mask="mask"+std::to_string(++clipId); clip.enabled=true;
        out << "<defs><mask maskUnits=\"userSpaceOnUse\" x=\"-100000\" y=\"-100000\" width=\"200000\" height=\"200000\" id=\"" << clip.mask << "\"><g transform=\"" << matrix() << "\">";
        rect(background,"white"); for(const auto& r:holes) rect(r,"black");
        out << "</g></mask></defs>";
    }
    const std::string& error() const { return failure; }
    std::string svg(double w,double h,bool background) const {
        std::ostringstream s;
        s << "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"" << w << "px\" height=\"" << h << "px\" viewBox=\"0 0 " << w << ' ' << h << "\">";
        s << "<defs><style>";
        for(const auto& entry : fonts) {
            const auto& key=entry.first;
            s << "@font-face{font-family:&quot;" << escape(key.family().id().toStdString())
                << "&quot;;font-weight:" << (key.bold()?"bold":"normal") << ";font-style:" << (key.italic()?"italic":"normal")
                << ";src:url(data:font/otf;base64," << base64(entry.second.data) << ")}\n";
        }
        s << "</style></defs>";
        if(background) s << "<rect width=\"100%\" height=\"100%\" fill=\"white\"/>";
        s << out.str() << "</svg>";
        return s.str();
    }
};
