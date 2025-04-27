"use client";

import React, { useCallback, useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ConfigCharacterSlot, ProviderDefinition, ModelDefinition } from "@/hooks/useGameConfig";
import type { RoleName } from "@/lib/engine/interfaces/IRole";
import type { TFunction } from "i18next";
import { Bot, CloudCog } from "lucide-react";
import ModelSelector from "../ModelSelector";

interface CharacterSlotSelectorsProps {
  slot: ConfigCharacterSlot;
  isHuman: boolean;
  availableProviders: ProviderDefinition[];
  availableModelsByProvider: Record<string, ModelDefinition[]>;
  availableRoles: RoleName[];
  isSubmitting: boolean;
  onUpdateRole: (clientId: string, newRole: RoleName) => void;
  onUpdateProviderAndModel: (clientId: string, provider: string, newModel: string) => void;
  t: TFunction;
}

export function CharacterSlotSelectors({
  slot,
  isHuman,
  availableProviders,
  availableModelsByProvider,
  availableRoles,
  isSubmitting,
  onUpdateRole,
  onUpdateProviderAndModel,
  t,
}: CharacterSlotSelectorsProps) {
  const currentSlotModels = useMemo(() => {
    return availableModelsByProvider[slot.provider] ?? [];
  }, [availableModelsByProvider, slot.provider]);

  const handleSlotProviderChange = useCallback((newProviderValue: string) => {
    const modelsForNewProvider = availableModelsByProvider[newProviderValue] ?? [];
    const defaultModel = modelsForNewProvider.find(m => m.title.toLowerCase().includes("default"))?.value
                        ?? modelsForNewProvider[0]?.value
                        ?? "";
    onUpdateProviderAndModel(slot.clientId, newProviderValue, defaultModel);
  }, [availableModelsByProvider, onUpdateProviderAndModel, slot.clientId]);

  const handleSlotModelChange = useCallback((newModelValue: string) => {
    onUpdateProviderAndModel(slot.clientId, slot.provider, newModelValue);
  }, [onUpdateProviderAndModel, slot.clientId, slot.provider]);

  return (
    <div className="flex flex-col items-center gap-2 w-full">
      {/* Role Selector */}
      <div className="w-full">
        <label htmlFor={`role-${slot.clientId}`} className="sr-only">
          {t("SelectRolePlaceholder", "Select role")}
        </label>
        <Select
          value={slot.roleSelection}
          onValueChange={(newRole) => onUpdateRole(slot.clientId, newRole as RoleName)}
          required
          disabled={isSubmitting}
        >
          <SelectTrigger className="w-full text-xs h-9" id={`role-${slot.clientId}`}>
            <SelectValue placeholder={t("SelectRolePlaceholder", "Select role")} />
          </SelectTrigger>
          <SelectContent>
            {availableRoles.map((roleId) => (
              <SelectItem key={roleId} value={roleId} className="text-xs">
                {t(roleId, roleId)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Provider Selector */}
      {!isHuman && (
        <div className="w-full">
          <label htmlFor={`provider-${slot.clientId}`} className="sr-only">
            {t("SelectProviderPlaceholder", "Select provider")}
          </label>
          <Select
            value={slot.provider}
            onValueChange={handleSlotProviderChange}
            required
            disabled={isHuman || isSubmitting || availableProviders.length === 0}
          >
            <SelectTrigger className="w-full text-xs h-9" id={`provider-${slot.clientId}`}>
              <CloudCog className="w-3 h-3 me-1 text-muted-foreground" />
              <SelectValue placeholder={t("SelectProviderPlaceholder", "Select provider")} />
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

      {/* Model Selector */}
      {!isHuman && (
        <div className="w-full">
          <label htmlFor={`model-${slot.clientId}`} className="sr-only">
            {t("SelectModelPlaceholder", "Select model")}
          </label>
          <ModelSelector
            id={`model-${slot.clientId}`}
            models={currentSlotModels}
            selectedModel={slot.aiModel}
            onModelChange={handleSlotModelChange}
            placeholder={t("SelectModelPlaceholder", "Select model")}
            disabled={isHuman || isSubmitting || currentSlotModels.length === 0}
          />
        </div>
      )}
    </div>
  );
} 