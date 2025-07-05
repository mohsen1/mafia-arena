#!/usr/bin/env tsx
/**
 * Ollama Manager Script
 * Utility for managing Ollama installation, models, and configuration
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import ora from 'ora';
import prompts from 'prompts';
import Table from 'cli-table3';

const execAsync = promisify(exec);

interface OllamaModel {
  name: string;
  model: string;
  size: number;
  digest: string;
  modified_at: string;
  details: {
    format: string;
    family: string;
    parameter_size: string;
    quantization_level: string;
  };
}

interface OllamaStatus {
  running: boolean;
  version?: string;
  endpoint: string;
  models?: OllamaModel[];
  error?: string;
}

// Recommended models for Werewolf AI
const RECOMMENDED_MODELS = [
  {
    name: 'llama3.2',
    description: 'Fast and efficient, great for quick games',
    size: '3.2GB',
    speed: 'Very Fast',
  },
  {
    name: 'mistral',
    description: 'Balanced performance and quality',
    size: '4.1GB',
    speed: 'Fast',
  },
  {
    name: 'llama3.1:8b',
    description: 'High quality responses, rich character development',
    size: '4.7GB',
    speed: 'Fast',
  },
  {
    name: 'phi-4-mini',
    description: 'Lightweight model for resource-constrained systems',
    size: '2.2GB',
    speed: 'Very Fast',
  },
];

class OllamaManager {
  private endpoint: string = 'http://localhost:11434';

  async checkStatus(): Promise<OllamaStatus> {
    try {
      const response = await fetch(`${this.endpoint}/api/tags`);
      if (!response.ok) {
        return {
          running: false,
          endpoint: this.endpoint,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();
      return {
        running: true,
        endpoint: this.endpoint,
        models: data.models || [],
        version: data.version,
      };
    } catch (error) {
      return {
        running: false,
        endpoint: this.endpoint,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async checkInstallation(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('which ollama');
      return !!stdout.trim();
    } catch {
      return false;
    }
  }

  async getVersion(): Promise<string | null> {
    try {
      const { stdout } = await execAsync('ollama --version');
      return stdout.trim();
    } catch {
      return null;
    }
  }

  async startService(): Promise<boolean> {
    const spinner = ora('Starting Ollama service...').start();
    
    try {
      // Try different methods based on OS
      if (process.platform === 'darwin') {
        // macOS with Homebrew
        await execAsync('brew services start ollama');
      } else if (process.platform === 'linux') {
        // Linux with systemd
        await execAsync('sudo systemctl start ollama');
      } else {
        // Fallback: start manually in background
        exec('ollama serve');
      }
      
      spinner.succeed('Ollama service started');
      
      // Wait a moment for service to initialize
      await new Promise(resolve => setTimeout(resolve, 2000));
      return true;
    } catch (error) {
      spinner.fail('Failed to start Ollama service');
      console.error(chalk.red(error));
      return false;
    }
  }

  async pullModel(modelName: string): Promise<boolean> {
    const spinner = ora(`Pulling model ${modelName}...`).start();
    
    try {
      // Use streaming to show progress
      const child = exec(`ollama pull ${modelName}`);
      
      child.stdout?.on('data', (data) => {
        const output = data.toString().trim();
        if (output.includes('%')) {
          spinner.text = output;
        }
      });

      await new Promise((resolve, reject) => {
        child.on('exit', (code) => {
          if (code === 0) {
            resolve(true);
          } else {
            reject(new Error(`Process exited with code ${code}`));
          }
        });
        child.on('error', reject);
      });

      spinner.succeed(`Model ${modelName} pulled successfully`);
      return true;
    } catch (error) {
      spinner.fail(`Failed to pull model ${modelName}`);
      console.error(chalk.red(error));
      return false;
    }
  }

  async removeModel(modelName: string): Promise<boolean> {
    const spinner = ora(`Removing model ${modelName}...`).start();
    
    try {
      await execAsync(`ollama rm ${modelName}`);
      spinner.succeed(`Model ${modelName} removed`);
      return true;
    } catch (error) {
      spinner.fail(`Failed to remove model ${modelName}`);
      console.error(chalk.red(error));
      return false;
    }
  }

  formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  displayModels(models: OllamaModel[]) {
    if (models.length === 0) {
      console.log(chalk.yellow('\nNo models installed'));
      return;
    }

    const table = new Table({
      head: ['Model', 'Size', 'Quantization', 'Modified'],
      style: { head: ['cyan'] },
    });

    models.forEach(model => {
      table.push([
        model.name,
        this.formatBytes(model.size),
        model.details.quantization_level || 'N/A',
        new Date(model.modified_at).toLocaleDateString(),
      ]);
    });

    console.log('\n' + table.toString());
  }

  displayRecommendedModels() {
    const table = new Table({
      head: ['Model', 'Size', 'Speed', 'Description'],
      style: { head: ['cyan'] },
      wordWrap: true,
      colWidths: [15, 10, 12, 50],
    });

    RECOMMENDED_MODELS.forEach(model => {
      table.push([
        model.name,
        model.size,
        model.speed,
        model.description,
      ]);
    });

    console.log('\n' + chalk.bold('Recommended Models for Werewolf AI:'));
    console.log(table.toString());
  }

  async interactiveSetup() {
    console.log(chalk.bold.blue('\n🐺 Werewolf AI - Ollama Setup Wizard\n'));

    // Check installation
    const isInstalled = await this.checkInstallation();
    if (!isInstalled) {
      console.log(chalk.red('❌ Ollama is not installed'));
      console.log('\nInstallation instructions:');
      
      if (process.platform === 'darwin') {
        console.log(chalk.cyan('  brew install ollama'));
      } else if (process.platform === 'linux') {
        console.log(chalk.cyan('  curl -fsSL https://ollama.com/install.sh | sh'));
      } else {
        console.log(chalk.cyan('  Visit https://ollama.com for installation instructions'));
      }
      
      return;
    }

    // Check if running
    let status = await this.checkStatus();
    if (!status.running) {
      const { startService } = await prompts({
        type: 'confirm',
        name: 'startService',
        message: 'Ollama service is not running. Start it now?',
        initial: true,
      });

      if (startService) {
        await this.startService();
        status = await this.checkStatus();
      }
    }

    if (!status.running) {
      console.log(chalk.red('\n❌ Ollama service is not running'));
      console.log('Please start it manually with: ' + chalk.cyan('ollama serve'));
      return;
    }

    console.log(chalk.green(`\n✅ Ollama is running at ${status.endpoint}`));
    
    // Display current models
    if (status.models && status.models.length > 0) {
      console.log(chalk.bold('\nInstalled Models:'));
      this.displayModels(status.models);
    }

    // Show recommended models
    this.displayRecommendedModels();

    // Ask what to do
    const { action } = await prompts({
      type: 'select',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { title: 'Install recommended models', value: 'install-recommended' },
        { title: 'Install a specific model', value: 'install-specific' },
        { title: 'Remove a model', value: 'remove' },
        { title: 'Test Ollama connection', value: 'test' },
        { title: 'Exit', value: 'exit' },
      ],
    });

    switch (action) {
      case 'install-recommended':
        await this.installRecommendedModels();
        break;
      case 'install-specific':
        await this.installSpecificModel();
        break;
      case 'remove':
        await this.removeModelInteractive(status.models || []);
        break;
      case 'test':
        await this.testConnection();
        break;
    }
  }

  async installRecommendedModels() {
    const { models } = await prompts({
      type: 'multiselect',
      name: 'models',
      message: 'Select models to install',
      choices: RECOMMENDED_MODELS.map(m => ({
        title: `${m.name} (${m.size})`,
        value: m.name,
        description: m.description,
      })),
    });

    for (const model of models) {
      await this.pullModel(model);
    }
  }

  async installSpecificModel() {
    const { modelName } = await prompts({
      type: 'text',
      name: 'modelName',
      message: 'Enter model name (e.g., llama3.1:70b):',
    });

    if (modelName) {
      await this.pullModel(modelName);
    }
  }

  async removeModelInteractive(models: OllamaModel[]) {
    if (models.length === 0) {
      console.log(chalk.yellow('No models to remove'));
      return;
    }

    const { modelToRemove } = await prompts({
      type: 'select',
      name: 'modelToRemove',
      message: 'Select model to remove',
      choices: models.map(m => ({
        title: `${m.name} (${this.formatBytes(m.size)})`,
        value: m.name,
      })),
    });

    if (modelToRemove) {
      const { confirm } = await prompts({
        type: 'confirm',
        name: 'confirm',
        message: `Are you sure you want to remove ${modelToRemove}?`,
        initial: false,
      });

      if (confirm) {
        await this.removeModel(modelToRemove);
      }
    }
  }

  async testConnection() {
    const spinner = ora('Testing Ollama connection...').start();
    
    try {
      const response = await fetch(`${this.endpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama3.2',
          prompt: 'Say hello in 5 words or less',
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      spinner.succeed('Connection test successful!');
      console.log(chalk.green('\nResponse: ') + data.response);
    } catch (error) {
      spinner.fail('Connection test failed');
      console.error(chalk.red(error));
    }
  }
}

// Main CLI
async function main() {
  const manager = new OllamaManager();
  
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    // Interactive mode
    await manager.interactiveSetup();
  } else {
    // Command mode
    const command = args[0];
    
    switch (command) {
      case 'status':
        const status = await manager.checkStatus();
        if (status.running) {
          console.log(chalk.green(`✅ Ollama is running at ${status.endpoint}`));
          if (status.models) {
            manager.displayModels(status.models);
          }
        } else {
          console.log(chalk.red('❌ Ollama is not running'));
          console.log(chalk.yellow(`Error: ${status.error}`));
        }
        break;
        
      case 'start':
        await manager.startService();
        break;
        
      case 'pull':
        if (args[1]) {
          await manager.pullModel(args[1]);
        } else {
          console.log(chalk.red('Please specify a model name'));
        }
        break;
        
      case 'remove':
        if (args[1]) {
          await manager.removeModel(args[1]);
        } else {
          console.log(chalk.red('Please specify a model name'));
        }
        break;
        
      case 'test':
        await manager.testConnection();
        break;
        
      case 'help':
      default:
        console.log(chalk.bold('\nOllama Manager for Werewolf AI\n'));
        console.log('Usage: pnpm ollama-manager [command] [args]\n');
        console.log('Commands:');
        console.log('  (no command)    Interactive setup wizard');
        console.log('  status          Check Ollama status and list models');
        console.log('  start           Start Ollama service');
        console.log('  pull <model>    Download a model');
        console.log('  remove <model>  Remove a model');
        console.log('  test            Test Ollama connection');
        console.log('  help            Show this help message');
        console.log('\nExamples:');
        console.log('  pnpm ollama-manager');
        console.log('  pnpm ollama-manager status');
        console.log('  pnpm ollama-manager pull llama3.2');
    }
  }
}

// Run the CLI
main().catch(console.error); 