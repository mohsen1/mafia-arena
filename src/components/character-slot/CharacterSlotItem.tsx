"use client"; // Ensure this is a client component

import React from "react";
import type { ConfigCharacterSlot } from "@/hooks/useGameConfig";
import type { RoleName } from "@/lib/engine/interfaces/IRole";
import { useTranslation } from 'react-i18next'; // Import hook
import { cn } from "@/lib/utils";
import { CharacterSlotHeader } from './CharacterSlotHeader';
import { CharacterSlotSelectors } from './CharacterSlotSelectors';

interface CharacterSlotItemProps {
  slot: ConfigCharacterSlot;
  isHuman: boolean;
  index: number;
  availableModels: string[];
  availableRoles: RoleName[];
  isSubmitting: boolean;
  canRemove: boolean;
  onUpdateRole: (clientId: string, newRole: RoleName) => void;
  onUpdateModel: (clientId: string, newModel: string) => void;
  onRemove: (clientId: string) => void;
}

export function CharacterSlotItem({
  slot,
  isHuman,
  index,
  availableModels,
  availableRoles,
  isSubmitting,
  canRemove,
  onUpdateRole,
  onUpdateModel,
  onRemove,
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
        availableModels={availableModels}
        availableRoles={availableRoles}
        isSubmitting={isSubmitting}
        onUpdateRole={onUpdateRole}
        onUpdateModel={onUpdateModel}
        t={t}
      />
    </li>
  );
}
