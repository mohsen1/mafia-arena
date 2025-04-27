"use client"; // Ensure this is a client component

import React from "react";
import type { ConfigCharacterSlot } from "@/hooks/useGameConfig";
import type { RoleName } from "@/lib/engine/interfaces/IRole";
import { useTranslation } from 'react-i18next'; // Import hook
import { cn } from "@/lib/utils";
import { CharacterSlotHeader } from './CharacterSlotHeader';
import { CharacterSlotSelectors } from './CharacterSlotSelectors';
// Import provider/model types (assuming they are exported from hook or defined globally)
import type { ProviderDefinition, ModelDefinition } from "@/hooks/useGameConfig";

interface CharacterSlotItemProps {
  slot: ConfigCharacterSlot;
  isHuman: boolean;
  index: number;
  availableProviders: ProviderDefinition[]; // New: List of providers
  availableModelsByProvider: Record<string, ModelDefinition[]>; // New: Models map
  availableRoles: RoleName[];
  isSubmitting: boolean;
  canRemove: boolean;
  onUpdateRole: (clientId: string, newRole: RoleName) => void;
  // New: Handler for provider and model updates
  onUpdateProviderAndModel: (clientId: string, provider: string, newModel: string) => void;
  onRemove: (clientId: string) => void;
  // Removed: availableModels, onUpdateModel
}

export function CharacterSlotItem({
  slot,
  isHuman,
  index,
  availableProviders, // New prop
  availableModelsByProvider, // New prop
  availableRoles,
  isSubmitting,
  canRemove,
  onUpdateRole,
  onUpdateProviderAndModel, // New prop
  onRemove,
  // Removed props are not destructured
}: CharacterSlotItemProps) {
  const { t } = useTranslation();

  return (
    <li
      key={slot.clientId}
      className={cn(
        "p-4 border rounded-lg transition-all duration-300 ease-in-out flex flex-col gap-3",
        slot.generationError ? "bg-destructive/10 border-destructive/50" : "bg-card",
        isHuman ? "border-primary/50 ring-2 ring-primary/30" : "border-border"
      )}
    >
      <CharacterSlotHeader
        slot={slot}
        isHuman={isHuman}
        index={index}
        isSubmitting={isSubmitting}
        canRemove={canRemove}
        onRemove={onRemove}
        t={t}
      />

      <CharacterSlotSelectors
        slot={slot}
        isHuman={isHuman}
        availableProviders={availableProviders} // Pass down
        availableModelsByProvider={availableModelsByProvider} // Pass down
        availableRoles={availableRoles}
        isSubmitting={isSubmitting}
        onUpdateRole={onUpdateRole}
        onUpdateProviderAndModel={onUpdateProviderAndModel} // Pass down new handler
        t={t}
        // Removed: availableModels, onUpdateModel
      />
    </li>
  );
}
