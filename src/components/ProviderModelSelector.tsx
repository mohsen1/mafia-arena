"use client";

import React, { useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Bot, CloudCog } from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import {
    availableModelsByProvider,
    availableProviders
} from "@/lib/models";

interface ProviderModelSelectorProps {
  idPrefix: string;
  selectedModel?: string;
  selectedProviderValue?: string;
  onProviderModelChange: (provider: string, model: string) => void;
  className?: string;
  disabled?: boolean;
  selectTriggerClassName?: string;
  mode?: 'both' | 'provider' | 'model';

}

export const ProviderModelSelector = React.memo(function ProviderModelSelector({
  idPrefix,
  selectedModel,
  selectedProviderValue,
  onProviderModelChange,
  className,
  disabled = false,
  selectTriggerClassName = "w-full text-xs h-9",
  mode = 'both',
}: ProviderModelSelectorProps) {
  const { t } = useTranslation();
  
  const selectedProvider = useMemo(() => {
    return availableProviders.find(p => p.value === selectedProviderValue) ?? availableProviders[0];
  }, [selectedProviderValue]);

  const currentModels = useMemo(() => {
    return availableModelsByProvider[selectedProvider?.value ?? ""] ?? [];
  }, [selectedProvider?.value]);

  const isSelectedModelValid = useMemo(() => {
    if (!selectedModel) return false;
    return currentModels.some(model => model.value === selectedModel);
  }, [selectedModel, currentModels]);

  const validModelValue = isSelectedModelValid ? selectedModel : "";

  const handleProviderChange = useCallback(
    (newProviderValue: string) => {
      const modelsForNewProvider = availableModelsByProvider[newProviderValue];
      if (!modelsForNewProvider?.length) {
        return;
      }

      const defaultModel =
        modelsForNewProvider.find((m) => m.title.toLowerCase().includes("default"))?.value ??
        modelsForNewProvider[0].value;

      if (mode !== "model") {
        onProviderModelChange(newProviderValue, defaultModel);
      }
    },
    [onProviderModelChange, mode]
  );

  const handleModelChange = useCallback(
    (newModelValue: string) => {
      if (mode !== "provider" && selectedProvider) {
        onProviderModelChange(selectedProvider.value, newModelValue);
      }
    },
    [selectedProvider, onProviderModelChange, mode]
  );

  const providerSelectId = `${idPrefix}-provider`;
  const modelSelectId = `${idPrefix}-model`;

  return (
    <div className={cn(
        "flex items-start gap-4",
        mode === 'both' ? "flex-col sm:flex-row" : "flex-col",
        className
        )}
    >
      {(mode === 'both' || mode === 'provider') && (
        <div className={cn("flex flex-col items-start justify-start gap-1 w-full", mode === 'both' ? "sm:w-1/2" : "")}>
          <Select
            value={selectedProviderValue}
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
      )}

      {(mode === 'both' || mode === 'model') && (
        <div className={cn("flex flex-col items-start justify-start gap-1 w-full", mode === 'both' ? "sm:w-1/2" : "")}>
          <Select
            key={`${selectedProvider?.value}-model`}
            value={validModelValue}
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
      )}
    </div>
  );
}); 