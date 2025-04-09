"use client";

import { CharacterSlotItem } from "@/components/CharacterSlotItem"; // Import the item component
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"; // Import Select components
import { Switch } from "@/components/ui/switch"; // Import Switch component
import {
  SupportedLanguage,
  supportedLanguages,
  useGameConfig,
} from "@/hooks/useGameConfig"; // Import the custom hook
import { useTranslation } from "@/hooks/useTranslation";
import { mapLanguageNameToCode } from "@/lib/translation/languages"; // Need this
import { Role } from "@/lib/types/game"; // Simplified imports
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Settings2,
  Trash2,
  UserPlus,
} from "lucide-react";
import { useMemo } from "react";

// Define available roles for selection (can be defined here or imported)
const availableRolesForSelection: Role[] = [
  "Villager",
  "Werewolf",
  "Seer",
  "Doctor",
];

// Define props for the component
// Change t prop to translations
export interface StartGameFormProps {
  availableModels: string[];
  translations: Record<string, string>; // Accept translations object
}

// Update component signature to accept translations
export default function StartGameForm({
  availableModels,
  translations,
}: StartGameFormProps) {
  // Instantiate the translation hook here
  const {
    t,
    isLoading: isTLoading,
    error: tError,
  } = useTranslation({
    translations: translations, // Initialize with passed translations
    // No need to pass loading/error state from here
  });

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
    selectedLanguage,
    addPlayerSlot,
    removePlayerSlot,
    updateSlotModel,
    updateAllModels,
    updateSlotRole,
    updateLanguage,
    handleGenerateAndStartGame,
    isAudioEnabled, // Get audio state
    toggleAudioEnabled, // Get audio toggle function
  } = useGameConfig(availableModels); // Call hook without t

  // Combine submission state with translation loading state
  const isLoading = isSubmitting || isTLoading;

  // Handle translation error locally
  if (tError) {
    // Simple error display for now
    return (
      <div className="text-red-500 p-4">Error with translations: {tError}</div>
    );
  }

  // Create a number formatter based on selected language
  const numberFormatter = useMemo(() => {
    // Map language name (e.g., 'Persian') to locale code (e.g., 'fa-IR')
    const langCode = mapLanguageNameToCode(selectedLanguage);
    const locale =
      langCode === "fa" ? "fa-IR" : langCode === "de" ? "de-DE" : "en-US"; // Map to appropriate locale
    try {
      return new Intl.NumberFormat(locale);
    } catch (e) {
      console.error("Failed to create NumberFormat for locale:", locale, e);
      return new Intl.NumberFormat("en-US"); // Fallback
    }
  }, [selectedLanguage]);

  return (
    <div className="mb-8 p-6 bg-white dark:bg-gray-800 rounded-lg relative">
      {/* Display loading indicator (submission or translation loading) */}
      {(isLoading || isTLoading) && (
        <div className="absolute inset-0 bg-white/50 dark:bg-black/50 flex items-center justify-center z-10">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      )}

      <h2 className="text-2xl font-bold mb-6 text-gray-700 dark:text-gray-300 text-center">
        {t("ConfigureNewGameTitle", "Configure New Game")}
      </h2>

      {/* Player Count Adjustment - Use Formatter */}
      <div className="mb-4 flex items-center justify-center gap-4">
        <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">
          {t("PlayersLabel", "Players")}:
        </Label>
        {/* Format the totalSlots number */}
        <span className="text-lg font-semibold text-gray-800 dark:text-gray-200 w-10 text-center">
          {numberFormatter.format(totalSlots)}
        </span>
        <Button
          type="button"
          variant="ghost"
          onClick={addPlayerSlot}
          disabled={isLoading}
          aria-label={t("AddPlayerSlotLabel", "Add player slot")}
        >
          <span>{t("AddPlayerButtonLabel", "Add")}</span>
          <UserPlus className="h-4 w-4 mr-1" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() =>
            totalSlots > 0 &&
            removePlayerSlot(characterSlots[characterSlots.length - 1].clientId)
          }
          disabled={isLoading || totalSlots <= 5}
          aria-label={t("RemovePlayerSlotLabel", "Remove last player slot")}
        >
          <span className="text-red-500">{t("RemovePlayerButtonLabel", "Remove")}</span>
          <Trash2 className="h-4 w-4 mr-1 text-red-500" />
        </Button>
      </div>

      {/* Global Model Selector - Add rtl:flex-row-reverse */}
      <div className="mb-6 flex items-center justify-center gap-2 rtl:flex-row-reverse">
        <Label
          htmlFor="global-model-select"
          className="text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap"
        >
          {t("GlobalAIModelLabel", "Global AI Model")}:
        </Label>
        <Select
          value={globalModelSelection}
          onValueChange={updateAllModels}
          disabled={isLoading || availableModels.length === 0}
        >
          <SelectTrigger
            id="global-model-select"
            className="w-full max-w-xs text-sm h-9"
          >
            <SelectValue
              placeholder={t(
                "SelectGlobalModelPlaceholder",
                "Select global model"
              )}
            />
          </SelectTrigger>
          <SelectContent>
            {availableModels.length === 0 && !initialSlotsSet ? (
              <SelectItem value="loading" disabled>
                {t("LoadingLabel", "Loading...")}
              </SelectItem>
            ) : (
              availableModels.map((modelId) => (
                <SelectItem key={modelId} value={modelId} className="text-sm">
                  {modelId}
                </SelectItem>
              ))
            )}
            {availableModels.length === 0 && initialSlotsSet && (
              <SelectItem value="no-models" disabled>
                {t("NoModelsAvailableLabel", "No models available")}
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Language Selector - Add rtl:flex-row-reverse */}
      <div className="mb-6 flex items-center justify-center gap-2 rtl:flex-row-reverse">
        <Label
          htmlFor="language-select"
          className="text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap"
        >
          {t("GameLanguageLabel", "Game Language")}:
        </Label>
        <Select
          value={selectedLanguage}
          onValueChange={(value) => updateLanguage(value as SupportedLanguage)}
          disabled={isLoading}
        >
          <SelectTrigger
            id="language-select"
            className="w-full max-w-xs text-sm h-9"
          >
            <SelectValue
              placeholder={t("SelectLanguagePlaceholder", "Select language")}
            />
          </SelectTrigger>
          <SelectContent>
            {supportedLanguages.map((lang) => (
              <SelectItem key={lang} value={lang} className="text-sm">
                {lang}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Audio Enable Toggle - Add rtl:flex-row-reverse */}
      <div className="mb-6 flex items-center justify-center gap-3 rtl:flex-row-reverse">
        <Label
          htmlFor="audio-toggle"
          className="text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap"
        >
          {t("EnableAudioLabel", "Enable Audio")}:
        </Label>
        <Switch
          id="audio-toggle"
          checked={isAudioEnabled}
          onCheckedChange={toggleAudioEnabled}
          disabled={isLoading}
          aria-label={t("ToggleGameAudioLabel", "Toggle game audio")}
        />
      </div>

      {/* Generate & Start Game Button */}
      <Button
        type="button"
        onClick={handleGenerateAndStartGame}
        className="w-full px-6 py-3 text-lg font-semibold flex justify-center items-center cursor-pointer"
        size="lg"
        disabled={!canAttemptStart || isLoading}
        aria-label={t(
          "GenerateAndStartGameButton",
          "Generate characters and start new game"
        )}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            {/* Translate button text based on state (using infoMsg key) */}
            {t(infoMsg || "StartingButtonLabel", infoMsg || "Starting...")}
          </>
        ) : (
          t("GenerateAndStartGameButton", "Generate & Start Game")
        )}
      </Button>

      {/* Character Slot List & Configuration */}
      <div className="my-4 p-4 rounded-md bg-gray-50 dark:bg-gray-750 min-h-[200px]">
        <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-3 text-center flex items-center justify-center gap-2">
          <Settings2 className="h-5 w-5" />{" "}
          {t("CharacterSetupLabel", "Character Setup")}
        </h3>
        {!initialSlotsSet && availableModels.length > 0 && (
          <div className="flex justify-center items-center h-20 text-gray-500 dark:text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />{" "}
            {t("LoadingSetupLabel", "Loading setup...")}
          </div>
        )}
        {availableModels.length === 0 && !initialSlotsSet && (
          <p className="text-center text-sm text-yellow-600 dark:text-yellow-500">
            {t("WaitingForModelsLabel", "Waiting for available AI models...")}
          </p>
        )}

        {initialSlotsSet && characterSlots.length > 0 && (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-gray-100 dark:scrollbar-track-gray-800 pr-2">
            {characterSlots.map((slot, index) => (
              <CharacterSlotItem
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
                translations={translations}
              />
            ))}
          </ul>
        )}
        {initialSlotsSet && characterSlots.length === 0 && (
          <p className="text-center text-sm text-gray-500 dark:text-gray-400 italic py-4">
            {t(
              "AddPlayerSlotsPrompt",
              "Use the '+' button to add player slots (minimum 5)."
            )}
          </p>
        )}
      </div>

      {/* Status/Error Message Area - Use t function */}
      <div className="h-10 text-center flex items-center justify-center px-2 mt-4 mb-2 text-sm">
        {errorMsg ? (
          <p className="text-red-600 dark:text-red-400 flex items-center gap-1">
            <AlertTriangle className="h-4 w-4" /> {t(errorMsg, errorMsg)}
          </p> // Attempt to translate error, fallback to original
        ) : isSubmitting ? (
          <p className="text-blue-600 dark:text-blue-400 flex items-center gap-1">
            <Loader2 className="h-4 w-4 animate-spin" />{" "}
            {t(infoMsg || "ProcessingLabel", infoMsg || "Processing...")}
          </p> // Translate info message
        ) : postGenValidationMsg ? (
          <p
            className={`flex items-center gap-1 ${
              isPostGenValid === true
                ? "text-green-600 dark:text-green-400"
                : isPostGenValid === false
                ? "text-yellow-600 dark:text-yellow-400"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            {isPostGenValid === true ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : isPostGenValid === false ? (
              <AlertTriangle className="h-4 w-4" />
            ) : null}
            {t(postGenValidationMsg, postGenValidationMsg)}{" "}
            {/* Translate post-gen validation msg */}
          </p>
        ) : configValidation.isValid ? (
          <p className="text-green-600 dark:text-green-400 flex items-center gap-1">
            <CheckCircle2 className="h-4 w-4" />{" "}
            {t("ConfigLooksGood_Prefix", "Configuration looks good") +
              ` (${numberFormatter.format(totalSlots)} ${t(
                "PlayersCount_Suffix",
                "players"
              )}).`}
          </p>
        ) : initialSlotsSet ? (
          <p className="text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
            <AlertTriangle className="h-4 w-4" />{" "}
            {t("ConfigInvalid", configValidation.message || "")}
          </p>
        ) : (
          <p className="text-gray-500 dark:text-gray-400 italic">
            {t(
              "InitialConfigPrompt",
              "Configure player slots, roles, and models."
            )}
          </p>
        )}
      </div>
    </div>
  );
}
