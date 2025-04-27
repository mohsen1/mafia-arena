"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ConfigCharacterSlot } from "@/hooks/useGameConfig";
import type { RoleName } from "@/lib/engine/interfaces/IRole";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ProviderModelSelector } from "../ProviderModelSelector";


interface CharacterSlotSelectorsProps {
  slot: ConfigCharacterSlot;
  isHuman: boolean;
  availableRoles: RoleName[];
  isSubmitting: boolean;
  onUpdateRole: (clientId: string, newRole: RoleName) => void;
  onUpdateProviderAndModel: (clientId: string, provider: string, newModel: string) => void;
}

export function CharacterSlotSelectors({
  slot,
  isHuman,
  availableRoles,
  isSubmitting,
  onUpdateRole,
  onUpdateProviderAndModel,
}: CharacterSlotSelectorsProps) {
  const { t } = useTranslation();

  const handleSlotProviderModelChange = useCallback(
    (provider: string, model: string) => {
      console.log(`[CharacterSlotSelectors] handleSlotProviderModelChange called for slot ${slot.clientId}`, {provider, model});
      onUpdateProviderAndModel(slot.clientId, provider, model);
    },
    [onUpdateProviderAndModel, slot.clientId]
  );

  return (
    <div className="flex flex-col items-center gap-2 w-full">
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
          <SelectTrigger className="w-full text-xs h-9 text-left" id={`role-${slot.clientId}`}>
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

      {!isHuman && (
        <ProviderModelSelector
          idPrefix={`slot-${slot.clientId}`}
          selectedModel={slot.aiModel}
          onProviderModelChange={handleSlotProviderModelChange}
          disabled={isSubmitting}
          className="flex-col !items-start w-full !gap-2 sm:!flex-col"
          labelClassName="text-sm font-medium text-muted-foreground whitespace-nowrap flex items-center gap-1"
          selectTriggerClassName="w-full text-xs h-9"
        />
      )}
    </div>
  );
} 