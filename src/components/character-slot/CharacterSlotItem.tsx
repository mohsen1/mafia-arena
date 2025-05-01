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
  humanPlayerName?: string; // Add optional prop for human player name
  availableRoles: RoleName[];
  isSubmitting: boolean;
  canRemove: boolean;
  onUpdateRole: (clientId: string, newRole: RoleName) => void;
  onUpdateProviderAndModel: (clientId: string, provider: string, newModel: string) => void;
  onRemove: (clientId: string) => void;
}

// --- Helper Component for Character Info (reusable for both layouts) ---
interface CharacterInfoProps {
  slot: ConfigCharacterSlot;
  isHuman: boolean;
  humanPlayerName?: string;
}

const CharacterInfo: React.FC<CharacterInfoProps> = ({ slot, isHuman, humanPlayerName }) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 min-w-0">
      {isHuman && !slot.isGenerated && !slot.generationError ? (
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
            <User className="h-5 w-5 text-muted-foreground" />
          </div>
          <span className="font-medium text-sm text-foreground truncate">
            {humanPlayerName !== undefined ? humanPlayerName : (slot.profile?.characterName || t("HumanPlayerLabel", "You"))}
          </span>
        </div>
      ) : !isHuman && !slot.isGenerated && !slot.generationError ? (
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
            <Bot className="h-5 w-5 text-muted-foreground" />
          </div>
          <span className="font-medium text-sm text-muted-foreground">
            {t("AIPlayerLabel", "AI")}
          </span>
        </div>
      ) : slot.imageUrl && !slot.generationError ? (
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
              title={humanPlayerName !== undefined ? humanPlayerName : (slot.profile?.characterName || (isHuman ? t("HumanPlayerLabel", "You") : t("PendingGenerationLabel", "Pending generation")))}
            >
              {humanPlayerName !== undefined ? humanPlayerName : (slot.profile?.characterName || (isHuman ? t("HumanPlayerLabel", "You") : t("PendingGenerationLabel", "Pending generation")))}
            </span>
          </div>
        </>
      ) : slot.generationError ? (
        <div className="flex items-center text-destructive text-sm flex-grow gap-2">
          <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
            <ServerCrash className="h-5 w-5 text-destructive" />
          </div>
          <span className="truncate" title={slot.generationError}>
            {t("GenerationErrorPrefix", "Error")}: {slot.generationError}
          </span>
        </div>
      ) : (
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
          <Users className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
    </div>
  );
};
// --- End Helper Component ---

export function CharacterSlotItem({
  slot,
  isHuman,
  index,
  humanPlayerName,
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

  // Common props for ProviderModelSelector
  const providerModelSelectorProps = {
    selectedModel: slot.aiModel,
    selectedProviderValue: slot.provider,
    onProviderModelChange: handleSlotProviderModelChange,
    disabled: isSubmitting,
    className: "flex-col !items-start w-full !gap-1",
    labelClassName: "hidden",
    selectTriggerClassName: "w-full text-xs h-9",
  };

  // Common Remove Button
  const removeButton = canRemove && (
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
  );

  return (
    <React.Fragment key={slot.clientId}> {/* Use Fragment to wrap conditional layouts */}
      {/* --- Desktop Layout (md+) --- */}
      <TableRow
        className={cn(
          "transition-colors hidden md:table-row", // Show only on md+
          slot.generationError ? "bg-destructive/10 hover:bg-destructive/20" : "hover:bg-muted/50",
          isHuman ? "border-primary/30 data-[state=selected]:bg-primary/10" : ""
        )}
        data-state={isHuman ? "selected" : undefined}
      >
        {/* Character Cell */}
        <TableCell className="font-medium w-[150px]">
          <CharacterInfo slot={slot} isHuman={isHuman} humanPlayerName={humanPlayerName} />
        </TableCell>

        {/* Role Cell */}
        <TableCell>
          <Select
            value={slot.roleSelection}
            onValueChange={(newRole) => onUpdateRole(slot.clientId, newRole as RoleName)}
            required
            disabled={isSubmitting}
          >
            <SelectTrigger className="w-[150px] text-xs h-9 text-left" id={`role-${slot.clientId}-desktop`}>
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

        {/* AI Provider & Model Cells (Conditional) */}
        {isHuman ? (
          <TableCell colSpan={2} className="text-muted-foreground italic text-center">
            {t("HumanControlledLabel", "Human Controlled")}
          </TableCell>
        ) : (
          <>
            <TableCell>
              <ProviderModelSelector
                {...providerModelSelectorProps}
                agentConfig={null}
                idPrefix={`slot-${slot.clientId}-pv-desktop`}
                mode="provider"
              />
            </TableCell>
            <TableCell>
              <ProviderModelSelector
                {...providerModelSelectorProps}
                agentConfig={null}
                idPrefix={`slot-${slot.clientId}-md-desktop`}
                mode="model"
              />
            </TableCell>
          </>
        )}

        {/* Action Cell */}
        <TableCell className="text-right">
          {removeButton}
        </TableCell>
      </TableRow>

      {/* --- Mobile Layout (< md) --- */}
      <div
        className={cn(
          "block md:hidden p-4 border-b space-y-3", // Show only below md, add spacing
           slot.generationError ? "bg-destructive/10" : "bg-card",
           isHuman ? "border border-primary/30 data-[state=selected]:bg-primary/10" : ""
        )}
         data-state={isHuman ? "selected" : undefined}
      >
        {/* Character Info */} 
        <div className="flex justify-between items-center">
          <CharacterInfo slot={slot} isHuman={isHuman} humanPlayerName={humanPlayerName} />
           {/* Move remove button here for mobile next to character info */}
           <div className="ms-2 flex-shrink-0">{removeButton}</div>
        </div>

        {/* Role Selector */} 
        <div> 
            <Label htmlFor={`role-${slot.clientId}-mobile`} className="text-xs font-medium text-muted-foreground mb-1 block">
                {t("TableHeader_Role", "Role")}
            </Label>
            <Select
                value={slot.roleSelection}
                onValueChange={(newRole) => onUpdateRole(slot.clientId, newRole as RoleName)}
                required
                disabled={isSubmitting}
            >
                <SelectTrigger className="w-full text-xs h-9 text-left" id={`role-${slot.clientId}-mobile`}>
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
        </div>

        {/* AI Provider & Model Selectors (Conditional) */} 
        {isHuman ? (
          <div className="text-muted-foreground italic text-center text-sm py-2">
            {t("HumanControlledLabel", "Human Controlled")}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3"> {/* Use grid for side-by-side */} 
            {/* Provider */}
            <div>
                <Label htmlFor={`slot-${slot.clientId}-pv-mobile-trigger`} className="text-xs font-medium text-muted-foreground mb-1 block">
                    {t("TableHeader_Provider", "AI Provider")}
                </Label>
                <ProviderModelSelector
                    {...providerModelSelectorProps}
                    agentConfig={null}
                    idPrefix={`slot-${slot.clientId}-pv-mobile`}
                    mode="provider"
                />
            </div>
            {/* Model */}
            <div>
                <Label htmlFor={`slot-${slot.clientId}-md-mobile-trigger`} className="text-xs font-medium text-muted-foreground mb-1 block">
                    {t("TableHeader_Model", "AI Model")}
                </Label>
                <ProviderModelSelector
                    {...providerModelSelectorProps}
                    agentConfig={null}
                    idPrefix={`slot-${slot.clientId}-md-mobile`}
                    mode="model"
                />
            </div>
          </div>
        )}
      </div>
    </React.Fragment>
  );
}
