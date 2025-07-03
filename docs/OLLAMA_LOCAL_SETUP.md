# Ollama Local Setup Guide for Werewolf AI

This guide provides comprehensive instructions for setting up and using Ollama with Werewolf AI, allowing you to run the game entirely locally without relying on cloud AI services.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [Configuration](#configuration)
5. [Model Management](#model-management)
6. [Using Ollama in Werewolf AI](#using-ollama-in-werewolf-ai)
7. [Performance Optimization](#performance-optimization)
8. [Troubleshooting](#troubleshooting)
9. [Advanced Configuration](#advanced-configuration)
10. [Security Considerations](#security-considerations)

## Overview

Ollama integration in Werewolf AI provides:
- **Complete Privacy**: All AI processing happens locally on your machine
- **No API Costs**: Free to use once models are downloaded
- **Offline Play**: No internet connection required after model download
- **Custom Models**: Use any Ollama-compatible model
- **Fast Response Times**: Low latency with local inference

## Prerequisites

### System Requirements

**Minimum Requirements:**
- 8GB RAM (16GB recommended)
- 10GB free disk space
- Modern CPU (Intel i5/AMD Ryzen 5 or better)
- macOS, Linux, or Windows (with WSL2)

**Recommended for Best Performance:**
- 16GB+ RAM
- NVIDIA GPU with 6GB+ VRAM (optional but significantly faster)
- 50GB+ free disk space (for multiple models)
- Fast SSD storage

### Software Requirements
- Node.js 18+ and pnpm
- Git
- Terminal/Command Line access

## Installation

### macOS

```bash
# Install using Homebrew
brew install ollama

# Start Ollama service
brew services start ollama

# Verify installation
ollama --version
```

### Linux

```bash
# Download and install
curl -fsSL https://ollama.com/install.sh | sh

# Start Ollama service
sudo systemctl start ollama

# Enable auto-start
sudo systemctl enable ollama
```

### Windows

1. Install WSL2 if not already installed:
   ```powershell
   wsl --install
   ```

2. Inside WSL2, follow the Linux installation steps

### Docker

```bash
# Pull and run Ollama container
docker run -d -v ollama:/root/.ollama -p 11434:11434 --name ollama ollama/ollama

# Pull a model inside the container
docker exec -it ollama ollama pull llama3.2
```

## Configuration

### Basic Setup

1. **Start Ollama Service**
   ```bash
   # macOS
   brew services start ollama
   
   # Linux
   sudo systemctl start ollama
   
   # Manual start
   ollama serve
   ```

2. **Pull Recommended Models**
   ```bash
   # Fast, good for roleplay
   ollama pull llama3.2
   ollama pull mistral
   
   # Larger, more capable
   ollama pull llama3.1:8b
   ollama pull mixtral:8x7b
   ```

3. **Verify Models**
   ```bash
   # List installed models
   ollama list
   
   # Test a model
   ollama run llama3.2 "Hello, are you working?"
   ```

### Environment Variables

```bash
# Set custom host (for remote access)
export OLLAMA_HOST=0.0.0.0:11434

# Set model location (if not default)
export OLLAMA_MODELS=/path/to/models

# GPU configuration (NVIDIA)
export CUDA_VISIBLE_DEVICES=0

# CPU-only mode
export OLLAMA_NUM_GPU=0
```

## Model Management

### Recommended Models for Werewolf AI

| Model | Size | Speed | Quality | Best For |
|-------|------|-------|---------|----------|
| llama3.2 | 3.2GB | Very Fast | Good | Quick games, testing |
| mistral:7b | 4.1GB | Fast | Very Good | Balanced performance |
| llama3.1:8b | 4.7GB | Fast | Excellent | Rich character development |
| mixtral:8x7b | 26GB | Medium | Excellent | Complex narratives |
| phi-4-mini | 2.2GB | Very Fast | Good | Resource-constrained systems |

### Installing Models

```bash
# Basic installation
ollama pull model_name

# Specific version
ollama pull llama3.1:8b-instruct-q5_K_M

# List available tags
ollama list llama3.1
```

### Managing Storage

```bash
# Check model sizes
ollama list

# Remove unused models
ollama rm model_name

# Model location (default)
# macOS: ~/.ollama/models
# Linux: /usr/share/ollama/.ollama/models
```

## Using Ollama in Werewolf AI

### Starting a Game

1. **Navigate to New Game**
   - Go to http://localhost:3099/en/new

2. **Select Ollama Provider**
   - Click the AI Provider dropdown
   - Select "Local Ollama"

3. **Configure Connection (Optional)**
   - Click "Configure Ollama"
   - Default settings work for local setup
   - Test connection to see available models

4. **Choose Model**
   - Select from available models
   - Recommended: llama3.2 or mistral for balanced performance

5. **Start Game**
   - Configure other game settings
   - Click "Start Game"

### Using Different Models for Teams

Werewolf AI supports using different Ollama models for different teams, allowing you to experiment with model behaviors:

1. **Enable Separate Mafia Model**
   - Check "Use a separate AI engine for Mafia players"
   - A new dropdown appears for Mafia AI configuration

2. **Select Models**
   - **Town Model**: Choose a model for Doctor, Seer, and Villagers
   - **Mafia Model**: Choose a different model for Mafia players

3. **Example Configurations**
   ```
   Town: llama3.2 (friendly, cooperative)
   Mafia: mistral (strategic, deceptive)
   ```
   ```
   Town: phi-4-mini (fast, simple)
   Mafia: llama3.1:8b (complex reasoning)
   ```

4. **Testing Different Models**
   ```bash
   # Run the two-model test script
   pnpm test:ollama-two
   ```

### Configuration Options

**Basic Configuration:**
- Host: `localhost` (default)
- Port: `11434` (default)
- Protocol: `http` (default)

**Advanced Configuration:**
- Custom endpoints for remote Ollama
- HTTPS support for secure connections
- Custom API paths

## Performance Optimization

### Model Selection

**For Fast Games:**
```bash
# Quantized models for speed
ollama pull llama3.2:3b-instruct-q4_K_M
ollama pull mistral:7b-instruct-q4_0
```

**For Quality:**
```bash
# Larger, less quantized models
ollama pull llama3.1:8b-instruct-fp16
ollama pull mixtral:8x7b-instruct-v0.1-q5_K_M
```

### GPU Acceleration

**NVIDIA GPUs:**
```bash
# Check GPU detection
nvidia-smi

# Ollama should auto-detect NVIDIA GPUs
# Force GPU layers (optional)
OLLAMA_NUM_GPU=999 ollama serve
```

**Apple Silicon:**
- Automatically uses Metal acceleration
- No configuration needed

**AMD GPUs:**
```bash
# Experimental support
HSA_OVERRIDE_GFX_VERSION=10.3.0 ollama serve
```

### Memory Management

```bash
# Limit context size for lower memory usage
OLLAMA_MAX_LOADED_MODELS=1 ollama serve

# Adjust number of parallel requests
OLLAMA_MAX_QUEUE=1 ollama serve
```

### Concurrent Games

For multiple simultaneous games:
```bash
# Increase parallel processing
OLLAMA_NUM_PARALLEL=4 ollama serve

# Pre-load models
ollama run llama3.2 ""  # Loads model into memory
```

## Troubleshooting

### Common Issues

**1. Connection Refused**
```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Start Ollama manually
ollama serve

# Check logs
journalctl -u ollama -f  # Linux
brew services info ollama  # macOS
```

**2. Model Not Found**
```bash
# List available models
ollama list

# Pull missing model
ollama pull model_name
```

**3. Slow Performance**
- Check available RAM: `free -h` (Linux) or Activity Monitor (macOS)
- Use smaller/quantized models
- Close other applications
- Enable GPU acceleration if available

**4. Out of Memory**
```bash
# Use smaller models
ollama pull phi-4-mini:3.8b-q4_K_M

# Reduce context size
OLLAMA_NUM_CTX=2048 ollama serve
```

### Debug Mode

```bash
# Enable debug logging
OLLAMA_DEBUG=1 ollama serve

# Verbose API logging
OLLAMA_LOG_LEVEL=debug ollama serve
```

## Advanced Configuration

### Remote Access

**1. Configure Ollama for Network Access**
```bash
# Allow connections from any IP
OLLAMA_HOST=0.0.0.0:11434 ollama serve
```

**2. Firewall Configuration**
```bash
# Linux (ufw)
sudo ufw allow 11434/tcp

# macOS
# System Preferences > Security & Privacy > Firewall Options
```

**3. Nginx Reverse Proxy**
```nginx
server {
    listen 443 ssl;
    server_name ollama.yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:11434;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;
    }
}
```

### Custom Models

**1. Create Modelfile**
```dockerfile
# Modelfile
FROM llama3.2

# Set custom parameters
PARAMETER temperature 0.8
PARAMETER top_p 0.9
PARAMETER repeat_penalty 1.1

# Custom system prompt for Werewolf
SYSTEM You are a character in a Werewolf/Mafia game. Roleplay naturally and stay in character.
```

**2. Build Custom Model**
```bash
ollama create werewolf-llama -f Modelfile
```

### API Integration

**Direct API Usage:**
```bash
# Chat completion
curl -X POST http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama3.2",
    "messages": [
      {"role": "user", "content": "Hello"}
    ]
  }'

# List models
curl http://localhost:11434/api/tags
```

## Security Considerations

### Local Network Security

1. **Restrict Access**
   ```bash
   # Only allow local connections (default)
   OLLAMA_HOST=127.0.0.1:11434 ollama serve
   ```

2. **Authentication (Custom Setup)**
   - Use reverse proxy with authentication
   - Implement API key validation
   - Use HTTPS for remote connections

### Model Security

- Only download models from trusted sources
- Verify model checksums when available
- Keep Ollama updated for security patches

## Best Practices

### For Game Performance

1. **Pre-warm Models**
   - Start Ollama before playing
   - Load frequently used models in advance

2. **Model Selection**
   - Use llama3.2 or mistral for quick responses
   - Use larger models only when needed

3. **Resource Management**
   - Close unnecessary applications
   - Monitor system resources during play

### For Development

1. **Testing**
   ```bash
   # Use consistent model for testing
   export OLLAMA_MODEL=llama3.2
   
   # Enable debug logging
   export DEBUG=mafia:*
   ```

2. **Error Handling**
   - Implement connection retry logic
   - Provide fallback options
   - Clear error messages for users

## Conclusion

Ollama integration provides a powerful way to run Werewolf AI completely locally. With proper setup and model selection, you can enjoy rich, AI-powered gameplay without internet connectivity or API costs.

For additional help:
- Ollama Documentation: https://github.com/ollama/ollama
- Werewolf AI Issues: https://github.com/your-repo/werewolf-ai/issues
- Community Discord: [Your Discord Link]

Happy gaming! 🐺🤖 