"use client"; // Ensure this is a client component

import React, { useState } from "react";
import type { ConfigCharacterSlot } from "@/hooks/useGameConfig";
import type { RoleName } from "@/lib/engine/interfaces/IRole";
import { useTranslation } from 'react-i18next'; // Import hook
import { cn } from "@/lib/utils";
import { TableCell, TableRow } from "@/components/ui/table";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Users, ServerCrash, Bot, X, Loader2, User, ImagePlus } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProviderModelSelector } from "../ProviderModelSelector";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input"; // Import Input
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"; // Import Popover components

// Hardcoded image paths (consider fetching dynamically later)
const characterImagePaths = [
  // Female - Old
  "/images/characters/female/old/unnamed.png",
  "/images/characters/female/old/unnamed-1.png",
  "/images/characters/female/old/unnamed-8.png",
  "/images/characters/female/old/unnamed-12.png",
  "/images/characters/female/old/unnamed-13.png",
  "/images/characters/female/old/unnamed-14.png",
  // Female - Young
  "/images/characters/female/young/unnamed.png",
  "/images/characters/female/young/unnamed-1.png",
  "/images/characters/female/young/unnamed-3.png",
  "/images/characters/female/young/unnamed-4.png",
  "/images/characters/female/young/unnamed-5.png",
  "/images/characters/female/young/unnamed-6.png",
  "/images/characters/female/young/unnamed-7.png",
  "/images/characters/female/young/unnamed-8.png",
  "/images/characters/female/young/unnamed-9.png",
  // Male - Old
  "/images/characters/male/old/unnamed-2.png",
  "/images/characters/male/old/unnamed-3.png",
  "/images/characters/male/old/unnamed-7.png",
  "/images/characters/male/old/unnamed-9.png",
  "/images/characters/male/old/unnamed-10.png",
  "/images/characters/male/old/unnamed-11.png",
  // Male - Young
  "/images/characters/male/young/unnamed.png",
  "/images/characters/male/young/unnamed-0.png",
  "/images/characters/male/young/unnamed-1.png",
  "/images/characters/male/young/unnamed-2.png",
  "/images/characters/male/young/unnamed-3.png",
  "/images/characters/male/young/unnamed-4.png",
  "/images/characters/male/young/unnamed-6.png",
];

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
  onUpdateName: (clientId: string, newName: string) => void;
  onUpdateImageUrl: (clientId: string, newImageUrl: string | null) => void;
}

// --- Helper Component for Character Info (reusable for both layouts) ---
interface CharacterInfoProps {
  slot: ConfigCharacterSlot;
  isHuman: boolean;
  isSubmitting: boolean;
  onUpdateName: (clientId: string, newName: string) => void;
  onUpdateImageUrl: (clientId: string, newImageUrl: string | null) => void;
}

const CharacterInfo: React.FC<CharacterInfoProps> = React.memo(({ slot, isHuman, isSubmitting, onUpdateName, onUpdateImageUrl }) => {
  const { t } = useTranslation();
  const [isImagePopoverOpen, setIsImagePopoverOpen] = useState(false);

  const handleNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateName(slot.clientId, event.target.value);
  };

  // Placeholder for image selection logic
  const handleImageSelect = (selectedImage: string | null) => {
    onUpdateImageUrl(slot.clientId, selectedImage);
    setIsImagePopoverOpen(false); // Close popover after selection
  };

  const currentName = slot.profile?.characterName || (isHuman ? t("HumanPlayerLabel", "You") : t("AIPlayerLabel", "AI"));
  const currentImageUrl = slot.imageUrl;

  return (
    <div className="flex items-center gap-3 min-w-0">
      {/* Image/Icon Section */} 
      <div className="relative flex-shrink-0">
        {currentImageUrl ? (
           <Image
             src={currentImageUrl}
             alt={currentName}
             width={40}
             height={40}
             className="rounded-full object-cover w-10 h-10 border"
           />
         ) : isHuman ? (
           <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center border">
             <User className="h-5 w-5 text-muted-foreground" />
           </div>
         ) : (
           <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center border">
             <Bot className="h-5 w-5 text-muted-foreground" />
           </div>
         )
        }
        {/* Image Selection Popover */}
        <Popover open={isImagePopoverOpen} onOpenChange={setIsImagePopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-background bg-muted hover:bg-muted/80 p-0.5"
              disabled={isSubmitting}
              aria-label={t("SelectPlayerImageAriaLabel", "Select player image")}
            >
              <ImagePlus className="h-3 w-3 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 max-h-96 overflow-y-auto p-2">
            <div className="grid grid-cols-5 gap-2">
              {characterImagePaths.map((path) => (
                <button
                  key={path}
                  type="button"
                  className={cn(
                    "rounded-md overflow-hidden focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border border-transparent",
                    currentImageUrl === path ? "ring-2 ring-primary ring-offset-2 border-primary" : "hover:border-muted-foreground"
                  )}
                  onClick={() => handleImageSelect(path)}
                  aria-label={`${t("SelectImageAriaLabel", "Select Image")} ${path.split('/').pop()}`}
                >
                  <Image
                    src={path}
                    alt={`Character ${path.split('/').pop()}`}
                    width={48}
                    height={48}
                    className="object-cover w-12 h-12"
                  />
                </button>
              ))}
             {/* Optional: Button to clear selection */}
             <button
                key="clear"
                type="button"
                className={cn(
                  "flex items-center justify-center rounded-md border border-dashed text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 w-12 h-12",
                   !currentImageUrl ? "ring-2 ring-primary ring-offset-2 border-primary" : "hover:border-muted-foreground"
                )}
                onClick={() => handleImageSelect(null)}
                aria-label={t("ClearImageSelectionAriaLabel", "Clear image selection")}
             >
                <X className="h-5 w-5" />
             </button>
            </div>
          </PopoverContent>
        </Popover>
       </div>

      {/* Name Input Section */} 
      <div className="flex-grow min-w-0">
         {slot.isGenerated && !slot.generationError && slot.profile?.characterName ? (
            // Display generated name if available (non-editable for now)
            <span
              className="font-medium truncate block text-sm text-foreground"
              title={slot.profile.characterName}
            >
              {slot.profile.characterName}
            </span>
         ) : slot.generationError ? (
             <div className="flex items-center text-destructive text-sm gap-2">
               <ServerCrash className="h-5 w-5 text-destructive flex-shrink-0" />
               <span className="truncate" title={slot.generationError}>
                 {t("GenerationErrorPrefix", "Error")}: {slot.generationError}
               </span>
             </div>
         ) : (
            // Editable Name Input
            <Input
              id={`name-${slot.clientId}`}
              type="text"
              value={currentName}
              onChange={handleNameChange}
              placeholder={t("PlayerNamePlaceholder", "Enter name")}
              className="h-9 text-sm font-medium" // Adjust styling as needed
              disabled={isSubmitting}
              aria-label={t("PlayerNameAriaLabel", "Player name")}
            />
         )}

         {isHuman && (
             <span className="text-xs text-primary font-semibold block mt-0.5">
                {t("HumanPlayerLabel", "(You)")}
             </span>
         )}
      </div>

    </div>
  );
});
// --- End Helper Component ---

export const CharacterSlotMobile = React.memo(function CharacterSlotMobile({
  slot,
  isHuman,
  index,
  availableRoles,
  isSubmitting,
  canRemove,
  onUpdateRole,
  onUpdateProviderAndModel,
  onRemove,
  onUpdateName,
  onUpdateImageUrl,
}: CharacterSlotItemProps) {
  const { t } = useTranslation();

  const handleRemoveClick = () => {
    onRemove(slot.clientId);
  };

  const handleSlotProviderModelChange = (provider: string, model: string) => {
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

  // Remove Button
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
    <div
      className={cn(
        "p-4 border-b space-y-3",
        slot.generationError ? "bg-destructive/10" : "bg-card",
        isHuman ? "border border-primary/30 data-[state=selected]:bg-primary/10" : ""
      )}
      data-state={isHuman ? "selected" : undefined}
    >
      {/* Character Info & Remove Button */} 
      <div className="flex justify-between items-start">
        <CharacterInfo
           slot={slot}
           isHuman={isHuman}
           isSubmitting={isSubmitting}
           onUpdateName={onUpdateName}
           onUpdateImageUrl={onUpdateImageUrl}
         />
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
        <div className="grid grid-cols-2 gap-3">
          {/* Provider */}
          <div>
              <Label htmlFor={`slot-${slot.clientId}-pv-mobile-trigger`} className="text-xs font-medium text-muted-foreground mb-1 block">
                  {t("TableHeader_Provider", "AI Provider")}
              </Label>
              <ProviderModelSelector
                  {...providerModelSelectorProps}
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
                  idPrefix={`slot-${slot.clientId}-md-mobile`}
                  mode="model"
              />
          </div>
        </div>
      )}
    </div>
  );
});

export const CharacterSlotItem = React.memo(function CharacterSlotItem({
  slot,
  isHuman,
  index,
  availableRoles,
  isSubmitting,
  canRemove,
  onUpdateRole,
  onUpdateProviderAndModel,
  onRemove,
  onUpdateName,
  onUpdateImageUrl,
}: CharacterSlotItemProps) {
  const { t } = useTranslation();

  const handleRemoveClick = () => {
    onRemove(slot.clientId);
  };

  const handleSlotProviderModelChange = (provider: string, model: string) => {
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

  // Remove Button
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
    <TableRow
      className={cn(
        "transition-colors",
        slot.generationError ? "bg-destructive/10 hover:bg-destructive/20" : "hover:bg-muted/50",
        isHuman ? "border-primary/30 data-[state=selected]:bg-primary/10" : ""
      )}
      data-state={isHuman ? "selected" : undefined}
    >
      {/* Character Cell */}
      <TableCell className="font-medium w-[250px]">
        <CharacterInfo
           slot={slot}
           isHuman={isHuman}
           isSubmitting={isSubmitting}
           onUpdateName={onUpdateName}
           onUpdateImageUrl={onUpdateImageUrl}
        />
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
              idPrefix={`slot-${slot.clientId}-pv-desktop`}
              mode="provider"
            />
          </TableCell>
          <TableCell>
            <ProviderModelSelector
              {...providerModelSelectorProps}
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
  );
});
