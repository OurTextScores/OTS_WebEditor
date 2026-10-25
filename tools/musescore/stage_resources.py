"""Stage engraving .qrc resources into a plain directory keyed by alias (stand-in for Qt resources)."""
import filecmp, os, shutil, sys, xml.etree.ElementTree as ET

def stage_file(source, destination):
    if not os.path.exists(destination) or not filecmp.cmp(source, destination, shallow=False):
        shutil.copyfile(source, destination)

root, out = sys.argv[1], sys.argv[2]
qrcs = [os.path.join(root, "src/engraving/engraving.qrc")]
fonts = os.path.join(root, "src/engraving/data/fonts")
qrcs += [os.path.join(fonts, f) for f in sorted(os.listdir(fonts)) if f.endswith(".qrc")]
n = 0
for q in qrcs:
    base = os.path.dirname(q)
    for qres in ET.parse(q).getroot().iter("qresource"):
        prefix = (qres.get("prefix") or "/").strip("/")
        for f in qres.iter("file"):
            alias = f.get("alias") or f.text
            dst = os.path.join(out, prefix, alias)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            stage_file(os.path.normpath(os.path.join(base, f.text)), dst)
            n += 1
print(f"staged {n} files from {len(qrcs)} qrc into {out}")

# MPE articulation profiles, served as :/mpe/resources/*.json (Qt resources in desktop builds)
mpe = os.path.join(root, "src/framework/mpe/resources")
if os.path.isdir(mpe):
    os.makedirs(os.path.join(out, "mpe/resources"), exist_ok=True)
    for f in sorted(os.listdir(mpe)):
        if f.endswith(".json"):
            stage_file(os.path.join(mpe, f), os.path.join(out, "mpe/resources", f))

