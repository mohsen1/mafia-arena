"use client";

import { CharacterSlotItem } from "@/components/character-slot/CharacterSlotItem"; // Import the item component
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useGameConfig } from "@/hooks/useGameConfig";

import { RoleName } from "@/lib/engine/interfaces/IRole";
import {
  type LanguageCode,
  mapLanguageCodeToLongCode,
} from "@/lib/i18n/settings";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Languages,
  Loader2,
  Settings2,
  Trash2,
  UserPlus,
} from "lucide-react";
import { type FormEvent, useCallback, useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import LanguageSelector from "./LanguageSelector";
import { ProviderModelSelector } from "./ProviderModelSelector"; // Import the new component
import { GameThemeSelector } from "./GameThemeSelector"; // Import the GameThemeSelector
import {
  Table,
  TableBody,
  TableCaption,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const availableRolesForSelection: RoleName[] = [
  RoleName.Villager,
  RoleName.Mafia,
  RoleName.Seer,
  RoleName.Doctor,
];

// Define props, removing translations
export interface StartGameFormProps {
  lang: LanguageCode;
}

// Update component signature
export default function StartGameForm({ lang }: StartGameFormProps) {
  // Use the hook to get the t function
  const { t } = useTranslation();
  const [useSeparateAIModelForMafia, setUseSeparateAIModelForMafia] = useState(false);
  
  // Initialize Mafia provider state - will be synced later if needed
  const [mafiaProviderSelection, setMafiaProviderSelection] = useState<string>("");
  const [mafiaModelSelection, setMafiaModelSelection] = useState<string>("");

  const {
    characterSlots,
    isSubmitting,
    errorMsg,
    infoMsg,
    initialSlotsSet,
    configValidation,
    canAttemptStart,
    totalSlots,
    globalProviderSelection, // Get global provider from hook
    globalModelSelection,    // Get global model from hook
    availableProviders,
    availableModelsByProvider,
    isAudioEnabled,
    addPlayerSlot,
    removePlayerSlot,
    updateSlotProviderAndModel,
    updateAllProvidersAndModels,
    updateSlotRole,
    toggleAudioEnabled,
    handleGenerateAndStartGame,
    isLoadingNextTurn,
    isHumanJoining,
    humanPlayerName,
    toggleHumanJoining,
    updateHumanPlayerName,
    selectedGameThemeKey,   // Get selected theme
    setSelectedGameThemeKey, // Get theme setter
    setCharacterSlots,        // Get the setter from the hook
  } = useGameConfig(
    lang,
    useSeparateAIModelForMafia, // Pass the flag
    mafiaProviderSelection,     // Pass Mafia provider state
    mafiaModelSelection         // Pass Mafia model state
  );

  // Effect to initialize and sync Mafia provider/model
  useEffect(() => {
    // Initialize Mafia state with global state when component mounts or global changes
    // But only if the separate config isn't already active
    if (!useSeparateAIModelForMafia && globalProviderSelection && globalModelSelection) {
      setMafiaProviderSelection(globalProviderSelection);
      setMafiaModelSelection(globalModelSelection);
    }
    // Only run when global selections change OR when the checkbox is toggled
  }, [globalProviderSelection, globalModelSelection, useSeparateAIModelForMafia]);

  // New combined handler for the ProviderModelSelector
  const handleGlobalProviderModelChange = useCallback(
    (provider: string, model: string) => {
      console.log(
        `[StartGameForm] handleGlobalProviderModelChange: provider=${provider}, model=${model}`
      );
      updateAllProvidersAndModels(provider, model);
    },
    [updateAllProvidersAndModels] // Dependency is the function from the hook
  );

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
    [handleGenerateAndStartGame]
  );

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

        {/* Use the new ProviderModelSelector for global settings */}
        <div className="mb-6 max-w-lg mx-auto">
          <Label className="text-sm font-medium text-muted-foreground whitespace-nowrap flex items-center gap-1">
            <Bot size={16} className="me-1" />
            {t("AI Engine", "AI Engine")}:
          </Label>
          <ProviderModelSelector
            idPrefix="global"
            selectedModel={globalModelSelection}
            onProviderModelChange={handleGlobalProviderModelChange}
            disabled={isSubmitting}
          />
        </div>

        {/* Checkbox to choose a different AI Engine for Mafia players */}
        <div className="mb-2 max-w-lg mx-auto">
          <Checkbox
            id="mafia-engine-checkbox"
            checked={useSeparateAIModelForMafia}
            onCheckedChange={() => setUseSeparateAIModelForMafia(!useSeparateAIModelForMafia)}
            disabled={isSubmitting}
            aria-label={t("UseDifferentEngineForMafiaLabel", "Use a separate AI engine for Mafia players")}
          />
          <Label
            htmlFor="mafia-engine-checkbox"
            className="ms-2 inline text-sm font-medium text-muted-foreground whitespace-nowrap cursor-pointer"
          >
            {t("UseDifferentEngineForMafiaLabel", "Use a separate AI engine for Mafia players")}
          </Label>
        </div>

        {useSeparateAIModelForMafia && (
          <div className="mb-6 max-w-lg mx-auto">
            <Label className="text-sm font-medium text-muted-foreground whitespace-nowrap flex items-center gap-1">
              {t("MafiaEngineLabel", "Mafia AI Engine")}:
            </Label>
            <ProviderModelSelector
              idPrefix="mafia"
              selectedProviderValue={mafiaProviderSelection}
              selectedModel={mafiaModelSelection}
              onProviderModelChange={(provider, model) => {
                setMafiaProviderSelection(provider);
                setMafiaModelSelection(model);
                setCharacterSlots(prevSlots =>
                  prevSlots.map(slot =>
                    slot.roleSelection === RoleName.Mafia && !slot.isHuman
                      ? { ...slot, provider: provider, aiModel: model, isGenerated: false }
                      : slot
                  )
                );
              }}
              disabled={isSubmitting}
            />
          </div>
        )}

        {/* Language Selector - Use the new component */}
        <div className="mt-4 mb-6 flex flex-col items-start justify-center gap-1 max-w-lg mx-auto">
          <Label className="text-sm font-medium text-muted-foreground whitespace-nowrap flex items-center gap-1">
            <Languages size={16} className="me-1" />
            {t("GameLanguageLabel", "Game Language")}:
          </Label>
          <LanguageSelector currentLang={lang} />
        </div>

        {/* Game Theme Selector - Use the new component */}
        <div className="mb-6 max-w-lg mx-auto">
          <GameThemeSelector
            selectedThemeKey={selectedGameThemeKey}
            onThemeChange={setSelectedGameThemeKey}
            disabled={isSubmitting}
          />
        </div>

        {/* Human Player Join Option */}
        <div className="mb-6 flex items-center justify-center gap-3">
          <Checkbox
            id="human-join"
            checked={isHumanJoining}
            onCheckedChange={toggleHumanJoining}
            disabled={isLoading}
            aria-label={t(
              "ToggleHumanPlayerJoinLabel",
              "Toggle joining as a human player"
            )}
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
            <Label
              htmlFor="human-name"
              className="text-sm font-medium text-muted-foreground"
            >
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
              "Generate characters and start new game"
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
          {!initialSlotsSet && availableProviders.length > 0 && (
            <div className="flex justify-center items-center h-20 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />{" "}
              {t("LoadingSetupLabel", "Loading setup...")}
            </div>
          )}
          {!initialSlotsSet && availableProviders.length === 0 && (
            <p className="text-center text-sm text-warning">
              {t(
                "WaitingForProvidersLabel",
                "Waiting for available AI providers..."
              )}
            </p>
          )}

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
                  characterSlots[characterSlots.length - 1].clientId
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

          {/* Status/Error Message Area */}
          <div className="h-10 text-center flex items-center justify-center px-2 mt-4 mb-2 text-sm">
            {errorMsg ? (
              <p className="text-destructive flex items-center gap-1">
                <AlertTriangle className="h-8 w-8" /> {t(errorMsg, errorMsg)}
              </p>
            ) : isSubmitting ? (
              <p className="text-primary flex items-center gap-1">
                <Loader2 className="h-4 w-4 animate-spin" />{" "}
                {t(infoMsg || "ProcessingLabel", infoMsg || "Processing...")}
              </p>
            ) : configValidation.isValid ? (
              <p className="text-success flex items-center gap-1 text-start">
                <CheckCircle2 className="h-8 w-8" />{" "}
                {`${t(
                  "ConfigLooksGood_Prefix",
                  "Configuration looks good"
                )} ${t(
                  "ConfigLooksGood_Suffix",
                  "(Ready to Generate & Start)"
                )}`}
              </p>
            ) : initialSlotsSet ? (
              <p className="text-warning flex items-center gap-1">
                <AlertTriangle className="h-8 w-8" />{" "}
                {t(
                  configValidation.message || "ConfigInvalid",
                  configValidation.message || ""
                )}
              </p>
            ) : (
              <p className="text-muted-foreground italic">
                {t(
                  "InitialConfigPrompt",
                  "Configure player slots, roles, providers, and models."
                )}
              </p>
            )}
          </div>

          {initialSlotsSet && characterSlots.length > 0 && (
            <Table className="pe-2">
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="w-[150px]">
                    {t("TableHeader_Character", "Character")}
                  </TableHead>
                  {/* Hide Role header on mobile */}
                  <TableHead className="hidden md:table-cell">
                    {t("TableHeader_Role", "Role")}
                  </TableHead>
                  {/* Hide AI Provider header on mobile */}
                  <TableHead className="hidden md:table-cell">
                    {t("TableHeader_Provider", "AI Provider")}
                  </TableHead>
                  {/* Hide AI Model header on mobile */}
                  <TableHead className="hidden md:table-cell">
                    {t("TableHeader_Model", "AI Model")}
                  </TableHead>
                  {/* Hide Actions header on mobile */}
                  <TableHead className="text-right hidden md:table-cell">
                    {t("TableHeader_Actions", "Actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {characterSlots.map((slot, index) => (
                  <CharacterSlotItem
                    key={slot.clientId}
                    slot={slot}
                    index={index}
                    isHuman={slot.isHuman ?? false}
                    humanPlayerName={slot.isHuman ? humanPlayerName : undefined}
                    availableRoles={availableRolesForSelection}
                    isSubmitting={isLoading}
                    canRemove={characterSlots.length > 5}
                    onUpdateRole={updateSlotRole}
                    onUpdateProviderAndModel={updateSlotProviderAndModel}
                    onRemove={removePlayerSlot}
                  />
                ))}
              </TableBody>
            </Table>
          )}
          {initialSlotsSet && characterSlots.length === 0 && (
            <p className="text-center text-sm text-muted-foreground italic py-4">
              {t(
                "AddPlayerSlotsPrompt",
                "Use the '+' button to add player slots (minimum 5)."
              )}
            </p>
          )}
        </div>
      )}
    </form>
  );
}
