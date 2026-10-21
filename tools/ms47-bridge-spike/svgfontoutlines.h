// SPDX-License-Identifier: GPL-3.0-only
#pragma once
#include <ft2build.h>
#include FT_FREETYPE_H
#include FT_OUTLINE_H
#include <hb.h>
#include <hb-ot.h>

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
    FT_Library library=nullptr;
    std::map<muse::draw::FontDataKey,std::unique_ptr<Face>> faces;
public:
    ~SvgFontOutlines() { faces.clear(); if (library) FT_Done_FreeType(library); }
    bool draw(const muse::draw::Font& font, const muse::PointF& at, const muse::String& text,
              const muse::draw::FontData& data, double dpi, std::ostream& out) {
        using namespace muse::draw;
        if (text.empty()) return true;
        const auto key=dataKeyForFont(font);
        if (!faces.count(key)) {
            if (!library && FT_Init_FreeType(&library)) return false;
            auto face=std::make_unique<Face>(); face->bytes=data.data;
            if (FT_New_Memory_Face(library,face->bytes.constData(),face->bytes.size(),0,&face->ft)) return false;
            auto* blob=hb_blob_create(face->bytes.constChar(),face->bytes.size(),HB_MEMORY_MODE_READONLY,nullptr,nullptr);
            auto* hbFace=hb_face_create(blob,0); face->hb=hb_font_create(hbFace);
            hb_ot_font_set_funcs(face->hb);
            hb_font_set_scale(face->hb,face->ft->units_per_EM,face->ft->units_per_EM);
            hb_face_destroy(hbFace); hb_blob_destroy(blob);
            faces.emplace(key,std::move(face));
        }
        auto& face=*faces.at(key);
        if (!face.ft->units_per_EM) return false;
        const double pixels=font.pixelSize()>0 ? font.pixelSize() : font.pointSizeF()*dpi/72.0;
        const double scale=pixels/face.ft->units_per_EM;
        auto* buffer=hb_buffer_create();
        const auto chars=text.toStdU32String();
        hb_buffer_add_utf32(buffer,reinterpret_cast<const uint32_t*>(chars.data()),chars.size(),0,chars.size());
        hb_buffer_guess_segment_properties(buffer); hb_shape(face.hb,buffer,nullptr,0);
        unsigned count=0;
        auto* glyphs=hb_buffer_get_glyph_infos(buffer,&count);
        auto* positions=hb_buffer_get_glyph_positions(buffer,nullptr);
        double x=at.x(), y=at.y(); bool ok=true;
        for (unsigned i=0;i<count;++i) {
            if (!glyphs[i].codepoint || FT_Load_Glyph(face.ft,glyphs[i].codepoint,FT_LOAD_NO_SCALE|FT_LOAD_NO_HINTING)
                || face.ft->glyph->format!=FT_GLYPH_FORMAT_OUTLINE) { ok=false; break; }
            out << "<path data-font-outline=\"true\" transform=\"translate(" << x+positions[i].x_offset*scale << ' '
                << y-positions[i].y_offset*scale << ") scale(" << scale << ' ' << -scale << ")\" d=\"";
            Path path {out}; FT_Outline_Funcs callbacks {Path::move,Path::line,Path::conic,Path::cubic,0,0};
            if (FT_Outline_Decompose(&face.ft->glyph->outline,&callbacks,&path)) { ok=false; break; }
            if (path.open) out << 'Z';
            out << "\"/>";
            x+=positions[i].x_advance*scale; y-=positions[i].y_advance*scale;
        }
        hb_buffer_destroy(buffer); return ok;
    }
};
