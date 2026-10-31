// SPDX-License-Identifier: GPL-3.0-only
#pragma once
// Colours as "#RRGGBBAA" tokens, for the style dialog and the element properties: the alpha too (a text frame's fill
// is often transparent), which Color::toString leaves out.
#include <cstdio>
#include <string>

static std::string colorHex(const Color& c)
{
    char hex[10];
    std::snprintf(hex, sizeof(hex), "#%02X%02X%02X%02X", c.red(), c.green(), c.blue(), c.alpha());
    return hex;
}

// "#RRGGBB" (opaque) or "#RRGGBBAA"; false for anything else.
static bool colorFromHex(const String& text, Color& out)
{
    const std::string s = text.toStdString();
    if ((s.size() != 7 && s.size() != 9) || s[0] != '#') return false;
    unsigned v[4] = { 0, 0, 0, 255 };
    for (size_t i = 0; i * 2 + 1 < s.size(); ++i) {
        const std::string byte = s.substr(1 + i * 2, 2);
        if (byte.find_first_not_of("0123456789abcdefABCDEF") != std::string::npos) return false;
        v[i] = static_cast<unsigned>(std::stoul(byte, nullptr, 16));
    }
    out = Color(int(v[0]), int(v[1]), int(v[2]), int(v[3]));
    return true;
}
