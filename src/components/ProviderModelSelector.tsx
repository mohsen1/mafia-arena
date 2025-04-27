"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Bot, CloudCog } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

// Import data directly from models.ts
import {
    availableModelsByProvider,
    availableProviders,
    type ProviderDefinition
} from "@/lib/models";

interface ProviderModelSelectorProps {
  idPrefix: string;
  selectedModel: string;
  onProviderModelChange: (provider: string, model: string) => void;
  className?: string;
  disabled?: boolean;
  labelClassName?: string; 
  selectTriggerClassName?: string; 
}

export function ProviderModelSelector({
  idPrefix,

  selectedModel,
  onProviderModelChange,
  className,
  disabled = false,
  labelClassName = "text-sm font-medium text-muted-foreground whitespace-nowrap flex items-center gap-1",
  selectTriggerClassName = "w-full text-xs h-9", 
}: ProviderModelSelectorProps) {
    const [selectedProvider, setSelectedProvider] = useState<ProviderDefinition>(availableProviders[0]);

  // Get t function from hook
  const { t } = useTranslation();
  
  // Logic now uses imported map and local availableProviders
  const currentModels = useMemo(() => {
    return availableModelsByProvider[selectedProvider.value] ?? [];
  }, [selectedProvider]); // Dependency is only selectedProvider now

  const handleProviderChange = useCallback((newProviderValue: string) => {
    const modelsForNewProvider = availableModelsByProvider[newProviderValue] ?? [];
    const defaultModel =
      modelsForNewProvider.find((m) => m.title.toLowerCase().includes("default"))?.value ??
      modelsForNewProvider[0]?.value ??
      "";
    onProviderModelChange(newProviderValue, defaultModel);
    setSelectedProvider(availableProviders.find((p) => p.value === newProviderValue) ?? availableProviders[0]);
  }, [onProviderModelChange]); // Dependency simplified

  const handleModelChange = useCallback((newModelValue: string) => {
    if (selectedProvider) {
      onProviderModelChange(selectedProvider.value, newModelValue);
    } else {
        console.warn("[ProviderModelSelector] Attempted to change model without a provider selected.");
    }
  }, [selectedProvider, onProviderModelChange]);

  const providerSelectId = `${idPrefix}-provider`;
  const modelSelectId = `${idPrefix}-model`;

  // JSX remains largely the same, but uses internal constants for loops/checks
  return (
    <div className={cn("flex flex-col sm:flex-row items-start gap-4", className)}>
      {/* Provider Section */}
      <div className="flex flex-col items-start justify-start gap-1 w-full sm:w-1/2">
        <Label htmlFor={providerSelectId} className={labelClassName}>
          <CloudCog size={16} />
          {t("AIProviderLabel", "AI Provider")}:
        </Label>
        <Select
          value={selectedProvider.value}
          onValueChange={handleProviderChange}
          disabled={disabled || availableProviders.length === 0}
        >
           <SelectTrigger id={providerSelectId} className={cn(selectTriggerClassName, 'text-left justify-between')}>
             <span className="flex items-center gap-1 truncate">
                 <CloudCog className="w-3 h-3 text-muted-foreground shrink-0" />
                 <SelectValue placeholder={t("SelectProviderPlaceholder", "Select provider")} />
             </span>
          </SelectTrigger>
          <SelectContent>
            {availableProviders.map((provider) => (
              <SelectItem key={provider.value} value={provider.value} className="text-xs">
                {provider.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Model Section */}
      <div className="flex flex-col items-start justify-start gap-1 w-full sm:w-1/2">
        <Label htmlFor={modelSelectId} className={labelClassName}>
          <Bot size={16} />
          {t("AIModelLabel", "AI Model")}:
        </Label>
        <Select
          value={selectedModel}
          onValueChange={handleModelChange}
          disabled={disabled || currentModels.length === 0}
        >
           <SelectTrigger id={modelSelectId} className={cn(selectTriggerClassName, 'text-left justify-between')}>
             <span className="flex items-center gap-1 truncate">
                 <Bot className="w-3 h-3 text-muted-foreground shrink-0" />
                 <SelectValue placeholder={t("SelectModelPlaceholder", "Select model")} />
             </span>
          </SelectTrigger>
          <SelectContent>
            {currentModels.length === 0 ? (
                 <SelectItem key="loading..." value="loading" disabled className="text-xs italic">
                    {t("NoModelsForProvider", "No models for selected provider")}
                 </SelectItem>
                ) : (
                 currentModels.map((model) => (
                    <SelectItem key={model.value} value={model.value} className="text-xs">
                        {model.title}
                    </SelectItem>
                 ))
            )}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
} 