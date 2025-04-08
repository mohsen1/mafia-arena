'use client';

import { generateCharacterAction, startGameAction } from '@/app/actions'; // Import both actions
import { DEFAULT_GAME_SETTINGS } from '@/lib/config';
import { PlayerInitializationData, AICharacterProfile, Role } from '@/lib/types/game'; // Import necessary types
import { Loader2, ServerCrash, Trash2, UserPlus, Users, X, Bot, Wand2 } from 'lucide-react'; // Added icons
import Image from 'next/image'; // Import Next.js Image component
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button'; // Import the Button component
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from "@/components/ui/select"; // Import Select components
import { Input } from "@/components/ui/input"; // Import Input for player count
import { Label } from "@/components/ui/label"; // Import Label

// --- Updated ConfigCharacter Interface ---
// Represents a character slot, which may or may not be generated yet.
interface ConfigCharacterSlot {
    clientId: string; // Unique identifier for the slot/character
    aiModel: string;  // Model selected for this slot
    role?: Role; // Assigned after generation
    profile?: AICharacterProfile; // Assigned after generation
    imageUrl?: string | null; // Assigned after generation
    isGenerated: boolean; // Flag to check if generation completed
    generationError?: string; // Store individual generation errors
}

// Validation result structure (no changes needed here)
interface ValidationResult {
    isValid: boolean;
    message?: string;
    playerCount: number;
    roleCounts: Record<Role, number>;
}

// Define props for the component
interface StartGameFormProps {
    availableModels: string[]; // Prop for fetched model IDs
}

// --- Updated Validation Logic ---
// Validates the setup *after* characters have been generated.
function validateGeneratedGameSetup(characters: ConfigCharacterSlot[]): ValidationResult {
    const generatedCharacters = characters.filter(c => c.isGenerated && c.role); // Only validate generated chars with roles
    const playerCount = generatedCharacters.length;

    // If no characters are generated yet, it's not ready but not invalid either
    if (playerCount === 0) {
        return { isValid: false, message: `Generate characters first.`, playerCount: characters.length, roleCounts: {} as any };
    }

    // Check for any generation errors
    const errors = characters.filter(c => c.generationError);
    if (errors.length > 0) {
         return { isValid: false, message: `Resolve ${errors.length} generation error(s) before starting.`, playerCount, roleCounts: {} as any };
    }


    const roleCounts: Record<Role, number> = {
        Werewolf: 0,
        Seer: 0,
        Doctor: 0,
        Villager: 0,
    };
    generatedCharacters.forEach(c => {
        if (c.role) { // Type guard
            roleCounts[c.role]++;
        }
    });

    // Rule 1: Minimum Players (apply to generated characters)
    if (playerCount < 5) {
        return { isValid: false, message: `Requires at least 5 successfully generated players (currently ${playerCount}).`, playerCount, roleCounts };
    }

    // Rule 2: Werewolf Count vs Others
    const nonWerewolves = roleCounts.Villager + roleCounts.Seer + roleCounts.Doctor;
    if (roleCounts.Werewolf >= nonWerewolves) {
        return { isValid: false, message: `Too many Werewolves (${roleCounts.Werewolf}) relative to others (${nonWerewolves}). Adjust roles if possible or regenerate.`, playerCount, roleCounts };
    }

    // Rule 3: At least one Werewolf
    if (roleCounts.Werewolf === 0) {
        return { isValid: false, message: `At least one Werewolf is required.`, playerCount, roleCounts };
    }

    // Rule 4: Max Special Roles
    if (roleCounts.Seer > 1) {
        return { isValid: false, message: `Maximum 1 Seer allowed.`, playerCount, roleCounts };
    }
    if (roleCounts.Doctor > 1) {
        return { isValid: false, message: `Maximum 1 Doctor allowed.`, playerCount, roleCounts };
    }

    // All checks passed
    return { isValid: true, message: `Ready: ${playerCount} players generated.`, playerCount, roleCounts };
}

// --- Assign Roles Logic ---
// Simple role assignment based on default distribution counts.
// Returns a shuffled list of roles for the given player count.
function assignRoles(playerCount: number): Role[] {
    let roles: Role[] = [];
    const desiredCounts = DEFAULT_GAME_SETTINGS.roleDistribution;
    let totalDesired = Object.values(desiredCounts).reduce((sum, count) => sum + count, 0);

    // Basic scaling attempt (can be improved)
    if (playerCount < 5) return []; // Should be handled by validation

    let assignedWerewolves = Math.max(1, Math.floor(playerCount / 4)); // Ensure at least 1 werewolf
    let assignedSeer = playerCount >= 5 ? 1 : 0;
    let assignedDoctor = playerCount >= 6 ? 1 : 0; // Maybe add doctor at 6+
    let assignedVillagers = playerCount - assignedWerewolves - assignedSeer - assignedDoctor;

    roles = [
        ...Array(assignedWerewolves).fill('Werewolf'),
        ...Array(assignedSeer).fill('Seer'),
        ...Array(assignedDoctor).fill('Doctor'),
        ...Array(assignedVillagers).fill('Villager'),
    ];

    // Shuffle roles
    for (let i = roles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [roles[i], roles[j]] = [roles[j], roles[i]];
    }

    // Ensure the count matches exactly, adjusting villagers if needed (rare)
     while (roles.length < playerCount) roles.push('Villager');
     while (roles.length > playerCount) roles.pop(); // Should ideally not happen with above logic

    return roles;
}

const availableRoles: Role[] = ['Villager', 'Werewolf', 'Seer', 'Doctor'];

export default function StartGameForm({ availableModels }: StartGameFormProps) { // Destructure props
    const defaultModel = useMemo(() => {
        const preferred = DEFAULT_GAME_SETTINGS.aiModel;
        if (availableModels && availableModels.length > 0) {
            return availableModels.includes(preferred) ? preferred : availableModels[0];
        }
        return preferred; // Fallback
    }, [availableModels]);

    // State for character slots
    const [characterSlots, setCharacterSlots] = useState<ConfigCharacterSlot[]>([]);
    // State for loading during character generation phase
    const [isGenerating, setIsGenerating] = useState(false);
    // State for submitting the final game start request
    const [isSubmitting, setIsSubmitting] = useState(false);
    // State for displaying errors
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    // State to track if initial slots have been set
    const [initialSlotsSet, setInitialSlotsSet] = useState(false);

    // --- Effect to set initial player slots ---
     useEffect(() => {
         if (initialSlotsSet || availableModels.length === 0) return; // Run only once when models are loaded

         const initialPlayerCount = Math.max(5, Object.values(DEFAULT_GAME_SETTINGS.roleDistribution).reduce((sum, count) => sum + count, 0));
         const initialSlots: ConfigCharacterSlot[] = Array.from({ length: initialPlayerCount }).map(() => ({
             clientId: crypto.randomUUID(),
             aiModel: defaultModel, // Use the determined default model
             isGenerated: false,
         }));
         setCharacterSlots(initialSlots);
         setInitialSlotsSet(true); // Mark as set
     }, [availableModels, defaultModel, initialSlotsSet]); // Depend on models and defaultModel

    // Memoized validation result based on generated characters
    const validation = useMemo(() => validateGeneratedGameSetup(characterSlots), [characterSlots]);
    const totalSlots = characterSlots.length;
    const canGenerate = totalSlots >= 5 && !isGenerating && !isSubmitting;
    const generatedCount = characterSlots.filter(c => c.isGenerated).length;
    const canStartGame = generatedCount > 0 && validation.isValid && !isGenerating && !isSubmitting;

    // --- Functions to manage character slots ---
    const addPlayerSlot = useCallback(() => {
        setCharacterSlots(prev => [
            ...prev,
            {
                clientId: crypto.randomUUID(),
                aiModel: defaultModel, // Use default model for new slots
                isGenerated: false,
            }
        ]);
        setErrorMsg(null);
    }, [defaultModel]);

    const removePlayerSlot = useCallback((clientIdToRemove: string) => {
        setCharacterSlots(prev => prev.filter(c => c.clientId !== clientIdToRemove));
        setErrorMsg(null);
    }, []);

    const updateSlotModel = useCallback((clientId: string, newModel: string) => {
        setCharacterSlots(prev => prev.map(slot =>
            slot.clientId === clientId ? { ...slot, aiModel: newModel, isGenerated: false, profile: undefined, role: undefined, imageUrl: undefined, generationError: undefined } : slot // Reset generation status on model change
        ));
        setErrorMsg(null);
    }, []);

    // --- Character Generation Handler ---
    const handleGenerateCharacters = useCallback(async () => {
        if (!canGenerate) return;

        setIsGenerating(true);
        setErrorMsg(null);
        // Reset generation status and errors for all slots before regenerating
        setCharacterSlots(prev => prev.map(slot => ({ ...slot, isGenerated: false, profile: undefined, role: undefined, imageUrl: undefined, generationError: undefined })));

        const rolesToAssign = assignRoles(characterSlots.length);
        if (rolesToAssign.length !== characterSlots.length) {
            setErrorMsg("Could not assign roles correctly. Check player count.");
            setIsGenerating(false);
            return;
        }

        // Map each slot to a generation promise
        const generationPromises = characterSlots.map(async (slot, index) => {
            const assignedRole = rolesToAssign[index];
            try {
                 // Get profiles generated *so far* in this batch for context
                 // NOTE: This is tricky with Promise.all. For true sequential context,
                 // a sequential loop (less performant) or more complex state management is needed.
                 // Here, we pass an empty context for simplicity in parallel generation.
                 // TODO: Revisit context passing if needed for better character variety.
                 const result = await generateCharacterAction(assignedRole, slot.aiModel, []); // Pass empty context for now

                 if ('error' in result) {
                    throw new Error(result.error);
                 }
                 // Return successful generation data
                 return { clientId: slot.clientId, role: assignedRole, profile: result.profile, imageUrl: result.imageUrl, isGenerated: true };
            } catch (err: any) {
                // Return error information for this specific slot
                return { clientId: slot.clientId, isGenerated: false, generationError: err.message || 'Unknown generation error' };
            }
        });

        // Execute all generation promises
        const results = await Promise.allSettled(generationPromises);

        // Update character slots state with results
        setCharacterSlots(prevSlots => {
            const updatedSlots = [...prevSlots]; // Create a mutable copy
            results.forEach((settledResult, index) => {
                const targetClientId = prevSlots[index].clientId; // Get clientId based on original order
                const slotIndexToUpdate = updatedSlots.findIndex(s => s.clientId === targetClientId);

                if (slotIndexToUpdate !== -1) {
                     if (settledResult.status === 'fulfilled') {
                         const data = settledResult.value;
                         updatedSlots[slotIndexToUpdate] = {
                             ...updatedSlots[slotIndexToUpdate], // Keep existing aiModel etc.
                             role: data.role,
                             profile: data.profile,
                             imageUrl: data.imageUrl,
                             isGenerated: data.isGenerated,
                             generationError: data.generationError, // Will be undefined on success
                         };
                     } else { // status === 'rejected' (shouldn't happen with try/catch inside promise)
                         // Fallback if the inner try/catch somehow fails
                         updatedSlots[slotIndexToUpdate] = {
                             ...updatedSlots[slotIndexToUpdate],
                             isGenerated: false,
                             generationError: 'Unexpected promise rejection',
                         };
                     }
                 }
            });
             return updatedSlots;
        });

        setIsGenerating(false);
        // Check if any generation failed overall
        if (results.some(r => r.status === 'fulfilled' && r.value.generationError)) {
            setErrorMsg("Some characters failed to generate. Check the list below.");
        }

    }, [characterSlots, canGenerate]); // Dependency on characterSlots

    // --- Form Submission Handler (Start Game) ---
    const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!canStartGame) return;

        setIsSubmitting(true);
        setErrorMsg(null);

        try {
            // Prepare data for startGameAction, filtering out non-generated/error states
            const charactersToSubmit: PlayerInitializationData[] = characterSlots
                .filter(slot => slot.isGenerated && !slot.generationError && slot.profile && slot.role) // Ensure valid generated state
                .map(({ clientId, isGenerated, generationError, ...rest }) => ({
                     ...rest,
                     aiModel: rest.aiModel, // Ensure aiModel is part of the submitted data
                     profile: rest.profile!, // Assert non-null based on filter
                     role: rest.role!,       // Assert non-null based on filter
                }));

            // Check again if we still have enough valid players after filtering
             if (charactersToSubmit.length < 5) {
                 throw new Error(`Need at least 5 successfully generated players to start (have ${charactersToSubmit.length}).`);
             }

            // The startGameAction needs to be adapted on the backend
            // to accept the array of characters, each potentially having a different aiModel.
            const result = await startGameAction(charactersToSubmit); // Remove the second 'unused' argument

            if (result && 'error' in result) {
                throw new Error(result.error);
            }
            // On success, the page should redirect or update state, handled by the action/server response
        } catch (error: any) {
            console.error("Starting game failed:", error);
            setErrorMsg(`Failed to start game: ${error.message}`);
            setIsSubmitting(false); // Allow retry only on failure
        }
        // No setIsSubmitting(false) on success, usually involves navigation
    };

    return (
        <form
            onSubmit={handleFormSubmit}
            className="mb-8 p-6 bg-white dark:bg-gray-800 shadow-md rounded-lg border border-gray-200 dark:border-gray-700"
        >
            <h2 className="text-2xl font-bold mb-6 text-gray-700 dark:text-gray-300 text-center">Configure New Game</h2>

            {/* Player Count Adjustment */}
            <div className="mb-6 flex items-center justify-center gap-4">
                 <Label className="text-sm font-medium text-gray-600 dark:text-gray-400">Players:</Label>
                 <span className="text-lg font-semibold text-gray-800 dark:text-gray-200 w-10 text-center">{totalSlots}</span>
                 <Button
                     type="button"
                     variant="outline"
                     size="icon"
                     onClick={addPlayerSlot}
                     disabled={isGenerating || isSubmitting}
                     aria-label="Add player slot"
                 >
                     <UserPlus className="h-4 w-4" />
                 </Button>
                 {/* Only allow removing if above minimum */}
                 <Button
                     type="button"
                     variant="outline"
                     size="icon"
                     onClick={() => totalSlots > 0 && removePlayerSlot(characterSlots[characterSlots.length - 1].clientId)} // Remove last added
                     disabled={isGenerating || isSubmitting || totalSlots <= 5} // Disable remove below 5 players
                     aria-label="Remove last player slot"
                 >
                      <Trash2 className="h-4 w-4 text-red-500" />
                 </Button>
            </div>

            {/* Character Slot List & Configuration */}
            <div className="mb-4 p-4 border border-gray-200 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-750 min-h-[200px]">
                 <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-3 text-center">Character Setup</h3>
                 {!initialSlotsSet && availableModels.length > 0 && (
                      <div className="flex justify-center items-center h-20 text-gray-500 dark:text-gray-400">
                          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading setup...
                      </div>
                 )}
                 {availableModels.length === 0 && (
                    <p className="text-center text-sm text-yellow-600 dark:text-yellow-500">Waiting for available AI models...</p>
                 )}

                 {initialSlotsSet && characterSlots.length > 0 && (
                     <ul className="space-y-3 max-h-80 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-gray-100 dark:scrollbar-track-gray-800 pr-2">
                         {characterSlots.map((slot, index) => (
                             <li key={slot.clientId} className={`p-3 rounded border dark:border-gray-600 shadow-sm transition-all duration-300 ease-in-out ${slot.generationError ? 'bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-700' : 'bg-white dark:bg-gray-700 border-gray-200'}`}>
                                 <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                     {/* Left side: Status/Generated Info */}
                                     <div className="flex items-center gap-3 flex-grow min-w-0">
                                         {slot.isGenerated && !slot.generationError ? (
                                             <>
                                                 {slot.imageUrl ? (
                                                     <Image
                                                         src={slot.imageUrl}
                                                         alt={slot.profile?.characterName || 'Character'}
                                                         width={40}
                                                         height={40}
                                                         className="rounded-full object-cover w-10 h-10 flex-shrink-0"
                                                     />
                                                 ) : (
                                                     <div className="w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center flex-shrink-0">
                                                         <Users className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                                                     </div>
                                                 )}
                                                 <div className="truncate min-w-0">
                                                     <span className="font-medium truncate block text-sm text-gray-800 dark:text-gray-100" title={slot.profile?.characterName}>
                                                         {slot.profile?.characterName || 'Unnamed'}
                                                     </span>
                                                     <span className="text-xs text-gray-500 dark:text-gray-400">({slot.role})</span>
                                                 </div>
                                             </>
                                         ) : slot.generationError ? (
                                             <div className="flex items-center text-red-600 dark:text-red-400 text-sm flex-grow">
                                                  <ServerCrash className="h-4 w-4 mr-2 flex-shrink-0"/>
                                                  <span className="truncate" title={slot.generationError}>Error: {slot.generationError}</span>
                                             </div>
                                         ) : (
                                             <div className="flex items-center text-gray-500 dark:text-gray-400 flex-grow">
                                                 <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center flex-shrink-0">
                                                      <Bot className="h-5 w-5" />
                                                 </div>
                                                 <span className="ml-2 text-sm italic">Slot #{index + 1} - Ready to generate</span>
                                             </div>
                                         )}
                                     </div>

                                     {/* Right side: Model Selector & Remove */}
                                     <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto justify-end">
                                          <Select
                                             value={slot.aiModel}
                                             onValueChange={(newModel) => updateSlotModel(slot.clientId, newModel)}
                                             required
                                             disabled={isGenerating || isSubmitting || availableModels.length === 0}
                                         >
                                             <SelectTrigger className="w-full sm:w-[180px] text-xs h-9" id={`model-${slot.clientId}`}>
                                                 <SelectValue placeholder="Select model" />
                                             </SelectTrigger>
                                             <SelectContent>
                                                 {availableModels.length === 0 ? (
                                                     <SelectItem value="loading" disabled>Loading...</SelectItem>
                                                 ) : (
                                                     availableModels.map(modelId => (
                                                         <SelectItem key={modelId} value={modelId} className="text-xs">{modelId}</SelectItem>
                                                     ))
                                                 )}
                                             </SelectContent>
                                         </Select>
                                         {characterSlots.length > 5 && ( // Only show remove if > 5
                                              <Button
                                                 type="button"
                                                 variant="ghost"
                                                 size="icon"
                                                 onClick={() => removePlayerSlot(slot.clientId)}
                                                 disabled={isGenerating || isSubmitting}
                                                 className="p-1 text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-500 h-9 w-9"
                                                 aria-label={`Remove player slot ${index + 1}`}
                                               >
                                                 <X className="h-4 w-4" />
                                             </Button>
                                         )}
                                     </div>
                                 </div>
                             </li>
                         ))}
                     </ul>
                 )}
                  {initialSlotsSet && characterSlots.length === 0 && (
                      <p className="text-center text-sm text-gray-500 dark:text-gray-400 italic py-4">Use the '+' button to add player slots.</p>
                  )}
            </div>

            {/* Action Buttons: Generate & Start */}
            <div className="mt-6 space-y-3">
                 {/* Generate Button */}
                 <Button
                     type="button"
                     onClick={handleGenerateCharacters}
                     className="w-full px-6 py-2.5 text-base font-semibold flex justify-center items-center gap-2"
                     variant="secondary"
                     disabled={!canGenerate}
                     aria-label="Generate characters for all slots"
                 >
                     {isGenerating ? (
                         <>
                             <Loader2 className="h-5 w-5 animate-spin" />
                             Generating Characters...
                         </>
                     ) : (
                         <>
                             <Wand2 className="h-5 w-5" /> Generate Characters ({totalSlots} Players)
                         </>
                     )}
                 </Button>

                 {/* Status/Error Message Area */}
                <div className="h-8 text-center flex items-center justify-center px-2">
                     {errorMsg ? (
                         <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1"><ServerCrash className="h-4 w-4"/> {errorMsg}</p>
                     ) : !isGenerating && !isSubmitting && generatedCount > 0 ? ( // Only show validation message after generation attempt
                          <p className={`text-sm ${validation.isValid ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                             {validation.message || 'Setup status pending...'}
                          </p>
                      ) : totalSlots < 5 && initialSlotsSet ? (
                          <p className="text-sm text-yellow-600 dark:text-yellow-400">Requires at least 5 players.</p>
                      ) : (
                          <p className="text-sm text-gray-500 dark:text-gray-400 italic">Configure slots and generate characters.</p> // Default placeholder
                      )
                     }
                </div>

                 {/* Start Game Button */}
                 <Button
                     type="submit"
                     className="w-full px-6 py-3 text-lg font-semibold flex justify-center items-center cursor-pointer"
                     size="lg"
                     disabled={!canStartGame} // Use canStartGame flag
                     aria-label="Start new game with generated characters"
                 >
                     {isSubmitting ? (
                         <>
                             <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                             Creating game...
                         </>
                     ) : (
                         'Start New Game'
                     )}
                 </Button>
            </div>
        </form>
    );
} 