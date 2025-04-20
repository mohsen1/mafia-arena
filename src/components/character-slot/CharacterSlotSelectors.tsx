"use client";

import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ConfigCharacterSlot, Role } from "@/lib/types/game";
import type { TFunction } from "i18next";

interface CharacterSlotSelectorsProps {
  slot: ConfigCharacterSlot;
  isHuman: boolean;
  availableModels: string[];
  availableRoles: Role[];
  isSubmitting: boolean;
  onUpdateRole: (clientId: string, newRole: Role) => void;
  onUpdateModel: (clientId: string, newModel: string) => void;
  t: TFunction;
}

export function CharacterSlotSelectors({
  slot,
  isHuman,
  availableModels,
  availableRoles,
  isSubmitting,
  onUpdateRole,
  onUpdateModel,
  t,
}: CharacterSlotSelectorsProps) {
  return (
    <div className="flex flex-col items-center gap-2 w-full">
      {/* Role Selector */}
      <div className="w-full">
        <label htmlFor={`role-${slot.clientId}`} className="sr-only">
          {t("SelectRolePlaceholder", "Select role")}
        </label>
        <Select
          value={slot.roleSelection}
          onValueChange={(newRole) => onUpdateRole(slot.clientId, newRole as Role)}
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

      {/* Model Selector */}
      <div className="w-full">
        <label htmlFor={`model-${slot.clientId}`} className="sr-only">
          {t("SelectModelPlaceholder", "Select model")}
        </label>
        <Select
          value={slot.aiModel}
          onValueChange={(newModel) => onUpdateModel(slot.clientId, newModel)}
          required
          disabled={isHuman || isSubmitting || availableModels.length === 0}
        >
          <SelectTrigger className="w-full text-xs h-9" id={`model-${slot.clientId}`}>
            <SelectValue placeholder={t("SelectModelPlaceholder", "Select model")}
            />
          </SelectTrigger>
          <SelectContent>
            {availableModels.length === 0 ? (
              <SelectItem value="loading" disabled>
                {t("LoadingLabel", "Loading...")}
              </SelectItem>
            ) : (
              availableModels.map((modelId) => (
                <SelectItem key={modelId} value={modelId} className="text-xs">
                  {modelId}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
} 