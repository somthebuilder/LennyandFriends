#!/bin/bash
# Wrapper script to run slug generation in background with auto-resume

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$SCRIPT_DIR/../slug_generation.log"
PID_FILE="$SCRIPT_DIR/../slug_generation.pid"

cd "$SCRIPT_DIR/.."

# Check if already running
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if ps -p "$OLD_PID" > /dev/null 2>&1; then
        echo "⚠️  Slug generation already running (PID: $OLD_PID)"
        echo "   Log: $LOG_FILE"
        tail -20 "$LOG_FILE"
        exit 1
    else
        # Stale PID file
        rm "$PID_FILE"
    fi
fi

# Start in background
echo "🚀 Starting slug generation in background..."
echo "   Log file: $LOG_FILE"
echo "   PID file: $PID_FILE"
echo ""

nohup python3 "$SCRIPT_DIR/generate_panel_slugs.py" --use-supabase > "$LOG_FILE" 2>&1 &
NEW_PID=$!

echo $NEW_PID > "$PID_FILE"
echo "✅ Started with PID: $NEW_PID"
echo ""
echo "To monitor progress:"
echo "  tail -f $LOG_FILE"
echo ""
echo "To stop:"
echo "  kill $NEW_PID"
echo "  rm $PID_FILE"
echo ""
echo "The script will automatically:"
echo "  - Resume from where it left off if interrupted"
echo "  - Save progress after each slug"
echo "  - Retry failed requests"
echo ""
echo "Checking initial output..."
sleep 2
tail -10 "$LOG_FILE"

