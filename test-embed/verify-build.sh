#!/bin/bash
# Verification script for embedded build

echo "🔍 Verifying embedded build setup..."
echo ""

# Check if out/ directory exists
if [ ! -d "../out" ]; then
    echo "❌ Build directory not found: ../out"
    echo "   Run: npm run build:embed"
    exit 1
fi

# Check if index.html exists
if [ ! -f "../out/index.html" ]; then
    echo "❌ index.html not found in build"
    exit 1
fi

# Check for base tag
echo "1. Checking for base tag in index.html..."
BASE_TAG=$(grep -o '<base[^>]*>' ../out/index.html)
if [ -z "$BASE_TAG" ]; then
    echo "   ❌ Base tag NOT found"
    echo "   This will cause 404 errors for WASM files"
    exit 1
else
    echo "   ✅ Found: $BASE_TAG"
fi

# Check for WASM files
echo ""
echo "2. Checking for WASM files..."
WASM_FILES=(
    "webmscore.lib.wasm"
    "webmscore.lib.data"
    "webmscore.lib.mem.wasm"
)

for file in "${WASM_FILES[@]}"; do
    if [ -f "../out/$file" ]; then
        SIZE=$(ls -lh "../out/$file" | awk '{print $5}')
        echo "   ✅ $file ($SIZE)"
    else
        echo "   ❌ $file NOT found"
        exit 1
    fi
done

# Check for static data
echo ""
echo "3. Checking for static data files..."
DATA_FILES=(
    "data/clefs.json"
    "data/templates.json"
)

for file in "${DATA_FILES[@]}"; do
    if [ -f "../out/$file" ]; then
        SIZE=$(ls -lh "../out/$file" | awk '{print $5}')
        echo "   ✅ $file ($SIZE)"
    else
        echo "   ⚠️  $file NOT found (non-critical)"
    fi
done

echo ""
echo "✨ Build verification complete!"
echo ""
echo "Next steps:"
echo "  1. Start test server: npm run test:embed"
echo "  2. Open browser: http://localhost:8080/"
echo "  3. Check console for WASM loading messages"
echo ""
