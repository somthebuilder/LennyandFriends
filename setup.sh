#!/bin/bash

echo "=========================================="
echo "Lenny and Friends - Full Stack Setup"
echo "=========================================="

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.8+ first."
    exit 1
fi

echo "✅ Python $(python3 --version) detected"

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found. Creating template..."
    cat > .env << EOF
# LLM API Keys (at least one required)
GEMINI_API_KEY=your_gemini_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
EOF
    echo "📝 Please edit .env and add your API keys"
    echo "   Then run this script again."
    exit 1
fi

echo "✅ .env file found"

# Install Python dependencies
echo ""
echo "📦 Installing Python dependencies..."
python3 -m pip install -r requirements.txt --quiet

if [ $? -ne 0 ]; then
    echo "❌ Failed to install Python dependencies"
    exit 1
fi

echo "✅ Python dependencies installed"

# Setup frontend
if [ -d "frontend" ]; then
    echo ""
    echo "📦 Setting up frontend..."
    cd frontend
    
    if ! command -v node &> /dev/null; then
        echo "⚠️  Node.js not found. Skipping frontend setup."
        echo "   Install Node.js 18+ and run: cd frontend && npm install"
    else
        npm install --quiet
        if [ $? -eq 0 ]; then
            echo "✅ Frontend dependencies installed"
        else
            echo "⚠️  Frontend setup had issues, but continuing..."
        fi
    fi
    
    cd ..
fi

echo ""
echo "=========================================="
echo "✅ Setup Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo ""
echo "1. Build the knowledge base (this takes ~47 hours):"
echo "   python3 scripts/build_knowledge_base.py"
echo ""
echo "2. Start the backend API (after knowledge base is built):"
echo "   python3 -m uvicorn src.api.main:app --reload"
echo ""
echo "3. Start the frontend (in another terminal):"
echo "   cd frontend && npm run dev"
echo ""
echo "4. Open http://localhost:3000 in your browser"
echo ""

