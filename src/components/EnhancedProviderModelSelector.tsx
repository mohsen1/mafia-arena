'use client';

import React, { useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Bot, CloudCog, Sparkles, Zap, Brain, Cpu, Server, Cloud } from 'lucide-react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';

import { availableModelsByProvider } from '@/lib/models';
import type { AvailableProvider } from '@/lib/utils/providerUtils';
import { getProviderDisplayTitle } from '@/lib/utils/providerUtils';

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

// Provider colors for badges
const PROVIDER_COLORS: Record<string, string> = {
  openai: 'bg-green-500/10 text-green-700 dark:text-green-400',
  anthropic: 'bg-purple-500/10 text-purple-700 dark:text-purple-400',
  claude: 'bg-purple-500/10 text-purple-700 dark:text-purple-400',
  gemini: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  groq: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
  ollama_local: 'bg-gray-500/10 text-gray-700 dark:text-gray-400',
  fireworks: 'bg-red-500/10 text-red-700 dark:text-red-400',
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
  }: EnhancedProviderModelSelectorProps) {
    const { t } = useTranslation();

    const selectedProvider = useMemo(() => {
      return (
        availableProviders.find((p) => p.value === selectedProviderValue) ??
        availableProviders[0]
      );
    }, [selectedProviderValue, availableProviders]);

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

    return (
      <div
        className={cn(
          'flex items-start gap-3',
          mode === 'both' ? 'flex-col sm:flex-row' : 'flex-col',
          className
        )}
      >
        {(mode === 'both' || mode === 'provider') && (
          <div
            className={cn(
              'flex flex-col items-start justify-start gap-1 w-full',
              mode === 'both' ? 'sm:w-1/2' : ''
            )}
          >
            <Select
              value={selectedProviderValue}
              onValueChange={handleProviderChange}
              disabled={disabled || availableProviders.length === 0}
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
                    <span className="text-primary">{PROVIDER_ICONS[selectedProvider.value]}</span>
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
                {availableProviders.map((provider) => (
                  <SelectItem
                    key={provider.value}
                    value={provider.value}
                    className="py-2"
                  >
                    <div className="flex items-center gap-2 w-full">
                      <span className="text-primary">
                        {PROVIDER_ICONS[provider.value] || <CloudCog className="w-4 h-4" />}
                      </span>
                      <span className="flex-1">{getProviderDisplayTitle(provider)}</span>
                      {provider.source === 'user' && (
                        <Badge variant="outline" className="text-xs ms-2">
                          USER
                        </Badge>
                      )}
                      {provider.source === 'both' && (
                        <Badge 
                          variant="outline" 
                          className={cn("text-xs ms-2", PROVIDER_COLORS[provider.value])}
                        >
                          ENV + USER
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

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
                    placeholder={t('SelectModelPlaceholder', 'Select AI Model')}
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
                          <span className="text-xs text-muted-foreground">Advanced reasoning</span>
                        )}
                        {model.value.includes('gpt-3.5') && (
                          <span className="text-xs text-muted-foreground">Fast & efficient</span>
                        )}
                        {model.value.includes('claude-3-opus') && (
                          <span className="text-xs text-muted-foreground">Most capable</span>
                        )}
                        {model.value.includes('claude-3-sonnet') && (
                          <span className="text-xs text-muted-foreground">Balanced performance</span>
                        )}
                        {model.value.includes('gemini-2') && (
                          <span className="text-xs text-muted-foreground">Latest multimodal</span>
                        )}
                        {model.value.includes('llama') && (
                          <span className="text-xs text-muted-foreground">Open source</span>
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
    );
  }
);
