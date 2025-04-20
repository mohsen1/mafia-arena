"use client";

import { CharacterSlotItem } from "@/components/character-slot/CharacterSlotItem"; // Import the item component
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useGameConfig } from "@/hooks/useGameConfig";

import { type LanguageCode, mapLanguageCodeToLongCode } from "@/lib/i18n/settings";
import type { Role } from "@/lib/types/game";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Loader2,
  Settings2,
  Trash2,
  UserPlus,
} from "lucide-react";
import { type FormEvent, useCallback, useMemo } from "react";
import { useTranslation } from 'react-i18next';
import LanguageSelector from "./LanguageSelector";
import ModelSelector from "./ModelSelector";


const availableRolesForSelection: Role[] = [
  "Villager",
  "Werewolf",
  "Seer",
  "Doctor",
];

// Define props, removing translations
export interface StartGameFormProps {
  availableModels: string[];
  lang: LanguageCode;
}

// Update component signature
export default function StartGameForm({
  availableModels,
  lang,
}: StartGameFormProps) {

  // Use the hook to get the t function
  const { t } = useTranslation();

  const {
    characterSlots,
    isSubmitting,
    errorMsg,
    infoMsg,
    initialSlotsSet,
    postGenValidationMsg,
    isPostGenValid,
    configValidation,
    canAttemptStart,
    totalSlots,
    globalModelSelection,
    addPlayerSlot,
    removePlayerSlot,
    updateSlotModel,
    updateAllModels,
    updateSlotRole,
    handleGenerateAndStartGame,
    isLoadingNextTurn,
    isHumanJoining, // Destructure new state
    humanPlayerName,
    toggleHumanJoining,
    updateHumanPlayerName,
  } = useGameConfig(availableModels, lang);

  // Use lang prop for numberFormatter
  const numberFormatter = useMemo(() => {
    const longCode = mapLanguageCodeToLongCode(lang);
    try {
      return new Intl.NumberFormat(longCode);
    } catch (e) {
      console.error("Failed to create NumberFormat for locale:", longCode, e);
      return new Intl.NumberFormat("en-US"); // Fallback
    }
  }, [lang]);

  const handleSubmitWrapper = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      handleGenerateAndStartGame();
    },
    [handleGenerateAndStartGame],
  );

  console.log(
    `[StartGameForm] Language from useGameConfig: ${lang}`,
  ); // Log language from hook

  // Combine submission state
  const isLoading = isSubmitting || isLoadingNextTurn;

  // Conditional error rendering using t helper or direct access
  if (errorMsg) {
    return (
      <div className="text-red-500 p-4">
          {t("ErrorPrefix", "Error")}: {t(errorMsg, errorMsg)}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmitWrapper} className="w-full max-w-5xl space-y-6">
      {/* Config container */}
      <div className="mb-6 max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold mb-6 text-foreground text-center">
          {t("ConfigureNewGameTitle", "Configure New Game")}
        </h2>

        {/* Player Count Adjustment - Use Formatter */}
        <div className="mb-4 flex items-center justify-center gap-4">
          <Label className="text-sm font-medium text-muted-foreground">
            {t("PlayersLabel", "Players")}:
          </Label>
          {/* Format the totalSlots number */}
          <span className="text-lg font-semibold text-foreground w-10 text-center">
            {numberFormatter.format(totalSlots)}
          </span>
          <Button
            type="button"
            variant="ghost"
            onClick={addPlayerSlot}
            disabled={isLoading}
            aria-label={t("AddPlayerSlotLabel", "Add player slot")}
          >
            <UserPlus className="h-4 w-4 mr-1" />
            <span>{t("AddPlayerButtonLabel", "Add")}</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              totalSlots > 0 &&
              removePlayerSlot(
                characterSlots[characterSlots.length - 1].clientId,
              )
            }
            disabled={isLoading || totalSlots <= 5}
            aria-label={t("RemovePlayerSlotLabel", "Remove last player slot")}
          >
            <Trash2 className="h-4 w-4 mr-1 text-red-500" />
            <span className="text-red-500">
              {t("RemovePlayerButtonLabel", "Remove")}
            </span>
          </Button>
        </div>

        {/* Global Model Selector */}
        <div className="mb-6 flex flex-col items-start justify-start gap-2 max-w-96 mx-auto">
          <Label
            htmlFor="global-model"
            className="text-sm font-medium text-muted-foreground whitespace-nowrap flex items-center gap-1"
          >
            <Bot size={16} />
            {t("GlobalAIModelLabel", "Global AI Model")}:
          </Label>
          <ModelSelector
            id="global-model"
            models={availableModels}
            selectedModel={globalModelSelection}
            onModelChange={updateAllModels}
            placeholder={t(
              "SelectGlobalModelPlaceholder",
              "Select global model",
            )}
            disabled={isSubmitting}
          />
        </div>

        {/* Language Selector - Use the new component */}
        <LanguageSelector currentLang={lang} />


        {/* Human Player Join Option */}
        <div className="mb-6 flex items-center justify-center gap-3">
          <Checkbox
            id="human-join"
            checked={isHumanJoining}
            onCheckedChange={toggleHumanJoining}
            disabled={isLoading}
            aria-label={t("ToggleHumanPlayerJoinLabel", "Toggle joining as a human player")}
          />
          <Label
            htmlFor="human-join"
            className="text-sm font-medium text-muted-foreground whitespace-nowrap cursor-pointer"
          >
            {t("JoinAsHumanLabel", "Join the game yourself?")}
          </Label>
        </div>

        {/* Human Player Name Input (Conditional) */}
        {isHumanJoining && (
          <div className="mb-6 flex flex-col items-center justify-center gap-2 max-w-xs mx-auto">
            <Label htmlFor="human-name" className="text-sm font-medium text-muted-foreground">
              {t("YourPlayerNameLabel", "Your Player Name")}:
            </Label>
            <Input
              id="human-name"
              type="text"
              value={humanPlayerName}
              onChange={(e) => updateHumanPlayerName(e.target.value)}
              placeholder={t("EnterYourNamePlaceholder", "Enter your name")}
              disabled={isLoading}
              required // Ensure a name is provided if joining
              className="text-center"
            />
          </div>
        )}

        {/* Submit Button - Remove onClick, ensure type="submit" */}
        <div className="flex justify-center pt-4">
          <Button
            type="submit"
            className="w-full px-6 py-3 text-lg font-semibold flex justify-center items-center cursor-pointer max-w-xs mx-auto"
            size="lg"
            disabled={!canAttemptStart || isSubmitting || isLoading}
            aria-label={t(
              "GenerateAndStartGameButton",
              "Generate characters and start new game",
            )}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                {t("StartingButtonLabel", "Starting...")}
              </>
            ) : (
              t("GenerateAndStartGameButton", "Generate & Start Game")
            )}
          </Button>
        </div>
      </div>

      {/* Character Slot List & Configuration - Conditionally hide when submitting */}
      {!isSubmitting && (
        <div className="my-4 p-4 rounded-md min-h-[200px]">
          <h3 className="text-lg font-medium text-foreground mb-3 text-center flex items-center justify-center gap-2">
            <Settings2 className="h-5 w-5" />{" "}
            {t("CharacterSetupLabel", "Character Setup")}
          </h3>
          {!initialSlotsSet && availableModels.length > 0 && (
            <div className="flex justify-center items-center h-20 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />{" "}
              {t("LoadingSetupLabel", "Loading setup...")}
            </div>
          )}
          {availableModels.length === 0 && !initialSlotsSet && (
            <p className="text-center text-sm text-warning">
              {t("WaitingForModelsLabel", "Waiting for available AI models...")}
            </p>
          )}

          {initialSlotsSet && characterSlots.length > 0 && (
            <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-muted pr-2">
              {characterSlots.map((slot, index) => (
                <CharacterSlotItem
                  isHuman={slot.isHuman ?? false}
                  key={slot.clientId}
                  slot={slot}
                  index={index}
                  availableModels={availableModels}
                  availableRoles={availableRolesForSelection}
                  isSubmitting={isLoading}
                  canRemove={characterSlots.length > 5}
                  onUpdateRole={updateSlotRole}
                  onUpdateModel={updateSlotModel}
                  onRemove={removePlayerSlot}
                />
              ))}
            </ul>
          )}
          {initialSlotsSet && characterSlots.length === 0 && (
            <p className="text-center text-sm text-muted-foreground italic py-4">
              {t(
                "AddPlayerSlotsPrompt",
                "Use the '+' button to add player slots (minimum 5).",
              )}
            </p>
          )}
        </div>
      )}

      {/* Status/Error Message Area */}
      <div className="h-10 text-center flex items-center justify-center px-2 mt-4 mb-2 text-sm">
        {errorMsg ? (
          <p className="text-destructive flex items-center gap-1">
            <AlertTriangle className="h-4 w-4" /> {t(errorMsg, errorMsg)}
          </p>
        ) : isSubmitting ? (
          <p className="text-primary flex items-center gap-1">
            <Loader2 className="h-4 w-4 animate-spin" />{" "}
            {t(infoMsg || 'ProcessingLabel', infoMsg || 'Processing...')}
          </p>
        ) : postGenValidationMsg ? (
          <p
            className={`flex items-center gap-1 ${
              isPostGenValid === true
                ? "text-success"
                : isPostGenValid === false
                  ? "text-warning"
                  : "text-muted-foreground"
            }`}
          >
            {isPostGenValid === true ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : isPostGenValid === false ? (
              <AlertTriangle className="h-4 w-4" />
            ) : null}
            {t(postGenValidationMsg, postGenValidationMsg)}{" "}
          </p>
        ) : configValidation.isValid ? (
          <p className="text-success flex items-center gap-1">
            <CheckCircle2 className="h-4 w-4" />{" "}
            {`${t("ConfigLooksGood_Prefix", "Configuration looks good")} ${t(
              "ConfigLooksGood_Suffix",
              "(Ready to Generate & Start)",
            )}`}
          </p>
        ) : initialSlotsSet ? (
          <p className="text-warning flex items-center gap-1">
            <AlertTriangle className="h-4 w-4" />{" "}
            {t(configValidation.message || 'ConfigInvalid', configValidation.message || "")}
          </p>
        ) : (
          <p className="text-muted-foreground italic">
            {t(
              "InitialConfigPrompt",
              "Configure player slots, roles, and models.",
            )}
          </p>
        )}
      </div>
    </form>
  );
}
