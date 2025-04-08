'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Loader2, X, UserPlus, Users, ShieldCheck, HeartPulse, CircleHelp, ServerCrash } from 'lucide-react'; // Added icons
import { startGameAction, generateCharacterAction } from '@/app/actions'; // Import both actions
import { DEFAULT_GAME_SETTINGS } from '@/lib/config';
import { Role, PlayerInitializationData, AICharacterProfile } from '@/lib/types/game'; // Import necessary types
import Image from 'next/image'; // Import Next.js Image component

// Update ConfigCharacter to include imageUrl
interface ConfigCharacter extends PlayerInitializationData {
    clientId: string;
    imageUrl?: string | null; // Store the selected image URL here
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

// --- Validation Logic (update input type) ---
function validateGameSetup(characters: ConfigCharacter[]): ValidationResult {
    const playerCount = characters.length;
    const roleCounts: Record<Role, number> = {
        Werewolf: 0,
        Seer: 0,
        Doctor: 0,
        Villager: 0,
    };
    characters.forEach(c => {
        roleCounts[c.role]++;
    });

    // Rule 1: Minimum Players
    if (playerCount < 5) { // Adjust minimum as needed
        return { isValid: false, message: `Requires at least 5 players (currently ${playerCount}).`, playerCount, roleCounts };
    }

    // Rule 2: Werewolf Count vs Others
    const nonWerewolves = roleCounts.Villager + roleCounts.Seer + roleCounts.Doctor;
    if (roleCounts.Werewolf >= nonWerewolves) {
        return { isValid: false, message: `Too many Werewolves (${roleCounts.Werewolf}) relative to others (${nonWerewolves}). Add more Villagers or special roles.`, playerCount, roleCounts };
    }
    
    // Rule 3: At least one Werewolf
     if (roleCounts.Werewolf === 0) {
         return { isValid: false, message: `At least one Werewolf is required.`, playerCount, roleCounts };
     }

    // Rule 4: Max Special Roles (Standard Setup)
    if (roleCounts.Seer > 1) {
        return { isValid: false, message: `Maximum 1 Seer allowed.`, playerCount, roleCounts };
    }
    if (roleCounts.Doctor > 1) {
        return { isValid: false, message: `Maximum 1 Doctor allowed.`, playerCount, roleCounts };
    }

    // All checks passed
    return { isValid: true, message: `Ready: ${playerCount} players.`, playerCount, roleCounts };
}

// --- Role Icons (no changes needed) ---
const RoleIcon = ({ role }: { role: Role }) => {
    switch (role) {
        case 'Werewolf': return <CircleHelp className="h-5 w-5 text-red-600" />; // Placeholder
        case 'Seer': return <ShieldCheck className="h-5 w-5 text-blue-600" />;
        case 'Doctor': return <HeartPulse className="h-5 w-5 text-green-600" />;
        case 'Villager': return <Users className="h-5 w-5 text-gray-600" />;
        default: return null;
    }
};

const availableRoles: Role[] = ['Villager', 'Werewolf', 'Seer', 'Doctor'];
const initialRoles: Role[] = ['Villager', 'Villager', 'Villager', 'Werewolf', 'Seer']; // Default 5 players

export default function StartGameForm({ availableModels }: StartGameFormProps) { // Destructure props
    // State for the list of generated characters
    const [characters, setCharacters] = useState<ConfigCharacter[]>([]);
    // State for overall form submission loading
    const [isSubmitting, setIsSubmitting] = useState(false);
    // State for initial character loading
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    // State to track which roles are currently being generated
    const [generatingRoles, setGeneratingRoles] = useState<Set<string>>(new Set()); // Use role + index as key
    // State for displaying errors
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    // State for the selected AI model
    const [selectedModel, setSelectedModel] = useState(() => {
        // Use the default from settings only if availableModels is empty or doesn't contain it
        const defaultModel = DEFAULT_GAME_SETTINGS.aiModel;
        if (availableModels && availableModels.length > 0) {
            // Prefer the default if it's in the list, otherwise take the first available
            return availableModels.includes(defaultModel) ? defaultModel : availableModels[0];
        } 
        return defaultModel; // Fallback if no models fetched
    });

    // Memoize validation result
    const validation = useMemo(() => validateGameSetup(characters), [characters]);

    // Function to add a character
    const addCharacter = useCallback(async (role: Role) => {
        const generationKey = `${role}-${Date.now()}`;
        setGeneratingRoles(prev => new Set(prev).add(generationKey));
        setErrorMsg(null);
        // Extract current profiles to send as context
        const currentProfiles = characters.map(c => c.profile);
        try {
            // Pass currentProfiles to the action
            const result = await generateCharacterAction(role, selectedModel, currentProfiles);
            if ('error' in result) {
                throw new Error(result.error);
            }
            setCharacters(prev => [...prev, { ...result, clientId: crypto.randomUUID() }]);
        } catch (err: any) { 
            setErrorMsg(`Failed to add ${role}: ${err.message}`);
        } finally {
            setGeneratingRoles(prev => {
                const next = new Set(prev);
                next.delete(generationKey);
                return next;
            });
        }
    }, [selectedModel, characters]);

    // Function to remove a character
    const removeCharacter = (clientIdToRemove: string) => {
        setCharacters(prev => prev.filter(c => c.clientId !== clientIdToRemove));
        setErrorMsg(null); // Clear error when list changes
    };

    // Effect for initial character load
    useEffect(() => {
        let isMounted = true;
        setIsInitialLoading(true);
        setErrorMsg(null);
        setCharacters([]); 

        const loadInitialCharacters = async () => {
            let loadedChars: ConfigCharacter[] = [];
            try {
                for (const role of initialRoles) {
                    if (!isMounted) break; // Stop if component unmounted
                    const generationKey = `${role}-initial-${loadedChars.length}`;
                    setGeneratingRoles(prev => new Set(prev).add(generationKey));
                    
                    // Pass profiles loaded so far as context
                    const currentProfiles = loadedChars.map(c => c.profile);
                    const result = await generateCharacterAction(role, selectedModel, currentProfiles);
                    
                    setGeneratingRoles(prev => {
                        const next = new Set(prev);
                        next.delete(generationKey);
                        return next;
                    });

                    if ('error' in result) {
                        console.warn(`Failed to generate initial ${role}: ${result.error}`);
                        // Optionally add placeholder or skip?
                        setErrorMsg(prev => prev ? `${prev}, ${role}` : `Failed: ${role}`);
                    } else {
                         const newChar = { ...result, clientId: crypto.randomUUID() };
                         loadedChars = [...loadedChars, newChar]; // Add to temporary list
                         if (isMounted) {
                            setCharacters(prev => [...prev, newChar]); // Update state incrementally
                         }
                    }
                }
            } catch (err: any) { // Catch errors during the loop/awaits
                 console.error("Error during initial character load loop:", err);
                 if (isMounted) {
                    setErrorMsg(`Error loading initial characters: ${err.message}`);
                 }
            } finally {
                 if (isMounted) {
                    setIsInitialLoading(false);
                    setGeneratingRoles(new Set()); // Clear all initial generation keys
                 }
            }
        };

        loadInitialCharacters();

        return () => { isMounted = false; };
    }, [selectedModel, availableModels]); // Add availableModels dependency

    // Form submission handler
    const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!validation.isValid || isSubmitting || isInitialLoading || generatingRoles.size > 0) return;

        setIsSubmitting(true);
        setErrorMsg(null);
        try {
            // Prepare data for startGameAction, keeping imageUrl
            const charactersToSubmit = characters.map(({ clientId, ...rest }) => rest);
                                        
            const result = await startGameAction(charactersToSubmit, selectedModel);
            if (result && 'error' in result) {
                throw new Error(result.error);
            }
        } catch (error: any) {
            console.error("Starting game failed:", error);
            setErrorMsg(`Failed to start game: ${error.message}`);
            setIsSubmitting(false);
        }
    };

    // Calculate how many of each role are currently being generated
    const generatingCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        generatingRoles.forEach(key => {
            const role = key.split('-')[0]; // Extract role from generation key
            counts[role] = (counts[role] || 0) + 1;
        });
        return counts;
    }, [generatingRoles]);

    return (
        <form 
            onSubmit={handleFormSubmit}
            className="mb-8 p-6 border rounded-lg shadow-md bg-gradient-to-b from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 dark:border-gray-700 max-w-xl mx-auto text-gray-800 dark:text-gray-200"
        >
            <h2 className="text-2xl font-bold mb-6 text-gray-700 dark:text-gray-300 text-center">Configure New Game</h2>
            
            {/* AI Model Selection - Use availableModels prop */}
            <div className="mb-6">
                <label htmlFor="aiModel" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                    AI Model
                </label>
                <select
                    id="aiModel"
                    name="aiModel"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm bg-white dark:bg-gray-700 dark:text-gray-200"
                    required
                    disabled={isSubmitting || isInitialLoading || generatingRoles.size > 0 || availableModels.length === 0}
                >
                    {availableModels.length === 0 ? (
                        <option value="" disabled>Loading models...</option>
                    ) : (
                        availableModels.map(modelId => (
                            <option key={modelId} value={modelId}>{modelId}</option>
                        ))
                    )}
                </select>
                 {availableModels.length === 0 && (
                      <p className="text-xs text-yellow-600 mt-1">Could not load models. Using default.</p>
                  )}
            </div>

            {/* Add Player Buttons */}
            <div className="mb-4">
                 <p className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 text-center">Add Characters</p>
                 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {availableRoles.map(role => (
                         <button
                            key={role}
                            type="button"
                            onClick={() => addCharacter(role)}
                            disabled={isSubmitting || isInitialLoading}
                            className="h-10 flex items-center justify-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                         >
                            {generatingCounts[role] > 0 ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <UserPlus className="h-4 w-4"/>
                            )}
                             {role}
                         </button>
                    ))}
                 </div>
            </div>
            
            {/* Current Character List */}
             <div className="mb-4 min-h-[150px] border rounded-md p-3 bg-gray-100 dark:bg-gray-800 dark:border-gray-700">
                 <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Current Setup ({validation.playerCount} Players)</h3>
                 {isInitialLoading ? (
                     <div className="flex justify-center items-center h-20">
                         <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
                         <span className="ml-2 text-sm text-gray-500">Loading initial characters...</span>
                     </div>
                 ) : characters.length === 0 && !isInitialLoading ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400 italic text-center py-2">Click buttons above to add characters.</p>
                 ) : (
                     <ul className="space-y-1.5 max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-gray-100 dark:scrollbar-track-gray-800 pr-1">
                        {characters.map((char) => (
                             <li key={char.clientId} className="flex items-center justify-between text-sm bg-white dark:bg-gray-700 p-2 rounded border border-gray-200 dark:border-gray-600 shadow-sm">
                                 <span className="flex items-center gap-2 truncate">
                                     {/* Display Character Image using char.imageUrl */}
                                     {char.imageUrl ? (
                                         <Image 
                                             src={char.imageUrl} 
                                             alt={char.profile.characterName}
                                             width={32} 
                                             height={32} 
                                             className="rounded-full object-cover w-8 h-8" 
                                         />
                                     ) : (
                                         <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
                                              <Users className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                                         </div>
                                     )}
                                     <RoleIcon role={char.role} />
                                     <span className="font-medium truncate" title={char.profile.characterName}>{char.profile.characterName}</span> 
                                     <span className="text-gray-500 dark:text-gray-400">({char.role})</span>
                                 </span>
                                 <button 
                                     type="button" 
                                     onClick={() => removeCharacter(char.clientId)} 
                                     disabled={isSubmitting || isInitialLoading}
                                     className="p-0.5 text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-500 rounded-full focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-50"
                                     aria-label={`Remove ${char.profile.characterName}`}
                                 >
                                     <X className="h-4 w-4" />
                                 </button>
                             </li>
                        ))}
                     </ul>
                 )}
             </div>

             {/* Status/Error Message Area */}
            <div className="mb-4 h-10 text-center flex items-center justify-center"> 
                {errorMsg ? (
                    <p className="text-xs text-red-600 flex items-center"><ServerCrash className="h-4 w-4 mr-1"/> {errorMsg}</p>
                ) : !isInitialLoading && !isSubmitting && (
                    <p className={`text-xs ${validation.isValid ? 'text-green-600' : 'text-yellow-600'}`}>
                        {validation.message || ''}
                    </p>
                )}
            </div>

            {/* Submit Button */}
            <button 
                type="submit" 
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800 transition duration-150 ease-in-out text-lg font-semibold disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed flex justify-center items-center"
                disabled={isSubmitting || isInitialLoading || !validation.isValid || generatingRoles.size > 0}
            >
                {isSubmitting ? (
                    <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Creating game...
                    </>
                ) : (
                    'Start New Game'
                )}
            </button>
        </form>
    );
} 