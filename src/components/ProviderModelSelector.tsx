"use client";

import React, { useMemo, useEffect, useRef } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Bot, CloudCog } from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import debug from 'debug';

// Import data directly from models.ts
import {
    availableModelsByProvider,
    availableProviders
} from "@/lib/models";

// Create a specific debugger instance
const log = debug('werewolf:components:ProviderModelSelector');

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
  const renderCountRef = useRef(0);
  
  // Only log in development mode and reduce logging frequency
  if (process.env.NODE_ENV === 'development') {
    renderCountRef.current++;
    // Log less frequently to reduce noise, e.g., every 5th render or only if props actually changed
    if (renderCountRef.current % 5 === 1) { 
      log(`[${idPrefix}] Render #${renderCountRef.current}, mode: ${mode}, provider: ${selectedProviderValue}, model: ${selectedModel}`);
    }
  }
  
  const selectedProvider = useMemo(() => {
    const start = performance.now();
    const provider = availableProviders.find(p => p.value === selectedProviderValue) ?? availableProviders[0];
    if (process.env.NODE_ENV === 'development' && renderCountRef.current % 5 === 1) { // Match logging frequency
      const end = performance.now();
      log(`[${idPrefix}] selectedProvider calculation took ${(end - start).toFixed(2)}ms, result: ${provider?.title}`);
    }
    return provider;
  }, [selectedProviderValue, idPrefix]); // idPrefix is stable if clientId is stable

  const currentModels = useMemo(() => {
    const start = performance.now();
    const models = availableModelsByProvider[selectedProvider?.value ?? ""] ?? [];
    if (process.env.NODE_ENV === 'development' && renderCountRef.current % 5 === 1) { // Match logging frequency
      const end = performance.now();
      log(`[${idPrefix}] currentModels calculation took ${(end - start).toFixed(2)}ms, found ${models.length} models`);
    }
    return models;
  }, [selectedProvider?.value, idPrefix]); // idPrefix is stable

  const isSelectedModelValid = useMemo(() => {
    const start = performance.now();
    if (!selectedModel) {
      if (process.env.NODE_ENV === 'development' && renderCountRef.current % 5 === 1) {
          log(`[${idPrefix}] isSelectedModelValid: false (no selectedModel)`);
      }
      return false;
    }
    const isValid = currentModels.some(model => model.value === selectedModel);
    if (process.env.NODE_ENV === 'development' && renderCountRef.current % 5 === 1) {
      const end = performance.now();
      log(`[${idPrefix}] isSelectedModelValid calculation took ${(end - start).toFixed(2)}ms, result: ${isValid}`);
      if(!isValid) {
        log(`[${idPrefix}] Selected model ${selectedModel} not valid for provider ${selectedProvider?.value}`);
      }
    }
    return isValid;
  }, [selectedModel, currentModels, idPrefix, selectedProvider?.value]); // Added selectedProvider?.value for more accurate logging

  const validModelValue = isSelectedModelValid ? selectedModel : "";

  const handleProviderChange = useCallback((newProviderValue: string) => {
    const start = performance.now();
    if (process.env.NODE_ENV === 'development') {
      log(`[${idPrefix}] Provider change started: ${selectedProviderValue} -> ${newProviderValue}`);
    }
    
    const modelsForNewProvider = availableModelsByProvider[newProviderValue];
    if (!modelsForNewProvider?.length) {
      console.warn(`No models available for provider: ${newProviderValue}`);
      if (process.env.NODE_ENV === 'development') {
          log(`[${idPrefix}] Provider change aborted: No models for ${newProviderValue}`);
      }
      return;
    }
    
    const defaultModel =
      modelsForNewProvider.find((m) => m.title.toLowerCase().includes("default"))?.value ??
      modelsForNewProvider[0].value;
    
    if (process.env.NODE_ENV === 'development') {
        log(`[${idPrefix}] Found ${modelsForNewProvider.length} models for provider ${newProviderValue}, defaultModel: ${defaultModel}`);
    }
      
    if (mode !== 'model') {
      React.startTransition(() => {
        if (process.env.NODE_ENV === 'development') {
            log(`[${idPrefix}] Calling onProviderModelChange(${newProviderValue}, ${defaultModel})`);
        }
        onProviderModelChange(newProviderValue, defaultModel);
      });
    }
    if (process.env.NODE_ENV === 'development') {
        const end = performance.now();
        log(`[${idPrefix}] Provider change completed in ${(end - start).toFixed(2)}ms`);
    }
  }, [onProviderModelChange, mode, idPrefix, selectedProviderValue]); // selectedProviderValue for logging

  const handleModelChange = useCallback((newModelValue: string) => {
    if (process.env.NODE_ENV === 'development') {
      log(`[${idPrefix}] Model change: ${selectedModel} -> ${newModelValue}`);
    }
    
    if (mode !== 'provider' && selectedProvider) {
      React.startTransition(() => {
        onProviderModelChange(selectedProvider.value, newModelValue);
      });
    } else if (!selectedProvider) {
      console.warn("ProviderModelSelector: Attempted to change model without a provider selected.");
    }
  }, [selectedProvider, onProviderModelChange, mode, idPrefix, selectedModel]); // selectedProvider instance, selectedModel for logging

  const providerSelectId = `${idPrefix}-provider`;
  const modelSelectId = `${idPrefix}-model`;

  // Only log component mount/unmount in development
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      log(`[${idPrefix}] Component mounted`);
      return () => {
        log(`[${idPrefix}] Component unmounted`);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idPrefix]); // idPrefix should be stable if clientId is stable

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