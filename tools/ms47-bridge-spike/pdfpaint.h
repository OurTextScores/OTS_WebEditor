// SPDX-License-Identifier: GPL-3.0-only
#pragma once
// Native vector PDF (DECISIONS.md item 2). The same streaming provider shape as SvgPaint: painter primitives become
// PDF content-stream operators in painter order, and text is drawn as glyph outlines (HarfBuzz shaping, FreeType
// outlines) so the file needs no embedded fonts and looks identical everywhere. Text is therefore not selectable.
#include <zlib.h>
#include "svgpaint.h"

class PdfPaint : public muse::draw::BufferedPaintProvider {
    using Point = muse::PointF;
    using Rect = muse::RectF;
    using Font = muse::draw::Font;
    using Path = muse::draw::PainterPath;

    std::string failure;
    SvgFontOutlines outlines;
    std::ostringstream content;                       // current page's content stream
    std::vector<std::string> pages;                   // finished content streams
    std::vector<std::pair<double, double>> sizes;     // page sizes in points
    std::map<std::pair<int, int>, int> alphaStates;   // (fill, stroke) alpha -> /GSn
    std::map<std::pair<const void*, unsigned>, std::string> glyphPaths;   // outline ops in font units, per face+glyph
    size_t missingGlyphs = 0;
    // Clip region as page-space paths (transformed when set): a clip rect, and a mask (background minus holes)
    struct Clip { std::string clip, mask; bool enabled = false; } clip;
    std::vector<Clip> clips;

    static std::string num(double v) {
        if (std::abs(v) < 1e-6) return "0";
        char buf[32];
        snprintf(buf, sizeof(buf), "%.4f", v);
        std::string s(buf);
        s.erase(s.find_last_not_of('0') + 1);
        if (s.back() == '.') s.pop_back();
        return s;
    }
    std::string mapped(double x, double y) const {
        const auto p = transform().map(Point(x, y));
        return num(p.x()) + ' ' + num(p.y());
    }
    std::string rectPath(const Rect& r) const {
        return mapped(r.left(), r.top()) + " m " + mapped(r.right(), r.top()) + " l " + mapped(r.right(), r.bottom()) + " l "
               + mapped(r.left(), r.bottom()) + " l h ";
    }
    std::string alphaState(int fill, int stroke) {
        auto [it, added] = alphaStates.emplace(std::make_pair(fill, stroke), int(alphaStates.size()));
        return "/GS" + std::to_string(it->second) + " gs ";
    }
    static std::string rgb(const muse::draw::Color& c, const char* op) {
        return num(c.red() / 255.0) + ' ' + num(c.green() / 255.0) + ' ' + num(c.blue() / 255.0) + ' ' + op + ' ';
    }

    // Open a primitive: clip, then the painter transform, colours and line style. `fill`/`stroke` say what will be painted.
    void begin(bool fill, bool stroke, const muse::draw::Color& fillColor) {
        using namespace muse::draw;
        content << "q ";
        if (clip.enabled && !clip.clip.empty()) content << clip.clip << "W n ";
        if (clip.enabled && !clip.mask.empty()) content << clip.mask << "W* n ";
        const auto& t = transform();
        content << num(t.m11()) << ' ' << num(t.m12()) << ' ' << num(t.m21()) << ' ' << num(t.m22()) << ' ' << num(t.dx())
                << ' ' << num(t.dy()) << " cm ";
        const int fillAlpha = fill ? fillColor.alpha() : 255, strokeAlpha = stroke ? pen().color().alpha() : 255;
        if (fillAlpha != 255 || strokeAlpha != 255) content << alphaState(fillAlpha, strokeAlpha);
        if (fill) content << rgb(fillColor, "rg");
        if (stroke) {
            const Pen& p = pen();
            content << rgb(p.color(), "RG") << num(p.widthF()) << " w "
                    << (p.capStyle() == PenCapStyle::RoundCap ? 1 : p.capStyle() == PenCapStyle::FlatCap ? 0 : 2) << " J "
                    << (p.joinStyle() == PenJoinStyle::RoundJoin ? 1 : p.joinStyle() == PenJoinStyle::MiterJoin ? 0 : 2) << " j ";
            const auto dashes = p.dashPattern();
            if (!dashes.empty()) {
                content << '[';
                for (double d : dashes) content << num(d * p.widthF()) << ' ';
                content << "] 0 d ";
            }
        }
    }
    void paint(bool fill, bool stroke, bool evenOdd) {
        content << (fill && stroke ? (evenOdd ? "B*" : "B") : fill ? (evenOdd ? "f*" : "f") : stroke ? "S" : "n") << " Q\n";
    }
    bool hasBrush() const { return brush().style() != muse::draw::BrushStyle::NoBrush; }
    bool hasPen() const { return pen().style() != muse::draw::PenStyle::NoPen; }

    // FreeType outline -> PDF path operators in font units (conics raised to cubics)
    struct Outline {
        std::ostringstream& out;
        double cx = 0, cy = 0;
        bool open = false;
        static int move(const FT_Vector* p, void* data) {
            auto& o = *static_cast<Outline*>(data);
            if (o.open) o.out << "h ";
            o.out << p->x << ' ' << p->y << " m ";
            o.cx = p->x; o.cy = p->y; o.open = true;
            return 0;
        }
        static int line(const FT_Vector* p, void* data) {
            auto& o = *static_cast<Outline*>(data);
            o.out << p->x << ' ' << p->y << " l ";
            o.cx = p->x; o.cy = p->y;
            return 0;
        }
        static int conic(const FT_Vector* c, const FT_Vector* p, void* data) {
            auto& o = *static_cast<Outline*>(data);
            const double x1 = o.cx + 2.0 / 3 * (c->x - o.cx), y1 = o.cy + 2.0 / 3 * (c->y - o.cy);
            const double x2 = p->x + 2.0 / 3 * (c->x - p->x), y2 = p->y + 2.0 / 3 * (c->y - p->y);
            o.out << num(x1) << ' ' << num(y1) << ' ' << num(x2) << ' ' << num(y2) << ' ' << p->x << ' ' << p->y << " c ";
            o.cx = p->x; o.cy = p->y;
            return 0;
        }
        static int cubic(const FT_Vector* a, const FT_Vector* b, const FT_Vector* p, void* data) {
            auto& o = *static_cast<Outline*>(data);
            o.out << a->x << ' ' << a->y << ' ' << b->x << ' ' << b->y << ' ' << p->x << ' ' << p->y << " c ";
            o.cx = p->x; o.cy = p->y;
            return 0;
        }
    };

    void text(const Font& f, const Point& p, const muse::String& s) {
        using namespace muse::draw;
        if (s.empty()) return;
        auto db = muse::modularity::globalIoc()->resolve<IFontsDatabase>("spike");
        const auto data = db->fontData(dataKeyForFont(f), f.type());
        if (!data.valid()) { failure = "Missing PDF font " + f.family().id().toStdString(); return; }
        // Text is filled with the pen colour, as the SVG writer and Qt do
        begin(true, false, pen().color());
        const bool ok = outlines.shape(f, p, s, data, deviceLogicalDpi(),
            [&](FT_Outline* outline, unsigned glyphId, double x, double y, double scale) {
                auto key = std::make_pair(static_cast<const void*>(data.data.constData()), glyphId);
                auto it = glyphPaths.find(key);
                if (it == glyphPaths.end()) {
                    std::ostringstream ops;
                    Outline o { ops };
                    FT_Outline_Funcs callbacks { Outline::move, Outline::line, Outline::conic, Outline::cubic, 0, 0 };
                    if (FT_Outline_Decompose(outline, &callbacks, &o)) return false;
                    if (o.open) ops << "h ";
                    it = glyphPaths.emplace(key, ops.str()).first;
                }
                // Font units are y-up; the page space is y-down
                content << "q " << num(scale) << " 0 0 " << num(-scale) << ' ' << num(x) << ' ' << num(y) << " cm " << it->second << "f Q ";
                return true;
            },
            [&] { ++missingGlyphs; return true; });
        if (!ok) failure = "Could not outline PDF font run";
        content << "Q\n";
    }

public:
    double deviceLogicalDpi() const override { return mu::engraving::DPI; }

    void beginPage(double widthPoints, double heightPoints) {
        content.str({}); content.clear();
        clip = {}; clips.clear();
        sizes.emplace_back(widthPoints, heightPoints);
        // Painter units (1200 DPI, y down) -> PDF points (y up)
        const double s = 72.0 / deviceLogicalDpi();
        content << num(s) << " 0 0 " << num(-s) << " 0 " << num(heightPoints) << " cm\n";
    }
    void endPage() { pages.push_back(content.str()); }

    void drawPath(const Path& p) override {
        const bool fill = hasBrush(), stroke = hasPen();
        begin(fill, stroke, brush().color());
        for (size_t i = 0; i < p.elementCount(); ++i) {
            auto e = p.elementAt(i);
            switch (int(e.type)) {
            case 0: content << num(e.x) << ' ' << num(e.y) << " m "; break;
            case 1: content << num(e.x) << ' ' << num(e.y) << " l "; break;
            case 2: {
                auto b = p.elementAt(++i), c = p.elementAt(++i);
                content << num(e.x) << ' ' << num(e.y) << ' ' << num(b.x) << ' ' << num(b.y) << ' ' << num(c.x) << ' ' << num(c.y) << " c ";
                break;
            }
            default: failure = "Unexpected PDF path element";
            }
        }
        paint(fill, stroke, p.fillRule() == Path::FillRule::OddEvenFill);
    }
    void drawPolygon(const Point* p, size_t n, muse::draw::PolygonMode mode) override {
        using namespace muse::draw;
        if (!n) return;
        const bool polyline = mode == PolygonMode::Polyline;
        const bool fill = !polyline && hasBrush(), stroke = hasPen();
        begin(fill, stroke, brush().color());
        content << num(p[0].x()) << ' ' << num(p[0].y()) << " m ";
        for (size_t i = 1; i < n; ++i) content << num(p[i].x()) << ' ' << num(p[i].y()) << " l ";
        if (!polyline) content << "h ";
        paint(fill, stroke, mode == PolygonMode::OddEven);
    }
    void drawText(const Point& p, const muse::String& s) override { text(font(), p, s); }
    void drawTextWorkaround(const Font& f, const Point& p, const muse::String& s) override { text(f, p, s); }
    void drawSymbol(const Point& p, char32_t c) override { text(font(), p, muse::String::fromUcs4(c)); }
    void drawText(const Rect& r, int flags, const muse::String& value) override {
        if (!layoutRectText(*this, r, flags, value, [&](const Point& at, const muse::String& line) { text(font(), at, line); }))
            failure = "PDF wrapped/tabbed text not yet ported";
    }
    void drawPixmap(const Point&, const muse::draw::Pixmap&) override { failure = "PDF images not yet ported"; }
    void drawTiledPixmap(const Rect&, const muse::draw::Pixmap&, const Point&) override { failure = "PDF tiled images not yet ported"; }
    void save() override { BufferedPaintProvider::save(); clips.push_back(clip); }
    void restore() override { BufferedPaintProvider::restore(); if (!clips.empty()) { clip = clips.back(); clips.pop_back(); } }
    bool hasClipping() const override { return clip.enabled; }
    void setClipping(bool enable) override { clip.enabled = enable; }
    void setClipRect(const Rect& r) override { clip.clip = rectPath(r); clip.enabled = true; }
    void setMask(const Rect& background, const std::vector<Rect>& holes) override {
        clip.mask = rectPath(background);
        for (const auto& r : holes) clip.mask += rectPath(r);
        clip.enabled = true;
    }

    const std::string& error() const { return failure; }
    size_t missingGlyphCount() const { return missingGlyphs; }

    // Assemble the document: catalog, page tree, shared resources, info, Flate-compressed content streams, xref
    muse::ByteArray pdf(const muse::String& title) const {
        std::string doc = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
        std::vector<size_t> offsets;
        auto object = [&](const std::string& body) {
            offsets.push_back(doc.size());
            doc += std::to_string(offsets.size()) + " 0 obj\n" + body + "\nendobj\n";
        };
        const size_t pageCount = pages.size();
        const int firstPage = 5;   // 1 catalog, 2 pages, 3 resources, 4 info, then (page, content) pairs
        std::string kids;
        for (size_t i = 0; i < pageCount; ++i) kids += std::to_string(firstPage + 2 * i) + " 0 R ";
        object("<< /Type /Catalog /Pages 2 0 R >>");
        object("<< /Type /Pages /Kids [" + kids + "] /Count " + std::to_string(pageCount) + " >>");
        std::string states;
        for (const auto& [alpha, index] : alphaStates) {
            states += "/GS" + std::to_string(index) + " << /ca " + num(alpha.first / 255.0) + " /CA " + num(alpha.second / 255.0) + " >> ";
        }
        object("<< /ExtGState << " + states + ">> >>");
        std::string hexTitle = "FEFF";
        for (char16_t c : title.toStdU16String()) {
            char buf[5];
            snprintf(buf, sizeof(buf), "%04X", unsigned(c));
            hexTitle += buf;
        }
        object("<< /Producer (OurTextScores \\(MuseScore 4.7 engine\\)) /Title <" + hexTitle + "> >>");
        for (size_t i = 0; i < pageCount; ++i) {
            object("<< /Type /Page /Parent 2 0 R /Resources 3 0 R /MediaBox [0 0 " + num(sizes[i].first) + ' ' + num(sizes[i].second)
                   + "] /Contents " + std::to_string(firstPage + 2 * i + 1) + " 0 R >>");
            const std::string& raw = pages[i];
            uLongf packedSize = compressBound(raw.size());
            std::string packed(packedSize, '\0');
            compress2(reinterpret_cast<Bytef*>(packed.data()), &packedSize, reinterpret_cast<const Bytef*>(raw.data()), raw.size(), Z_BEST_COMPRESSION);
            packed.resize(packedSize);
            object("<< /Length " + std::to_string(packed.size()) + " /Filter /FlateDecode >>\nstream\n" + packed + "\nendstream");
        }
        const size_t xref = doc.size();
        doc += "xref\n0 " + std::to_string(offsets.size() + 1) + "\n0000000000 65535 f \n";
        for (size_t offset : offsets) {
            char line[21];
            snprintf(line, sizeof(line), "%010zu 00000 n \n", offset);
            doc += line;
        }
        doc += "trailer\n<< /Size " + std::to_string(offsets.size() + 1) + " /Root 1 0 R /Info 4 0 R >>\nstartxref\n" + std::to_string(xref) + "\n%%EOF\n";
        return muse::ByteArray(reinterpret_cast<const uint8_t*>(doc.data()), doc.size());
    }
};

extern "C" {

// All pages, printing appearance (no selection, invisible elements or page shadows), as desktop's PDF export
EMSCRIPTEN_KEEPALIVE const uint8_t* savePdf(uintptr_t id, int excerpt)
{
    auto* score = getScore(id, excerpt);
    if (!score || score->npages() == 0) return textResponse("Invalid score or excerpt", 1);
    auto provider = std::make_shared<PdfPaint>();
    auto renderer = muse::modularity::globalIoc()->resolve<rendering::IScoreRenderer>("spike");
    for (size_t page = 0; page < score->npages(); ++page) {
        const auto box = score->pages().at(page)->ldata()->bbox();
        provider->beginPage(box.width() * 72.0 / mu::engraving::DPI, box.height() * 72.0 / mu::engraving::DPI);
        muse::draw::Painter painter(provider, "ms47-pdf");
        rendering::IScoreRenderer::ScorePaintOptions opt;
        opt.fromPage = int(page); opt.toPage = int(page); opt.isSetViewport = false;
        opt.isPrinting = true; opt.printPageBackground = false;
        renderer->paintScore(&painter, score, opt);
        painter.endDraw();
        provider->endPage();
        if (!provider->error().empty()) return textResponse(provider->error(), 1);
    }
    if (provider->missingGlyphCount()) LOGW() << "savePdf: " << provider->missingGlyphCount() << " glyphs missing from their fonts were skipped";
    // As desktop's Notation::projectWorkTitleAndPartName
    muse::String title = score->masterScore()->metaTag(u"workTitle");
    if (title.isEmpty()) title = score->masterScore()->name();
    if (!score->isMaster()) title += u" - " + score->name();
    return response(provider->pdf(title));
}

} // extern "C"
