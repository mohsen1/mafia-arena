"use client";

import React from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Users, ServerCrash, Bot, X, Loader2, User } from "lucide-react";
import type { ConfigCharacterSlot } from "@/lib/types/game";
import type { TFunction } from "i18next";

interface CharacterSlotHeaderProps {
  slot: ConfigCharacterSlot;
  isHuman: boolean;
  index: number;
  isSubmitting: boolean;
  canRemove: boolean;
  onRemove: (clientId: string) => void;
  t: TFunction;
}

export function CharacterSlotHeader({
  slot,
  isHuman,
  index,
  isSubmitting,
  canRemove,
  onRemove,
  t,
}: CharacterSlotHeaderProps) {
  const handleRemoveClick = () => {
    onRemove(slot.clientId);
  };

  return (
    <div className="flex items-center justify-between gap-3">
      {/* Left side: Status/Generated Info */}
      <div className="flex items-center gap-3 flex-grow min-w-0">
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

        {/* --- Generated Name/Status (Moved inside image block) --- */}
        {/* {slot.isGenerated && !slot.generationError && (...) } */}

        {/* --- Generation Error (Moved inside error block) --- */}
        {/* {slot.generationError && (...) } */}
      </div>

      {/* Remove Button */}
      {canRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleRemoveClick}
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
  );
} 