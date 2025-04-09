"use client"; // Ensure this is a client component

import React from "react";
import type { ConfigCharacterSlot, Role } from "@/lib/types/game";
import Image from "next/image";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Users,
  ServerCrash,
  Bot,
  X,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

interface CharacterSlotItemProps {
  slot: ConfigCharacterSlot;
  index: number;
  availableModels: string[];
  availableRoles: Role[];
  isSubmitting: boolean;
  canRemove: boolean;
  onUpdateRole: (clientId: string, newRole: Role) => void;
  onUpdateModel: (clientId: string, newModel: string) => void;
  onRemove: (clientId: string) => void;
  translations: Record<string, string>;
}

export function CharacterSlotItem({
  slot,
  index,
  availableModels,
  availableRoles,
  isSubmitting,
  canRemove,
  onUpdateRole,
  onUpdateModel,
  onRemove,
  translations,
}: CharacterSlotItemProps) {
  const { t } = useTranslation({ translations });

  return (
    <li
      key={slot.clientId}
      className={`p-4 rounded-lg transition-all duration-300 ease-in-out flex flex-col gap-3 ${slot.generationError ? "bg-destructive/10 border border-destructive/50" : "bg-card"}`}
    >
      {/* Top section: Status/Generated Info & Remove Button */}
      <div className="flex items-center justify-between gap-3">
        {/* Left side: Status/Generated Info */}
        <div className="flex items-center gap-3 flex-grow min-w-0">
          {slot.isGenerated && !slot.generationError ? (
            <>
              {slot.imageUrl ? (
                <Image
                  src={slot.imageUrl}
                  alt={slot.profile?.characterName || "Character"}
                  width={40}
                  height={40}
                  className="rounded-full object-cover w-10 h-10 flex-shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <Users className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div className="truncate min-w-0">
                <span
                  className="font-medium truncate block text-sm text-foreground"
                  title={slot.profile?.characterName}
                >
                  {slot.profile?.characterName ||
                    t("UnnamedCharacterLabel", "Unnamed")}
                </span>
              </div>
            </>
          ) : slot.generationError ? (
            <div className="flex items-center text-destructive text-sm flex-grow">
              <ServerCrash className="h-4 w-4 mr-2 flex-shrink-0" />
              <span className="truncate" title={slot.generationError}>
                {t("GenerationErrorPrefix", "Error")}: {slot.generationError}
              </span>
            </div>
          ) : (
            // Display Placeholder before generation - Use muted
            <div className="flex items-center text-muted-foreground flex-grow">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <Bot className="h-5 w-5" />
              </div>
              <span className="ms-2 text-sm italic">
                {t("PlayerSlotPendingLabel", "Player Slot")}
              </span>
            </div>
          )}
        </div>

        {/* Remove Button (moved to top right) */}
        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onRemove(slot.clientId)}
            disabled={isSubmitting}
            className="p-1 text-muted-foreground hover:text-destructive h-9 w-9 flex-shrink-0"
            aria-label={`${t("RemovePlayerSlotAriaLabel", "Remove player slot")} ${index + 1}`}
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <X className="h-5 w-5" />
            )}
          </Button>
        )}
      </div>

      {/* Bottom section: Role/Model Selectors - Always stacked vertically */}
      <div className="flex flex-col items-center gap-2 w-full">
        {/* Role Selector */}
        <div className="w-full">
          <label htmlFor={`role-${slot.clientId}`} className="sr-only">
            {t("SelectRolePlaceholder", "Select role")}
          </label>
          <Select
            value={slot.roleSelection}
            onValueChange={(newRole) =>
              onUpdateRole(slot.clientId, newRole as Role)
            }
            required
            disabled={isSubmitting}
          >
            <SelectTrigger
              className="w-full text-xs h-9"
              id={`role-${slot.clientId}`}
            >
              <SelectValue
                placeholder={t("SelectRolePlaceholder", "Select role")}
              />
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
            disabled={isSubmitting || availableModels.length === 0}
          >
            <SelectTrigger
              className="w-full text-xs h-9"
              id={`model-${slot.clientId}`}
            >
              <SelectValue
                placeholder={t("SelectModelPlaceholder", "Select model")}
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
    </li>
  );
}
