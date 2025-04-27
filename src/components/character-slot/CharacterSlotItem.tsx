"use client"; // Ensure this is a client component

import React from "react";
import type { ConfigCharacterSlot } from "@/hooks/useGameConfig";
import type { RoleName } from "@/lib/engine/interfaces/IRole";
import { useTranslation } from 'react-i18next'; // Import hook
import { cn } from "@/lib/utils";
import { TableCell, TableRow } from "@/components/ui/table";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Users, ServerCrash, Bot, X, Loader2, User } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProviderModelSelector } from "../ProviderModelSelector";
import { Label } from "@/components/ui/label"; // Add Label import

interface CharacterSlotItemProps {
  slot: ConfigCharacterSlot;
  isHuman: boolean;
  index: number;
  availableRoles: RoleName[];
  isSubmitting: boolean;
  canRemove: boolean;
  onUpdateRole: (clientId: string, newRole: RoleName) => void;
  onUpdateProviderAndModel: (clientId: string, provider: string, newModel: string) => void;
  onRemove: (clientId: string) => void;
}

export function CharacterSlotItem({
  slot,
  isHuman,
  index,
  availableRoles,
  isSubmitting,
  canRemove,
  onUpdateRole,
  onUpdateProviderAndModel,
  onRemove,
}: CharacterSlotItemProps) {
  const { t } = useTranslation();

  const handleRemoveClick = () => {
    onRemove(slot.clientId);
  };

  const handleSlotProviderModelChange = (provider: string, model: string) => {
      console.log(`[CharacterSlotItem] handleSlotProviderModelChange called for slot ${slot.clientId}`, {provider, model});
      onUpdateProviderAndModel(slot.clientId, provider, model);
  };

  return (
    <TableRow
      key={slot.clientId}
      className={cn(
        "transition-colors",
        // Responsive layout: flex column on mobile, table row on md+
        "flex flex-col p-4 md:p-0 md:table-row border-b md:border-b-0", // Added bottom border for mobile separation
        slot.generationError ? "bg-destructive/10 hover:bg-destructive/20" : "hover:bg-muted/50",
        isHuman ? "border border-primary/30 md:border-0 data-[state=selected]:bg-primary/10" : "" // Adjust border for mobile
      )}
      data-state={isHuman ? "selected" : undefined} // Use data-state for human player highlight
    >
      {/* Character Cell - Adjust padding and width for mobile */}
      <TableCell className="font-medium p-0 md:p-4 md:table-cell md:w-[150px]">
        <div className="flex items-center gap-3 min-w-0 mb-2 md:mb-0">
          {/* --- Placeholder Icon & Initial Name/Label --- */}
          {/* --- Human Player (Before Generation) --- */}
          {isHuman && !slot.isGenerated && !slot.generationError ? (
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <User className="h-5 w-5 text-muted-foreground" />
              </div>
              <span className="font-medium text-sm text-foreground truncate">
                {slot.profile?.characterName || t("HumanPlayerLabel", "You")}
              </span>
            </div>
          ) : !isHuman && !slot.isGenerated && !slot.generationError ? (
            // AI Placeholder Icon (Before Generation)
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <Bot className="h-5 w-5 text-muted-foreground" />
              </div>
               <span className="font-medium text-sm text-muted-foreground">
                {t("AIPlayerLabel", "AI")}
              </span>
            </div>
          ) : slot.imageUrl && !slot.generationError ? (
            // Generated Image + Name (Human or AI)
            <>
              <Image
                src={slot.imageUrl}
                alt={slot.profile?.characterName || "Character"}
                width={40}
                height={40}
                className="rounded-full object-cover w-10 h-10 flex-shrink-0"
              />
              <div className="truncate min-w-0">
                {isHuman && (
                  <span className="inline-flex items-center gap-1 me-1 text-xs text-primary font-semibold">
                    <User className="inline-block h-3 w-3 me-0.5 text-primary" aria-label={t("HumanPlayerIndicatorLabel", "Human Player")} />
                    {t("HumanPlayerLabel", "You")}
                  </span>
                )}
                <span
                  className="font-medium truncate block text-sm text-foreground"
                  title={slot.profile?.characterName || (isHuman ? t("HumanPlayerLabel", "You") : t("PendingGenerationLabel", "Pending generation"))}
                >
                  {slot.profile?.characterName || (isHuman ? t("HumanPlayerLabel", "You") : t("PendingGenerationLabel", "Pending generation"))}
                </span>
              </div>
            </>
          ) : slot.generationError ? (
            // Error Icon and Message
            <div className="flex items-center text-destructive text-sm flex-grow gap-2">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                   <ServerCrash className="h-5 w-5 text-destructive" />
              </div>
              <span className="truncate" title={slot.generationError}>
                {t("GenerationErrorPrefix", "Error")}: {slot.generationError}
              </span>
            </div>
          ) : (
              // Fallback - Should ideally not be reached if logic is correct
               <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <Users className="h-5 w-5 text-muted-foreground" />
              </div>
          )}
        </div>
      </TableCell>

      {/* --- Container for Selectors (Mobile) --- */}
      <div className="flex flex-col gap-3 md:table-row">
        {/* Role Cell - Adjust padding and width for mobile */}
        <TableCell className="p-0 md:p-4 md:table-cell">
          {/* Mobile Label */}
          <Label htmlFor={`role-${slot.clientId}`} className="text-xs font-medium text-muted-foreground md:hidden mb-1">
            {t("TableHeader_Role", "Role")}
          </Label>
          <Select
              value={slot.roleSelection}
              onValueChange={(newRole) => onUpdateRole(slot.clientId, newRole as RoleName)}
              required
              disabled={isSubmitting}
            >
              {/* Make trigger full width on mobile */}
              <SelectTrigger className="w-full md:w-[150px] text-xs h-9 text-left" id={`role-${slot.clientId}`}>
                <SelectValue className="truncate" placeholder={t("SelectRolePlaceholder", "Select role")} />
              </SelectTrigger>
              <SelectContent>
                {availableRoles.map((roleId) => (
                  <SelectItem key={roleId} value={roleId} className="text-xs">
                    {t(roleId, roleId)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
        </TableCell>

        {/* AI Provider & Model Cells (Conditional) - Adjust padding for mobile */}
        {isHuman ? (
          <TableCell colSpan={2} className="p-0 md:p-4 md:table-cell text-muted-foreground italic text-center">
              {/* Add padding for mobile view consistency */}
              <div className="py-2 md:py-0">
                  {t("HumanControlledLabel", "Human Controlled")}
              </div>
          </TableCell>
        ) : (
          <>
            {/* AI Provider Cell */}
            <TableCell className="p-0 md:p-4 md:table-cell">
              {/* Mobile Label */}
              <Label htmlFor={`slot-${slot.clientId}-pv-trigger`} className="text-xs font-medium text-muted-foreground md:hidden mb-1">
                 {t("TableHeader_Provider", "AI Provider")}
              </Label>
               <ProviderModelSelector
                idPrefix={`slot-${slot.clientId}-pv`} // Ensure unique IDs
                selectedModel={slot.aiModel} // Pass only model initially
                onProviderModelChange={handleSlotProviderModelChange}
                disabled={isSubmitting}
                className="flex-col !items-start w-full !gap-1"
                labelClassName="hidden" // Keep hidden, using TableHead/Mobile Label
                selectTriggerClassName="w-full text-xs h-9"
                mode="provider" // Only show provider select
              />
            </TableCell>
            {/* AI Model Cell */}
            <TableCell className="p-0 md:p-4 md:table-cell">
               {/* Mobile Label */}
              <Label htmlFor={`slot-${slot.clientId}-md-trigger`} className="text-xs font-medium text-muted-foreground md:hidden mb-1">
                 {t("TableHeader_Model", "AI Model")}
              </Label>
              <ProviderModelSelector
                idPrefix={`slot-${slot.clientId}-md`} // Ensure unique IDs
                selectedModel={slot.aiModel}
                selectedProviderValue={slot.provider}
                onProviderModelChange={handleSlotProviderModelChange}
                disabled={isSubmitting}
                className="flex-col !items-start w-full !gap-1"
                labelClassName="hidden" // Keep hidden, using TableHead/Mobile Label
                selectTriggerClassName="w-full text-xs h-9"
                mode="model" // Only show model select
              />
            </TableCell>
          </>
        )}

        {/* Action Cell - Adjust padding and alignment for mobile */}
        <TableCell className="p-0 md:p-4 md:table-cell md:text-right">
          {/* Align button to the start on mobile */}
          <div className="mt-2 md:mt-0 flex justify-start md:justify-end">
              {canRemove && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveClick}
                  disabled={isSubmitting}
                  className="p-1 text-muted-foreground hover:text-destructive h-9 w-auto"
                  aria-label={`${t("RemovePlayerSlotAriaLabel", "Remove player slot")} ${index + 1}`}
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <X className="h-5 w-5" />
                      <span className="ms-1 text-xs">{t("DeleteButtonLabel", "Delete")}</span>
                    </>
                  )}
                </Button>
              )}
          </div>
        </TableCell>
      </div>
    </TableRow>
  );
}
