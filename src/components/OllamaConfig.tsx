'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle,
  XCircle,
  Loader2,
  Server,
  ExternalLink,
  AlertTriangle,
  Info,
} from 'lucide-react';

interface OllamaConfigProps {
  onConfigChange?: (config: OllamaConfiguration) => void;
  initialConfig?: OllamaConfiguration;
  className?: string;
}

export interface OllamaConfiguration {
  host: string;
  port: number;
  protocol: 'http' | 'https';
  apiPath: string;
  enabled: boolean;
}

const DEFAULT_OLLAMA_CONFIG: OllamaConfiguration = {
  host: 'localhost',
  port: 11434,
  protocol: 'http',
  apiPath: '/v1',
  enabled: true,
};

interface ConnectionTestResult {
  success: boolean;
  message: string;
  availableModels?: string[];
  ollamaVersion?: string;
}

export function OllamaConfig({
  onConfigChange,
  initialConfig = DEFAULT_OLLAMA_CONFIG,
  className,
}: OllamaConfigProps) {
  const [config, setConfig] = useState<OllamaConfiguration>(initialConfig);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] =
    useState<ConnectionTestResult | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Construct the full endpoint URL
  const endpointUrl = `${config.protocol}://${config.host}:${config.port}${config.apiPath}`;

  // Test connection to Ollama instance
  const testConnection = useCallback(async () => {
    setIsTestingConnection(true);
    setConnectionResult(null);

    try {
      // Test basic connectivity
      const healthUrl = `${config.protocol}://${config.host}:${config.port}/api/tags`;

      const response = await fetch(healthUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const models = data.models?.map((m: { name: string }) => m.name) || [];

      setConnectionResult({
        success: true,
        message: 'Successfully connected to Ollama instance',
        availableModels: models,
        ollamaVersion: data.version || 'Unknown',
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      setConnectionResult({
        success: false,
        message: `Failed to connect: ${errorMessage}`,
      });
    } finally {
      setIsTestingConnection(false);
    }
  }, [config]);

  // Update configuration
  const updateConfig = useCallback(
    (updates: Partial<OllamaConfiguration>) => {
      const newConfig = { ...config, ...updates };
      setConfig(newConfig);
      onConfigChange?.(newConfig);
      // Clear previous test results when config changes
      setConnectionResult(null);
    },
    [config, onConfigChange]
  );

  // Auto-test connection when component mounts if enabled
  useEffect(() => {
    if (config.enabled) {
      const timer = setTimeout(() => {
        testConnection();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [config.enabled, testConnection]);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="w-5 h-5" />
          Ollama Configuration
        </CardTitle>
        <CardDescription>
          Configure your local Ollama instance for AI model hosting.
          <Button
            variant="link"
            className="p-0 h-auto text-sm"
            onClick={() => window.open('https://ollama.ai', '_blank')}
          >
            Learn more about Ollama <ExternalLink className="w-3 h-3 ml-1" />
          </Button>
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Basic Configuration */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="ollama-host">Host</Label>
            <Input
              id="ollama-host"
              value={config.host}
              onChange={(e) => updateConfig({ host: e.target.value })}
              placeholder="localhost"
            />
          </div>
          <div>
            <Label htmlFor="ollama-port">Port</Label>
            <Input
              id="ollama-port"
              type="number"
              value={config.port}
              onChange={(e) =>
                updateConfig({ port: parseInt(e.target.value) || 11434 })
              }
              placeholder="11434"
            />
          </div>
        </div>

        {/* Endpoint Preview */}
        <div>
          <Label className="text-sm text-muted-foreground">Endpoint</Label>
          <div className="flex items-center gap-2 mt-1">
            <code className="flex-1 px-3 py-2 bg-muted rounded-md text-sm">
              {endpointUrl}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={testConnection}
              disabled={isTestingConnection}
            >
              {isTestingConnection ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Test'
              )}
            </Button>
          </div>
        </div>

        {/* Connection Status */}
        {connectionResult && (
          <Alert
            className={
              connectionResult.success
                ? 'border-green-200 bg-green-50'
                : 'border-red-200 bg-red-50'
            }
          >
            {connectionResult.success ? (
              <CheckCircle className="w-4 h-4 text-green-600" />
            ) : (
              <XCircle className="w-4 h-4 text-red-600" />
            )}
            <AlertDescription>
              <div className="space-y-2">
                <p>{connectionResult.message}</p>
                {connectionResult.success &&
                  connectionResult.availableModels && (
                    <div>
                      <p className="font-medium">
                        Available Models (
                        {connectionResult.availableModels.length}):
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {connectionResult.availableModels
                          .slice(0, 5)
                          .map((model) => (
                            <Badge
                              key={model}
                              variant="secondary"
                              className="text-xs"
                            >
                              {model}
                            </Badge>
                          ))}
                        {connectionResult.availableModels.length > 5 && (
                          <Badge variant="outline" className="text-xs">
                            +{connectionResult.availableModels.length - 5} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Advanced Configuration */}
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-sm"
          >
            Advanced Settings {showAdvanced ? '▼' : '▶'}
          </Button>

          {showAdvanced && (
            <div className="mt-3 space-y-3 pl-4 border-l-2 border-muted">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="ollama-protocol">Protocol</Label>
                  <select
                    id="ollama-protocol"
                    value={config.protocol}
                    onChange={(e) =>
                      updateConfig({
                        protocol: e.target.value as 'http' | 'https',
                      })
                    }
                    className="w-full px-3 py-2 border border-input rounded-md"
                  >
                    <option value="http">HTTP</option>
                    <option value="https">HTTPS</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="ollama-api-path">API Path</Label>
                  <Input
                    id="ollama-api-path"
                    value={config.apiPath}
                    onChange={(e) => updateConfig({ apiPath: e.target.value })}
                    placeholder="/v1"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Setup Instructions */}
        <Alert>
          <Info className="w-4 h-4" />
          <AlertDescription>
            <div className="space-y-2 text-sm">
              <p>
                <strong>Quick Setup:</strong>
              </p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>
                  Install Ollama from <code>ollama.ai</code>
                </li>
                <li>
                  Run <code>ollama serve</code> to start the server
                </li>
                <li>
                  Pull a model: <code>ollama pull llama3.1</code>
                </li>
                <li>Test the connection above</li>
              </ol>
            </div>
          </AlertDescription>
        </Alert>

        {/* Connection Issues Help */}
        {connectionResult && !connectionResult.success && (
          <Alert>
            <AlertTriangle className="w-4 h-4" />
            <AlertDescription>
              <div className="space-y-2 text-sm">
                <p>
                  <strong>Common Issues:</strong>
                </p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>
                    Ensure Ollama is running: <code>ollama serve</code>
                  </li>
                  <li>Check if port {config.port} is available</li>
                  <li>Verify firewall settings allow connections</li>
                  <li>For remote connections, check Ollama CORS settings</li>
                </ul>
              </div>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
