#!/usr/bin/env node

/**
 * Check Azure OpenAI deployments and available models
 * 
 * Usage:
 *   node scripts/check-azure-models.js
 * 
 * Reads from .env file:
 *   AZURE_OPENAI_ENDPOINT
 *   AZURE_OPENAI_API_KEY
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Load .env file
function loadEnv() {
  try {
    const envPath = join(rootDir, '.env');
    const envFile = readFileSync(envPath, 'utf-8');
    const env = {};
    
    envFile.split('\n').forEach(line => {
      line = line.trim();
      if (line && !line.startsWith('#')) {
        const [key, ...valueParts] = line.split('=');
        const value = valueParts.join('=').replace(/^["']|["']$/g, '');
        env[key.trim()] = value.trim();
      }
    });
    
    return env;
  } catch (error) {
    console.error('❌ Error reading .env file:', error.message);
    console.error('\nMake sure you have a .env file in the project root with:');
    console.error('  AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com');
    console.error('  AZURE_OPENAI_API_KEY=your-api-key');
    process.exit(1);
  }
}

const env = loadEnv();

const AZURE_OPENAI_ENDPOINT = env.AZURE_OPENAI_ENDPOINT;
const AZURE_OPENAI_API_KEY = env.AZURE_OPENAI_API_KEY;

if (!AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_API_KEY) {
  console.error('❌ Error: Missing Azure OpenAI credentials in .env file');
  console.error('\nRequired variables:');
  console.error('  AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com');
  console.error('  AZURE_OPENAI_API_KEY=your-api-key');
  process.exit(1);
}

async function checkAzureModels() {
  try {
    console.log('🔍 Checking Azure OpenAI models...\n');
    console.log(`🌐 Endpoint: ${AZURE_OPENAI_ENDPOINT}\n`);

    // Try multiple API versions
    const apiVersions = ['2024-10-21', '2024-08-01-preview', '2024-06-01', '2024-02-01', '2023-12-01-preview'];
    
    let data = null;
    let successfulVersion = null;
    
    for (const apiVersion of apiVersions) {
      try {
        console.log(`Trying API version: ${apiVersion}...`);
        const modelsUrl = `${AZURE_OPENAI_ENDPOINT.replace(/\/$/, '')}/openai/models?api-version=${apiVersion}`;
        
        const response = await fetch(modelsUrl, {
          method: 'GET',
          headers: {
            'api-key': AZURE_OPENAI_API_KEY,
          },
        });

        if (response.ok) {
          data = await response.json();
          successfulVersion = apiVersion;
          console.log(`✅ Success with API version: ${apiVersion}\n`);
          break;
        } else {
          console.log(`❌ Failed with ${response.status}`);
        }
      } catch (err) {
        console.log(`❌ Error: ${err.message}`);
      }
    }

    if (!data) {
      throw new Error('Could not connect with any API version');
    }

    console.log(`📊 API Version: ${successfulVersion}\n`);

    if (!data.data || data.data.length === 0) {
      console.log('⚠️  No models found.');
      console.log('\nYou may need to create deployments in Azure Portal:');
      console.log('https://portal.azure.com → Azure OpenAI → Deployments');
      return;
    }

    console.log('📊 Available Models:');
    console.log('━'.repeat(100));
    console.log(`${'Model ID'.padEnd(40)} ${'Capabilities'.padEnd(40)} ${'Status'.padEnd(15)}`);
    console.log('━'.repeat(100));

    let totalModels = 0;
    const modelTypes = {};

    data.data.forEach(model => {
      const id = model.id || 'Unknown';
      let capabilities = 'Standard';
      if (model.capabilities) {
        if (Array.isArray(model.capabilities)) {
          capabilities = model.capabilities.join(', ');
        } else if (typeof model.capabilities === 'object') {
          capabilities = Object.keys(model.capabilities).filter(k => model.capabilities[k]).join(', ');
        } else {
          capabilities = String(model.capabilities);
        }
      }
      const status = model.status || 'Available';
      const type = model.object || 'model';
      
      console.log(
        `${id.padEnd(40)} ${capabilities.substring(0, 39).padEnd(40)} ${status.padEnd(15)}`
      );
      
      totalModels++;
      modelTypes[type] = (modelTypes[type] || 0) + 1;
    });

    console.log('━'.repeat(100));
    console.log(`\n📈 Summary:`);
    console.log(`   Total Models: ${totalModels}`);
    console.log(`   API Version: ${successfulVersion}`);

    console.log('\n🎯 Model Families:');
    const families = {};
    data.data.forEach(model => {
      const family = model.id.split('-')[0] || 'other';
      families[family] = (families[family] || 0) + 1;
    });
    Object.entries(families)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([family, count]) => {
        console.log(`   ${family}: ${count} model${count > 1 ? 's' : ''}`);
      });

    console.log('\n💡 Next Steps:');
    console.log('   1. Create a deployment for the model you want to use');
    console.log('   2. Use the deployment name (not model name) in your code');
    console.log('   3. Configure in Azure Portal → Model deployments');
    
    console.log('\n🔗 Azure Portal:');
    console.log('   https://portal.azure.com → Azure OpenAI → Model deployments');

  } catch (error) {
    console.error('❌ Error checking Azure models:', error.message);
    
    if (error.message.includes('404') || error.message.includes('Not Found')) {
      console.error('\n💡 Tip: Make sure your endpoint URL is correct.');
      console.error('   Format: https://YOUR-RESOURCE-NAME.openai.azure.com');
    } else if (error.message.includes('401') || error.message.includes('403')) {
      console.error('\n💡 Tip: Check your API key is correct.');
      console.error('   Find it in: Azure Portal → Azure OpenAI → Keys and Endpoint');
    }
    
    process.exit(1);
  }
}

checkAzureModels();

