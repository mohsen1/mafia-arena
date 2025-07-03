'use client';

import React, { useMemo, useState, useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  Bot,
  CloudCog,
  Sparkles,
  Zap,
  Brain,
  Cpu,
  Server,
  Cloud,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';

import { availableModelsByProvider } from '@/lib/models';
import type { AvailableProvider } from '@/lib/utils/providerUtils';

interface EnhancedProviderModelSelectorProps {
  idPrefix: string;
  selectedModel?: string;
  selectedProviderValue?: string;
  onProviderModelChange: (provider: string, model: string) => void;
  availableProviders: AvailableProvider[];
  className?: string;
  disabled?: boolean;
  selectTriggerClassName?: string;
  mode?: 'both' | 'provider' | 'model';
  label?: string;
}

interface ProviderStatus {
  available: boolean;
  checking: boolean;
  message?: string;
}

// Provider icons mapping
const PROVIDER_ICONS: Record<string, React.ReactNode> = {
  openai: <Brain className="w-4 h-4" />,
  anthropic: <Sparkles className="w-4 h-4" />,
  claude: <Sparkles className="w-4 h-4" />,
  gemini: <Zap className="w-4 h-4" />,
  groq: <Cpu className="w-4 h-4" />,
  ollama_local: <Server className="w-4 h-4" />,
  fireworks: <Cloud className="w-4 h-4" />,
};

export const EnhancedProviderModelSelector = React.memo(
  function EnhancedProviderModelSelector({
    idPrefix,
    selectedModel,
    selectedProviderValue,
    onProviderModelChange,
    availableProviders,
    className,
    disabled = false,
    selectTriggerClassName = 'w-full h-11',
    mode = 'both',
    label,
  }: EnhancedProviderModelSelectorProps) {
    const { t } = useTranslation();
    const [providerStatuses, setProviderStatuses] = useState<
      Record<string, ProviderStatus>
    >({});

    const selectedProvider = useMemo(() => {
      return availableProviders.find((p) => p.value === selectedProviderValue);
    }, [availableProviders, selectedProviderValue]);

    const currentModels = useMemo(() => {
      return availableModelsByProvider[selectedProvider?.value ?? ''] ?? [];
    }, [selectedProvider?.value]);

    const isSelectedModelValid = useMemo(() => {
      if (!selectedModel) return false;
      return currentModels.some((model) => model.value === selectedModel);
    }, [selectedModel, currentModels]);

    const validModelValue = isSelectedModelValid ? selectedModel : '';

    const handleProviderChange = useCallback(
      (newProviderValue: string) => {
        const modelsForNewProvider =
          availableModelsByProvider[newProviderValue];
        if (!modelsForNewProvider?.length) {
          return;
        }

        const defaultModel =
          modelsForNewProvider.find((m) =>
            m.title.toLowerCase().includes('default')
          )?.value ?? modelsForNewProvider[0].value;

        if (mode !== 'model') {
          onProviderModelChange(newProviderValue, defaultModel);
        }
      },
      [onProviderModelChange, mode]
    );

    const handleModelChange = useCallback(
      (newModelValue: string) => {
        if (mode !== 'provider' && selectedProvider) {
          onProviderModelChange(selectedProvider.value, newModelValue);
        }
      },
      [selectedProvider, onProviderModelChange, mode]
    );

    const providerSelectId = `${idPrefix}-provider`;
    const modelSelectId = `${idPrefix}-model`;

    // Check provider availability when component mounts or providers change
    useEffect(() => {
      const checkProviderStatus = async (provider: string) => {
        setProviderStatuses((prev) => ({
          ...prev,
          [provider]: { available: false, checking: true },
        }));

        try {
          // Special handling for Ollama
          if (provider === 'ollama_local') {
            const response = await fetch('http://localhost:11434/api/tags');
            const available = response.ok;
            setProviderStatuses((prev) => ({
              ...prev,
              [provider]: {
                available,
                checking: false,
                message: available ? 'Connected' : 'Not running',
              },
            }));
          } else {
            // For other providers, assume they're available if they're in the list
            setProviderStatuses((prev) => ({
              ...prev,
              [provider]: {
                available: true,
                checking: false,
                message: 'Ready',
              },
            }));
          }
        } catch {
          setProviderStatuses((prev) => ({
            ...prev,
            [provider]: {
              available: false,
              checking: false,
              message: 'Connection failed',
            },
          }));
        }
      };

      // Check status for each provider
      availableProviders.forEach((provider) => {
        checkProviderStatus(provider.value);
      });
    }, [availableProviders]);

    const getProviderIcon = (provider: string) => {
      switch (provider) {
        case 'openai':
          return Brain;
        case 'claude':
          return Sparkles;
        case 'gemini':
          return Zap;
        case 'groq':
          return Cpu;
        case 'ollama_local':
          return Server;
        case 'fireworks':
          return Cloud;
        default:
          return Brain;
      }
    };

    const getProviderStatusIcon = (status: ProviderStatus | undefined) => {
      if (!status) return null;
      if (status.checking) return <Loader2 className="h-3 w-3 animate-spin" />;
      if (status.available)
        return <CheckCircle2 className="h-3 w-3 text-green-500" />;
      return <AlertCircle className="h-3 w-3 text-yellow-500" />;
    };

    const getSourceBadgeVariant = (source: string) => {
      switch (source) {
        case 'user':
          return 'secondary';
        case 'env':
          return 'default';
        case 'both':
          return 'outline';
        default:
          return 'default';
      }
    };

    const getSourceBadgeColor = (source: string) => {
      switch (source) {
        case 'user':
          return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
        case 'env':
          return 'bg-green-500/10 text-green-600 dark:text-green-400';
        case 'both':
          return 'bg-purple-500/10 text-purple-600 dark:text-purple-400';
        default:
          return '';
      }
    };

    return (
      <div className={cn('space-y-3', className)}>
        {label && (
          <Label htmlFor="provider-select" className="text-sm font-medium">
            {label}
          </Label>
        )}

        <div className="space-y-3">
          <Select
            value={selectedProviderValue}
            onValueChange={handleProviderChange}
            disabled={disabled}
          >
            <SelectTrigger
              id={providerSelectId}
              className={cn(
                selectTriggerClassName,
                'text-left justify-between hover:bg-secondary/50 transition-colors'
              )}
            >
              <span className="flex items-center gap-2 truncate">
                {selectedProvider && PROVIDER_ICONS[selectedProvider.value] ? (
                  <span className="text-primary">
                    {PROVIDER_ICONS[selectedProvider.value]}
                  </span>
                ) : (
                  <CloudCog className="w-4 h-4 text-muted-foreground" />
                )}
                <SelectValue
                  placeholder={t(
                    'SelectProviderPlaceholder',
                    'Select AI Provider'
                  )}
                />
                {selectedProvider?.source === 'user' && (
                  <Badge variant="outline" className="text-xs ms-auto">
                    USER
                  </Badge>
                )}
                {process.env.NODE_ENV === 'development' &&
                  process.env.NEXT_PUBLIC_DISABLE_GROQ_DEV_MODE !== 'true' &&
                  selectedProvider?.value === 'groq' && (
                    <Badge variant="secondary" className="text-xs ms-auto">
                      DEV
                    </Badge>
                  )}
              </span>
            </SelectTrigger>
            <SelectContent className="max-h-[300px]">
              {availableProviders.map((provider) => {
                const status = providerStatuses[provider.value];
                const Icon = getProviderIcon(provider.value);
                return (
                  <SelectItem
                    key={provider.value}
                    value={provider.value}
                    className={cn(
                      'cursor-pointer py-3 px-3',
                      'hover:bg-accent/50 focus:bg-accent/50',
                      'transition-colors duration-150',
                      status && !status.available && 'opacity-75'
                    )}
                  >
                    <div className="flex items-center gap-3 w-full">
                      <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">
                            {provider.title}
                          </span>
                          {status && (
                            <span className="text-xs text-muted-foreground">
                              ({status.message})
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        {getProviderStatusIcon(status)}
                        {provider.source && (
                          <Badge
                            variant={getSourceBadgeVariant(provider.source)}
                            className={cn(
                              'text-[10px] px-1.5 py-0 h-4',
                              getSourceBadgeColor(provider.source)
                            )}
                          >
                            {provider.source}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          {(mode === 'both' || mode === 'model') && (
            <div
              className={cn(
                'flex flex-col items-start justify-start gap-1 w-full',
                mode === 'both' ? 'sm:w-1/2' : ''
              )}
            >
              <Select
                key={`${selectedProvider?.value}-model`}
                value={validModelValue}
                onValueChange={handleModelChange}
                disabled={disabled || currentModels.length === 0}
              >
                <SelectTrigger
                  id={modelSelectId}
                  className={cn(
                    selectTriggerClassName,
                    'text-left justify-between hover:bg-secondary/50 transition-colors'
                  )}
                >
                  <span className="flex items-center gap-2 truncate">
                    <Bot className="w-4 h-4 text-primary" />
                    <SelectValue
                      placeholder={t(
                        'SelectModelPlaceholder',
                        'Select AI Model'
                      )}
                    />
                  </span>
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {currentModels.length === 0 ? (
                    <SelectItem
                      key="loading..."
                      value="loading"
                      disabled
                      className="text-xs italic text-muted-foreground"
                    >
                      {t(
                        'NoModelsForProvider',
                        'No models available for selected provider'
                      )}
                    </SelectItem>
                  ) : (
                    currentModels.map((model) => (
                      <SelectItem
                        key={model.value}
                        value={model.value}
                        className="py-2"
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">{model.title}</span>
                          {model.value.includes('gpt-4') && (
                            <span className="text-xs text-muted-foreground">
                              Advanced reasoning
                            </span>
                          )}
                          {model.value.includes('gpt-3.5') && (
                            <span className="text-xs text-muted-foreground">
                              Fast & efficient
                            </span>
                          )}
                          {model.value.includes('claude-3-opus') && (
                            <span className="text-xs text-muted-foreground">
                              Most capable
                            </span>
                          )}
                          {model.value.includes('claude-3-sonnet') && (
                            <span className="text-xs text-muted-foreground">
                              Balanced performance
                            </span>
                          )}
                          {model.value.includes('gemini-2') && (
                            <span className="text-xs text-muted-foreground">
                              Latest multimodal
                            </span>
                          )}
                          {model.value.includes('llama') && (
                            <span className="text-xs text-muted-foreground">
                              Open source
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>
    );
  }
);
