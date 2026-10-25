// SPDX-License-Identifier: GPL-3.0-only
#pragma once
// Services the Qt-free framework leaves unregistered but engraving dereferences for score images (STUBS_AUDIT.md):
// ICryptographicHash (MD4 store names, ImageStore::add) and IImageProvider (Image::init, raster drawing). Desktop uses
// QCryptographicHash and QImage. Pixmaps here keep the encoded file bytes and read only the size from the header;
// the SVG and PDF writers embed the original bytes.

#include <cstring>

#include "global/icryptographichash.h"
#include "draw/iimageprovider.h"
#include "draw/types/pixmap.h"

// RFC 1320 MD4: images are stored in MSCZ as Pictures/<md4>.<ext> and looked up by that name
class SpikeCryptographicHash : public muse::ICryptographicHash
{
public:
    muse::ByteArray hash(const muse::ByteArray& data, Algorithm) const override
    {
        auto f = [](uint32_t x, uint32_t y, uint32_t z) { return (x & y) | (~x & z); };
        auto g = [](uint32_t x, uint32_t y, uint32_t z) { return (x & y) | (x & z) | (y & z); };
        auto h = [](uint32_t x, uint32_t y, uint32_t z) { return x ^ y ^ z; };
        auto rol = [](uint32_t v, int s) { return (v << s) | (v >> (32 - s)); };
        std::vector<uint8_t> msg(data.constData(), data.constData() + data.size());
        const uint64_t bits = uint64_t(data.size()) * 8;
        msg.push_back(0x80);
        while (msg.size() % 64 != 56) msg.push_back(0);
        for (int i = 0; i < 8; ++i) msg.push_back(uint8_t(bits >> (8 * i)));
        uint32_t a = 0x67452301, b = 0xEFCDAB89, c = 0x98BADCFE, d = 0x10325476;
        static const int order3[16] = { 0, 8, 4, 12, 2, 10, 6, 14, 1, 9, 5, 13, 3, 11, 7, 15 };
        for (size_t off = 0; off < msg.size(); off += 64) {
            uint32_t x[16];
            for (int i = 0; i < 16; ++i) {
                x[i] = uint32_t(msg[off + 4 * i]) | uint32_t(msg[off + 4 * i + 1]) << 8 | uint32_t(msg[off + 4 * i + 2]) << 16
                       | uint32_t(msg[off + 4 * i + 3]) << 24;
            }
            const uint32_t aa = a, bb = b, cc = c, dd = d;
            static const int s1[4] = { 3, 7, 11, 19 }, s2[4] = { 3, 5, 9, 13 }, s3[4] = { 3, 9, 11, 15 };
            for (int i = 0; i < 16; ++i) {
                uint32_t* r[4] = { &a, &d, &c, &b };
                uint32_t& t = *r[i % 4];
                const uint32_t p = *r[(i + 3) % 4], q = *r[(i + 2) % 4], u = *r[(i + 1) % 4];
                t = rol(t + f(p, q, u) + x[i], s1[i % 4]);
            }
            for (int i = 0; i < 16; ++i) {
                uint32_t* r[4] = { &a, &d, &c, &b };
                uint32_t& t = *r[i % 4];
                const uint32_t p = *r[(i + 3) % 4], q = *r[(i + 2) % 4], u = *r[(i + 1) % 4];
                t = rol(t + g(p, q, u) + x[(i % 4) * 4 + i / 4] + 0x5A827999, s2[i % 4]);
            }
            for (int i = 0; i < 16; ++i) {
                uint32_t* r[4] = { &a, &d, &c, &b };
                uint32_t& t = *r[i % 4];
                const uint32_t p = *r[(i + 3) % 4], q = *r[(i + 2) % 4], u = *r[(i + 1) % 4];
                t = rol(t + h(p, q, u) + x[order3[i]] + 0x6ED9EBA1, s3[i % 4]);
            }
            a += aa; b += bb; c += cc; d += dd;
        }
        muse::ByteArray out(16);
        const uint32_t words[4] = { a, b, c, d };
        for (int i = 0; i < 16; ++i) out[i] = uint8_t(words[i / 4] >> (8 * (i % 4)));
        return out;
    }
};

// Encoded image kind and pixel size from the file header
struct ImageHeader {
    const char* mime = nullptr;
    int width = 0;
    int height = 0;
};

static ImageHeader readImageHeader(const muse::ByteArray& bytes)
{
    const uint8_t* p = bytes.constData();
    const size_t n = bytes.size();
    auto be16 = [&](size_t i) { return int(p[i]) << 8 | p[i + 1]; };
    auto be32 = [&](size_t i) { return int(uint32_t(p[i]) << 24 | uint32_t(p[i + 1]) << 16 | uint32_t(p[i + 2]) << 8 | p[i + 3]); };
    ImageHeader h;
    if (n >= 24 && std::memcmp(p, "\x89PNG\r\n\x1a\n", 8) == 0) {
        h = { "image/png", be32(16), be32(20) };
    } else if (n >= 4 && p[0] == 0xFF && p[1] == 0xD8) {
        for (size_t i = 2; i + 9 < n;) {
            if (p[i] != 0xFF) { ++i; continue; }
            const uint8_t marker = p[i + 1];
            if (marker == 0xD8 || marker == 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { i += 2; continue; }
            const bool frame = marker >= 0xC0 && marker <= 0xCF && marker != 0xC4 && marker != 0xC8 && marker != 0xCC;
            if (frame) { h = { "image/jpeg", be16(i + 7), be16(i + 5) }; break; }
            i += 2 + be16(i + 2);
        }
    } else if (n >= 10 && (std::memcmp(p, "GIF87a", 6) == 0 || std::memcmp(p, "GIF89a", 6) == 0)) {
        h = { "image/gif", p[6] | p[7] << 8, p[8] | p[9] << 8 };
    } else if (n >= 26 && p[0] == 'B' && p[1] == 'M') {
        h = { "image/bmp", int(p[18] | p[19] << 8 | p[20] << 16 | uint32_t(p[21]) << 24),
              std::abs(int(p[22] | p[23] << 8 | p[24] << 16 | uint32_t(p[25]) << 24)) };
    }
    if (h.width <= 0 || h.height <= 0) return {};
    return h;
}

class SpikeImageProvider : public muse::draw::IImageProvider
{
public:
    std::shared_ptr<muse::draw::Pixmap> createPixmap(const muse::ByteArray& data) const override
    {
        const ImageHeader h = readImageHeader(data);
        if (!h.mime) {
            LOGW() << "unsupported image format; drawn as an empty frame";
            return std::make_shared<muse::draw::Pixmap>();
        }
        return std::make_shared<muse::draw::Pixmap>(data, muse::Size(h.width, h.height));
    }
    std::shared_ptr<muse::draw::Pixmap> createPixmap(int w, int h, int, const muse::Color&) const override
    {
        return std::make_shared<muse::draw::Pixmap>(muse::Size(w, h));
    }
    // Screen-resolution cache in desktop; the writers scale the original instead, so keep the bytes at the new size
    muse::draw::Pixmap scaled(const muse::draw::Pixmap& origin, const muse::Size& s) const override
    {
        return muse::draw::Pixmap(origin.data(), s);
    }
    // Only for MSCZ thumbnails, which this build does not render
    muse::draw::IPaintProviderPtr painterForImage(std::shared_ptr<muse::draw::Pixmap>) override { return nullptr; }
    void saveAsPng(std::shared_ptr<muse::draw::Pixmap> px, muse::io::IODevice* device) override
    {
        if (px && device && readImageHeader(px->data()).mime == std::string("image/png")) device->write(px->data());
        else LOGW() << "saveAsPng: only PNG sources can be written without an image codec";
    }
};
