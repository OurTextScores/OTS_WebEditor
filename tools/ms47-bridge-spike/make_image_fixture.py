"""Build image-fixture.mscz: bach_orig.mscz with a 1x1 PNG in Pictures/ (named by its MD4, as MuseScore stores images)
and an <Image> in the title frame. Usage: python3 make_image_fixture.py <bach_orig.mscz> <out.mscz>"""
import struct, sys, zipfile, zlib


def md4(data: bytes) -> str:
    def f(x, y, z): return (x & y) | (~x & z)
    def g(x, y, z): return (x & y) | (x & z) | (y & z)
    def h(x, y, z): return x ^ y ^ z
    def rol(v, s): v &= 0xFFFFFFFF; return ((v << s) | (v >> (32 - s))) & 0xFFFFFFFF
    msg = data + b'\x80' + b'\x00' * ((55 - len(data)) % 64) + struct.pack('<Q', len(data) * 8)
    a, b, c, d = 0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476
    for off in range(0, len(msg), 64):
        x = struct.unpack('<16I', msg[off:off + 64])
        aa, bb, cc, dd = a, b, c, d
        for i in range(16):
            k = [0, 1, 2, 3][i % 4]; s = [3, 7, 11, 19][i % 4]
            if k == 0: a = rol(a + f(b, c, d) + x[i], s)
            elif k == 1: d = rol(d + f(a, b, c) + x[i], s)
            elif k == 2: c = rol(c + f(d, a, b) + x[i], s)
            else: b = rol(b + f(c, d, a) + x[i], s)
        for i in range(16):
            idx = (i % 4) * 4 + i // 4; s = [3, 5, 9, 13][i % 4]
            if i % 4 == 0: a = rol(a + g(b, c, d) + x[idx] + 0x5A827999, s)
            elif i % 4 == 1: d = rol(d + g(a, b, c) + x[idx] + 0x5A827999, s)
            elif i % 4 == 2: c = rol(c + g(d, a, b) + x[idx] + 0x5A827999, s)
            else: b = rol(b + g(c, d, a) + x[idx] + 0x5A827999, s)
        order = [0, 8, 4, 12, 2, 10, 6, 14, 1, 9, 5, 13, 3, 11, 7, 15]
        for i in range(16):
            s = [3, 9, 11, 15][i % 4]
            if i % 4 == 0: a = rol(a + h(b, c, d) + x[order[i]] + 0x6ED9EBA1, s)
            elif i % 4 == 1: d = rol(d + h(a, b, c) + x[order[i]] + 0x6ED9EBA1, s)
            elif i % 4 == 2: c = rol(c + h(d, a, b) + x[order[i]] + 0x6ED9EBA1, s)
            else: b = rol(b + h(c, d, a) + x[order[i]] + 0x6ED9EBA1, s)
        a, b, c, d = (a + aa) & 0xFFFFFFFF, (b + bb) & 0xFFFFFFFF, (c + cc) & 0xFFFFFFFF, (d + dd) & 0xFFFFFFFF
    return struct.pack('<4I', a, b, c, d).hex()


def png_1x1() -> bytes:
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xFFFFFFFF)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 1, 1, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(b'\x00\xff\x00\x00')) + chunk(b'IEND', b''))


assert md4(b'') == '31d6cfe0d16ae931b73c59d7e0c089c0' and md4(b'abc') == 'a448017aaf21d8525fc10ae87aa6729d'
src, out = sys.argv[1], sys.argv[2]
png = png_1x1(); name = md4(png) + '.png'
with zipfile.ZipFile(src) as zin, zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        data = zin.read(item.filename)
        if item.filename.endswith('.mscx'):
            text = data.decode('utf-8')
            image = f'<Image>\n<path>{name}</path>\n<size w="20" h="20"/>\n<sizeIsSpatium>1</sizeIsSpatium>\n</Image>\n'
            assert '</VBox>' in text
            text = text.replace('</VBox>', image + '</VBox>', 1)
            data = text.encode('utf-8')
        zout.writestr(item, data)
    zout.writestr('Pictures/' + name, png)
print(name)
