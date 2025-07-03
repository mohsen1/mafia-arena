#!/bin/bash

# Demo script for testing Werewolf AI with two different Ollama models

echo "🎮 Werewolf AI - Two Ollama Models Demo"
echo "======================================="
echo ""

# Check if Ollama is installed
if ! command -v ollama &> /dev/null; then
    echo "❌ Ollama is not installed. Please install it first:"
    echo "   brew install ollama (macOS)"
    echo "   curl -fsSL https://ollama.com/install.sh | sh (Linux)"
    exit 1
fi

# Check if Ollama is running
if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "⚠️  Ollama is not running. Starting Ollama..."
    ollama serve &
    sleep 3
fi

echo "✅ Ollama is running"
echo ""

# Check available models
echo "📦 Checking available models..."
MODELS=$(ollama list | tail -n +2 | awk '{print $1}')

if [ -z "$MODELS" ]; then
    echo "No models found. Let's download some..."
    echo ""
fi

# Ensure we have at least two models
TOWN_MODEL="llama3.2"
MAFIA_MODEL="mistral"

echo "🤖 Ensuring required models are available..."
echo ""

# Pull Town model if not available
if ! echo "$MODELS" | grep -q "$TOWN_MODEL"; then
    echo "📥 Downloading $TOWN_MODEL for Town players..."
    ollama pull $TOWN_MODEL
else
    echo "✅ $TOWN_MODEL is already available"
fi

# Pull Mafia model if not available
if ! echo "$MODELS" | grep -q "$MAFIA_MODEL"; then
    echo "📥 Downloading $MAFIA_MODEL for Mafia players..."
    ollama pull $MAFIA_MODEL
else
    echo "✅ $MAFIA_MODEL is already available"
fi

echo ""
echo "🎯 Models ready!"
echo "  - Town players will use: $TOWN_MODEL"
echo "  - Mafia players will use: $MAFIA_MODEL"
echo ""

# Run the test
echo "🚀 Starting two-model game test..."
echo ""
echo "This will:"
echo "1. Create 6 AI players (2 Mafia, 1 Doctor, 1 Seer, 2 Villagers)"
echo "2. Assign $MAFIA_MODEL to Mafia players"
echo "3. Assign $TOWN_MODEL to Town players"
echo "4. Run a complete game"
echo ""

read -p "Press Enter to start the game..."

# Run the test script
pnpm test:ollama-two

echo ""
echo "🎮 Demo complete!"
echo ""
echo "To use two models in the web UI:"
echo "1. Go to http://localhost:3099/en/new"
echo "2. Select 'Local Ollama' as the AI provider"
echo "3. Check 'Use a separate AI engine for Mafia players'"
echo "4. Select different models for Town and Mafia"
echo "5. Start the game!" 