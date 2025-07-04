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
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface OllamaConfigProps {
  onConfigChange?: (config: OllamaConfiguration) => void;
  initialConfig?: OllamaConfiguration;
  className?: string;
  disabled?: boolean;
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
  disabled = false,
}: OllamaConfigProps) {
  const [config, setConfig] = useState<OllamaConfiguration>(initialConfig);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] =
    useState<ConnectionTestResult | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { t } = useTranslation();

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
        message: t('ollama.connectionSuccess'),
        availableModels: models,
        ollamaVersion: data.version || 'Unknown',
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      setConnectionResult({
        success: false,
        message: `${t('ollama.connectionError')}: ${errorMessage}`,
      });
    } finally {
      setIsTestingConnection(false);
    }
  }, [config, t]);

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
          {t('ollama.title')}
        </CardTitle>
        <CardDescription>
          {t('ollama.description')}
          <Button
            variant="link"
            className="p-0 h-auto text-sm"
            onClick={() => window.open('https://ollama.ai', '_blank')}
          >
            {t('ollama.learnMore')} <ExternalLink className="w-3 h-3 ml-1" />
          </Button>
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Basic Configuration */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="ollama-host">{t('ollama.host')}</Label>
            <Input
              id="ollama-host"
              value={config.host}
              onChange={(e) => updateConfig({ host: e.target.value })}
              placeholder="localhost"
              disabled={disabled}
            />
          </div>
          <div>
            <Label htmlFor="ollama-port">{t('ollama.port')}</Label>
            <Input
              id="ollama-port"
              type="number"
              value={config.port}
              onChange={(e) =>
                updateConfig({ port: parseInt(e.target.value) || 11434 })
              }
              placeholder="11434"
              disabled={disabled}
            />
          </div>
        </div>

        {/* Endpoint Preview */}
        <div>
          <Label className="text-sm text-muted-foreground">
            {t('ollamaConfig.endpoint')}
          </Label>
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
                t('ollama.testConnection')
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
                  <Label htmlFor="ollama-protocol">
                    {t('ollama.protocol')}
                  </Label>
                  <Select
                    value={config.protocol}
                    onValueChange={(value: 'http' | 'https') =>
                      updateConfig({ protocol: value })
                    }
                    disabled={disabled}
                  >
                    <SelectTrigger id="ollama-protocol">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="http">
                        {t('ollamaConfig.http')}
                      </SelectItem>
                      <SelectItem value="https">
                        {t('ollamaConfig.https')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="ollama-api-path">{t('ollama.apiPath')}</Label>
                  <Input
                    id="ollama-api-path"
                    value={config.apiPath}
                    onChange={(e) => updateConfig({ apiPath: e.target.value })}
                    placeholder="/v1"
                    disabled={disabled}
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
                <strong>{t('ollama.setupInstructions')}:</strong>
              </p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>
                  {t('ollama.installOllama')} <code>ollama.ai</code>
                </li>
                <li>
                  {t('ollama.runServeCommand')} <code>ollama serve</code>{' '}
                  {t('ollama.toStartServer')}
                </li>
                <li>
                  {t('ollama.pullModel')} <code>ollama pull llama3.1</code>
                </li>
                <li>{t('ollama.testConnection')}</li>
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
                  <strong>{t('ollama.troubleshooting')}:</strong>
                </p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>
                    {t('ollama.ensureRunning')}: <code>ollama serve</code>
                  </li>
                  <li>
                    {t('ollama.checkFirewall')} {config.port}
                  </li>
                  <li>{t('ollama.checkFirewall')}</li>
                  <li>{t('ollama.forRemoteConnections')}</li>
                </ul>
              </div>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
