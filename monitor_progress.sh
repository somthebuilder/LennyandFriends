#!/bin/bash
# Quick progress monitor for knowledge base build

echo "📊 Knowledge Base Build Progress Monitor"
echo "=========================================="
echo ""

# Check if process is running
if ps aux | grep -q "[b]uild_knowledge_base.py"; then
    echo "✅ Build Process: Running"
    PID=$(ps aux | grep "[b]uild_knowledge_base.py" | grep -v grep | awk '{print $2}')
    echo "   PID: $PID"
else
    echo "❌ Build Process: Not running"
fi

echo ""

# Get latest progress
if [ -f "build.log" ]; then
    LATEST=$(tail -1 build.log)
    
    # Extract progress numbers - get the last progress line from log
    PROGRESS_LINE=$(grep "Extracting themes:" build.log | tail -1)
    if [ ! -z "$PROGRESS_LINE" ]; then
        # Get the LAST progress number (not the first, which is always 0/28329 from progress bar)
        PROGRESS=$(echo "$PROGRESS_LINE" | grep -oE "[0-9]+/[0-9]+" | tail -1)
        if [ ! -z "$PROGRESS" ]; then
            CURRENT=$(echo $PROGRESS | cut -d'/' -f1)
            TOTAL=$(echo $PROGRESS | cut -d'/' -f2)
            PERCENT=$(echo "scale=2; $CURRENT * 100 / $TOTAL" | bc)
            echo "📈 Progress: $PROGRESS chunks"
            echo "   Percentage: ${PERCENT}%"
            echo "   Remaining: $((TOTAL - CURRENT)) chunks"
            
            # Calculate estimated time
            if echo "$LATEST" | grep -q "\[.*\]"; then
                ETA=$(echo "$LATEST" | grep -oE "\[.*\]" | tail -1)
                echo "   ETA: $ETA"
            fi
        fi
    else
        echo "📝 Latest log entry:"
        echo "   $LATEST" | head -c 100
        echo "..."
    fi
else
    echo "⚠️  build.log not found"
fi

echo ""
echo "💡 Tip: Run 'tail -f build.log' to watch live updates"

