#!/bin/bash

# LLM Visualization Setup Script

echo "🚀 Setting up LLM Visualization..."

# Check if yarn or npm is available
if command -v yarn &> /dev/null; then
    PKG_MANAGER="yarn"
    INSTALL_CMD="yarn install"
elif command -v npm &> /dev/null; then
    PKG_MANAGER="npm"
    INSTALL_CMD="npm install"
else
    echo "❌ Error: Neither yarn nor npm found. Please install Node.js and npm/yarn."
    exit 1
fi

echo "📦 Using package manager: $PKG_MANAGER"

# Install frontend dependencies
echo "📥 Installing frontend dependencies..."
$INSTALL_CMD

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

# Clean Next.js cache
if [ -d ".next" ]; then
    echo "🧹 Cleaning Next.js cache..."
    rm -rf .next
fi

echo ""
echo "✅ Frontend setup complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Start development server: $PKG_MANAGER dev"
echo "   2. Open http://localhost:3002"
echo ""
echo "🔧 Optional - Remote GPU Server:"
echo "   cd server"
echo "   python -m venv .venv"
echo "   source .venv/bin/activate"
echo "   pip install -r requirements.txt"
echo "   python main.py"
echo ""

