#!/bin/bash
# Monitor the knowledge base build process

echo "=== Lenny Group Chat - Build Monitor ==="
echo ""

# Check if build process is running
if pgrep -f "build_knowledge_base.py" > /dev/null; then
    echo "✅ Build process is RUNNING"
    echo ""
else
    echo "❌ Build process is NOT running"
    echo "   Start it with: python3 scripts/build_knowledge_base.py"
    echo ""
fi

# Check knowledge base directory
if [ -d "knowledge_base" ]; then
    echo "📁 Knowledge Base Directory:"
    ls -lh knowledge_base/ 2>/dev/null | head -10
    echo ""
    
    # Check theme extractions
    if [ -f "knowledge_base/theme_extractions.json" ]; then
        EXTRACTIONS=$(jq 'length' knowledge_base/theme_extractions.json 2>/dev/null || echo "0")
        echo "📊 Theme Extractions: $EXTRACTIONS / 28,329 chunks"
        PERCENTAGE=$(echo "scale=2; $EXTRACTIONS * 100 / 28329" | bc 2>/dev/null || echo "0")
        echo "   Progress: ${PERCENTAGE}%"
        echo ""
    fi
    
    # Check if themes are created
    if [ -f "knowledge_base/themes.json" ]; then
        THEMES=$(jq 'length' knowledge_base/themes.json 2>/dev/null || echo "0")
        echo "🎯 Themes Created: $THEMES"
        echo ""
    fi
    
    # Check vector store
    if [ -d "knowledge_base/vector_store" ]; then
        echo "🗄️  Vector Store: EXISTS"
        echo ""
    fi
else
    echo "📁 Knowledge Base Directory: NOT CREATED YET"
    echo ""
fi

# Check build log
if [ -f "build.log" ]; then
    echo "📝 Recent Build Log (last 10 lines):"
    tail -10 build.log
    echo ""
fi

echo "=== End Monitor ==="

