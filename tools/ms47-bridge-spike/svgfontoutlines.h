// SPDX-License-Identifier: GPL-3.0-only
#pragma once
#include <ft2build.h>
#include FT_FREETYPE_H
#include FT_OUTLINE_H
#include <hb.h>
#include <hb-ot.h>
#include <iomanip>
#include <sstream>

// Outline font runs that browsers reject (currently upstream Bravura Text's
// malformed format-4 cmap). Keep the original font data; use native shaping and
// outlines rather than modifying/renaming the font or relying on host fallback.
class SvgFontOutlines {
    struct Face {
        muse::ByteArray bytes;
        FT_Face ft=nullptr;
        hb_font_t* hb=nullptr;
        ~Face() { if (hb) hb_font_destroy(hb); if (ft) FT_Done_Face(ft); }
    };
    struct Path {
        std::ostream& out;
        bool open=false;
        static int move(const FT_Vector* p, void* data) {
            auto& path=*static_cast<Path*>(data);
            if (path.open) path.out << 'Z';
            path.out << 'M' << p->x << ',' << p->y; path.open=true; return 0;
        }
        static int line(const FT_Vector* p, void* data) {
            static_cast<Path*>(data)->out << 'L' << p->x << ',' << p->y; return 0;
        }
        static int conic(const FT_Vector* c, const FT_Vector* p, void* data) {
            static_cast<Path*>(data)->out << 'Q' << c->x << ',' << c->y << ' ' << p->x << ',' << p->y; return 0;
        }
        static int cubic(const FT_Vector* a, const FT_Vector* b, const FT_Vector* p, void* data) {
            static_cast<Path*>(data)->out << 'C' << a->x << ',' << a->y << ' ' << b->x << ',' << b->y << ' ' << p->x << ',' << p->y; return 0;
        }
    };
    // Outline callbacks in run coordinates: font units scaled and flipped (y up) onto the glyph origin
    struct RunPath {
        std::ostream& out;
        double x=0, y=0, scale=1;
        bool open=false;
        void point(const FT_Vector* p) const { out << x + p->x*scale << ',' << y - p->y*scale; }
        static int move(const FT_Vector* p, void* data) {
            auto& r=*static_cast<RunPath*>(data);
            if (r.open) r.out << 'Z';
            r.out << 'M'; r.point(p); r.open=true; return 0;
        }
        static int line(const FT_Vector* p, void* data) { auto& r=*static_cast<RunPath*>(data); r.out << 'L'; r.point(p); return 0; }
        static int conic(const FT_Vector* c, const FT_Vector* p, void* data) {
            auto& r=*static_cast<RunPath*>(data); r.out << 'Q'; r.point(c); r.out << ' '; r.point(p); return 0;
        }
        static int cubic(const FT_Vector* a, const FT_Vector* b, const FT_Vector* p, void* data) {
            auto& r=*static_cast<RunPath*>(data); r.out << 'C'; r.point(a); r.out << ' '; r.point(b); r.out << ' '; r.point(p); return 0;
        }
    };
    FT_Library library=nullptr;
    std::map<muse::draw::FontDataKey,std::unique_ptr<Face>> faces;
public:
    ~SvgFontOutlines() { faces.clear(); if (library) FT_Done_FreeType(library); }
    // Shape a run and hand each glyph's outline (font units, y up) to `glyph(outline, glyphId, x, y, scale)` at its pen
    // position. Glyphs the face lacks call `missing()` and are skipped when it returns true, otherwise the run fails.
    Face* loadFace(const muse::draw::FontDataKey& key, const muse::ByteArray& bytes) {
        auto found=faces.find(key);
        if (found!=faces.end()) return found->second.get();
        if (!library && FT_Init_FreeType(&library)) return nullptr;
        auto face=std::make_unique<Face>(); face->bytes=bytes;
        if (FT_New_Memory_Face(library,face->bytes.constData(),face->bytes.size(),0,&face->ft)) return nullptr;
        auto* blob=hb_blob_create(face->bytes.constChar(),face->bytes.size(),HB_MEMORY_MODE_READONLY,nullptr,nullptr);
        auto* hbFace=hb_face_create(blob,0); face->hb=hb_font_create(hbFace);
        hb_ot_font_set_funcs(face->hb);
        hb_font_set_scale(face->hb,face->ft->units_per_EM,face->ft->units_per_EM);
        hb_face_destroy(hbFace); hb_blob_destroy(blob);
        return faces.emplace(key,std::move(face)).first->second.get();
    }

    // Shape a run and hand each glyph's outline (font units, y up) to `glyph(outline, face, glyphId, x, y, scale)` at
    // its pen position. Characters the primary face lacks come from the font database's substitution faces (as the
    // Qt-free FontsEngine measures them, so drawing agrees with layout); glyphs no face has call `missing()` and are
    // skipped when it returns true, otherwise the run fails.
    template<class Glyph, class Missing>
    bool shape(const muse::draw::Font& font, const muse::PointF& at, const muse::String& text,
               const muse::draw::FontData& data, double dpi, Glyph&& glyph, Missing&& missing) {
        using namespace muse::draw;
        if (text.empty()) return true;
        Face* primary=loadFace(dataKeyForFont(font),data.data);
        if (!primary || !primary->ft->units_per_EM) return false;
        std::vector<Face*> candidates { primary };
        auto db=muse::modularity::globalIoc()->resolve<IFontsDatabase>("spike");
        // As FontsEngine::fontFace: engraving text arrives as Unknown/Undefined and resolves as Text
        Font::Type type=font.type();
        if (type==Font::Type::Undefined || type==Font::Type::Unknown) type=Font::Type::Text;
        for (const FontDataKey& key : db->substitutionFonts(type)) {
            const FontData sub=db->fontData(key,type);
            if (Face* f=sub.valid() ? loadFace(key,sub.data) : nullptr) candidates.push_back(f);
        }
        const double pixels=font.pixelSize()>0 ? font.pixelSize() : font.pointSizeF()*dpi/72.0;
        const auto chars=text.toStdU32String();
        auto faceFor=[&](char32_t c) {
            for (Face* f : candidates) if (FT_Get_Char_Index(f->ft,c)) return f;
            return primary;   // nobody has it: the primary face reports the missing glyph
        };
        double x=at.x(), y=at.y(); bool ok=true;
        for (size_t start=0; start<chars.size() && ok;) {
            Face* face=faceFor(chars[start]);
            size_t end=start+1;
            while (end<chars.size() && faceFor(chars[end])==face) ++end;
            const double scale=pixels/face->ft->units_per_EM;
            auto* buffer=hb_buffer_create();
            hb_buffer_add_utf32(buffer,reinterpret_cast<const uint32_t*>(chars.data()),chars.size(),start,end-start);
            hb_buffer_guess_segment_properties(buffer); hb_shape(face->hb,buffer,nullptr,0);
            unsigned count=0;
            auto* glyphs=hb_buffer_get_glyph_infos(buffer,&count);
            auto* positions=hb_buffer_get_glyph_positions(buffer,nullptr);
            for (unsigned i=0;i<count;++i) {
                if (!glyphs[i].codepoint || FT_Load_Glyph(face->ft,glyphs[i].codepoint,FT_LOAD_NO_SCALE|FT_LOAD_NO_HINTING)
                    || face->ft->glyph->format!=FT_GLYPH_FORMAT_OUTLINE) {
                    if (!missing()) { ok=false; break; }
                } else if (!glyph(&face->ft->glyph->outline,static_cast<const void*>(face),glyphs[i].codepoint,
                                  x+positions[i].x_offset*scale,y-positions[i].y_offset*scale,scale)) { ok=false; break; }
                x+=positions[i].x_advance*scale; y-=positions[i].y_advance*scale;
            }
            hb_buffer_destroy(buffer);
            start=end;
        }
        return ok;
    }

    // One <path> per run, as the 4.00 SVG: every glyph's outline in run coordinates (no fonts in the document, tight
    // element boxes). Glyphs the face lacks are skipped and counted in `missing`.
    bool draw(const muse::draw::Font& font, const muse::PointF& at, const muse::String& text,
              const muse::draw::FontData& data, double dpi, std::ostream& out, const std::string& attrs, size_t& missing) {
        std::ostringstream d;
        d << std::setprecision(7);
        RunPath path { d };
        const bool ok = shape(font,at,text,data,dpi,[&](FT_Outline* outline,const void*,unsigned,double x,double y,double scale) {
            path.x=x; path.y=y; path.scale=scale;
            FT_Outline_Funcs callbacks {RunPath::move,RunPath::line,RunPath::conic,RunPath::cubic,0,0};
            if (FT_Outline_Decompose(outline,&callbacks,&path)) return false;
            if (path.open) { d << 'Z'; path.open=false; }
            return true;
        },[&] { ++missing; return true; });
        if (ok && !d.str().empty()) out << "<path" << attrs << " d=\"" << d.str() << "\"/>";
        return ok;
    }
};
