# Ollama Integration Guide

Werewolf AI supports running games with locally hosted AI models through Ollama, providing a completely self-hosted AI experience.

## Overview

Ollama integration allows you to:
- Run AI agents using local models without external API calls
- Use custom Ollama endpoints (localhost or remote servers)
- Configure connection settings with a user-friendly UI
- Test connections and discover available models
- Use any Ollama-compatible model for game agents

## Prerequisites

1. **Install Ollama**: Download and install from [ollama.ai](https://ollama.ai)
2. **Start Ollama Server**: Run `ollama serve` in your terminal
3. **Pull Models**: Download at least one model, e.g., `ollama pull llama3.1`

## Configuration

### Basic Setup

1. **Start a New Game**
   - Navigate to the "Start New Game" page
   - Select "Local Ollama" from the AI Provider dropdown

2. **Configure Connection**
   - Click "Configure Ollama" button
   - Default settings (localhost:11434) work for most local setups
   - Click "Test Connection" to verify

3. **Select Model**
   - Choose from available Ollama models in the model dropdown
   - Popular options include Llama 3.1, Mistral, and Codellama

### Advanced Configuration

For custom setups, click "Advanced Settings" in the Ollama configuration panel:

- **Host**: Change from localhost to any hostname/IP
- **Port**: Modify default port 11434
- **Protocol**: Switch between HTTP and HTTPS
- **API Path**: Customize the API endpoint path (default: /v1)

### Example Configurations

#### Local Development (Default)
```
Host: localhost
Port: 11434
Protocol: HTTP
API Path: /v1
Endpoint: http://localhost:11434/v1
```

#### Remote Server
```
Host: ollama.myserver.com
Port: 8080
Protocol: HTTPS
API Path: /v1
Endpoint: https://ollama.myserver.com:8080/v1
```

#### Docker Container
```
Host: host.docker.internal
Port: 11434
Protocol: HTTP
API Path: /v1
Endpoint: http://host.docker.internal:11434/v1
```

## Available Models

Werewolf AI includes presets for popular Ollama models:

### General Purpose
- **Llama 3.1** (8B/70B) - Meta's latest model, excellent for roleplay
- **Mistral** (7B) - Fast and efficient
- **Gemma 3** (9B) - Google's efficient model
- **Qwen3** (8B) - Alibaba's multilingual model
- **Phi-4 Mini** (3.8B) - Microsoft's small reasoning model

### Specialized
- **Codellama** - For technical discussions
- **DeepSeek Coder V2** - Advanced coding capabilities
- **LLaVA** - Vision-language model (if using images)

### Installing Models

To install a model:
```bash
# Basic models
ollama pull llama3.1
ollama pull mistral
ollama pull codellama

# Specific versions
ollama pull llama3.1:8b-instruct-q5_K_M
ollama pull mistral:7b-instruct-v0.3
```

## Troubleshooting

### Connection Failed

1. **Verify Ollama is Running**
   ```bash
   # Check if Ollama is running
   curl http://localhost:11434/api/tags
   ```

2. **Check Firewall**
   - Ensure port 11434 (or custom port) is accessible
   - For remote connections, check firewall rules

3. **Verify Models are Installed**
   ```bash
   # List installed models
   ollama list
   ```

### Performance Issues

1. **Model Size**: Smaller models (3B-8B) run faster
2. **Quantization**: Use quantized versions (e.g., q5_K_M)
3. **Hardware**: Ensure adequate RAM/VRAM for chosen model

### Remote Access

To allow remote connections to Ollama:

1. **Set Environment Variable**
   ```bash
   OLLAMA_HOST=0.0.0.0:11434 ollama serve
   ```

2. **Configure Firewall**
   - Open port 11434 for incoming connections
   - Use HTTPS for production environments

## Best Practices

1. **Model Selection**
   - Use smaller models for faster response times
   - Match model size to available hardware
   - Test different models to find best fit

2. **Security**
   - Use HTTPS for remote connections
   - Implement authentication for public endpoints
   - Keep Ollama updated

3. **Performance**
   - Pre-load frequently used models
   - Monitor memory usage
   - Consider GPU acceleration for larger models

## Integration Features

### Automatic Endpoint Configuration
The Ollama endpoint is dynamically configured based on your settings. No hardcoded URLs!

### Connection Testing
Built-in connection testing shows:
- Connection status
- Available models
- Ollama version
- Error diagnostics

### Model Discovery
The UI automatically discovers and displays available models from your Ollama instance.

### Seamless Game Integration
Once configured, Ollama models work exactly like any other AI provider in the game.

## Environment Variables (Optional)

For server deployments, you can set:
```bash
OLLAMA_ENDPOINT=https://ollama.myserver.com:8080/v1
```

This will override the default endpoint for all Ollama connections.

## FAQ

**Q: Do I need an API key for Ollama?**
A: No, Ollama runs locally and doesn't require authentication by default.

**Q: Can I use custom models?**
A: Yes, any model available in your Ollama instance can be used.

**Q: How do I improve response speed?**
A: Use smaller, quantized models and ensure Ollama has adequate resources.

**Q: Can multiple players use the same Ollama instance?**
A: Yes, Ollama can handle multiple concurrent requests.

**Q: Is GPU required?**
A: No, but GPU acceleration significantly improves performance for larger models.

## Support

For Ollama-specific issues:
- Ollama Documentation: https://github.com/ollama/ollama
- Ollama Discord: https://discord.gg/ollama

For Werewolf AI integration issues:
- Open an issue on GitHub
- Check existing issues for solutions 