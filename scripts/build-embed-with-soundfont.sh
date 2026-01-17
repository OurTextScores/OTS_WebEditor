#!/bin/bash
# Build script for embed version with soundfont

set -e

echo "🎵 Building embed version with soundfont support..."
echo ""

# Build the embed version (without soundfont in public/ to avoid OOM)
echo "Step 1: Building Next.js static export..."
npm run build:embed

# Create soundfonts directory in output
echo ""
echo "Step 2: Adding soundfont to build output..."
mkdir -p out/soundfonts

# Copy soundfont from backup if available
if [ -f ~/soundfonts.backup/default.sf2 ]; then
    echo "   Copying default.sf2 (142MB) from backup..."
    cp ~/soundfonts.backup/default.sf2 out/soundfonts/default.sf2
    echo "   ✅ Soundfont copied successfully"
elif [ -f ~/soundfonts/default.sf2 ]; then
    echo "   Copying default.sf2 (142MB) from ~/soundfonts..."
    cp ~/soundfonts/default.sf2 out/soundfonts/default.sf2
    echo "   ✅ Soundfont copied successfully"
else
    echo "   ⚠️  Warning: No soundfont found at ~/soundfonts.backup/default.sf2"
    echo "   Audio playback will not work without a soundfont"
    echo "   To add a soundfont, place it at out/soundfonts/default.sf2 or default.sf3"
fi

echo ""
echo "✨ Embed build complete!"
echo ""
echo "Build output: out/"
echo "   - Score editor: out/index.html"
echo "   - Soundfont: out/soundfonts/default.sf2 (if found)"
echo ""
echo "Next steps:"
echo "   1. Test locally: npm run test:embed"
echo "   2. Package for release: npm run package:release"
echo ""
