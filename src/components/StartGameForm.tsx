'use client';

import { CharacterSlotItem } from '@/components/CharacterSlotItem'; // Import the item component
import { Button } from '@/components/ui/button';
import { Label } from "@/components/ui/label";
import { useGameConfig } from '@/hooks/useGameConfig'; // Import the custom hook
import { Role } from '@/lib/types/game'; // Simplified imports
import { AlertTriangle, CheckCircle2, Loader2, Settings2, Trash2, UserPlus } from 'lucide-react';

// Define available roles for selection (can be defined here or imported)
const availableRolesForSelection: Role[] = ['Villager', 'Werewolf', 'Seer', 'Doctor'];

// Define props for the component
interface StartGameFormProps {
    availableModels: string[];
}

export default function StartGameForm({ availableModels }: StartGameFormProps) {
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
        addPlayerSlot,
        removePlayerSlot,
        updateSlotModel,
        updateSlotRole,
        handleGenerateAndStartGame,
    } = useGameConfig(availableModels); // Use the hook

    return (
        <div className="mb-8 p-6 bg-white dark:bg-gray-800 shadow-md rounded-lg border border-gray-200 dark:border-gray-700">
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
                      disabled={isSubmitting}
                      aria-label="Add player slot"
                  >
                      <UserPlus className="h-4 w-4" />
                  </Button>
                  <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => totalSlots > 0 && removePlayerSlot(characterSlots[characterSlots.length - 1].clientId)}
                      disabled={isSubmitting || totalSlots <= 5}
                      aria-label="Remove last player slot"
                  >
                       <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
             </div>

            {/* Character Slot List & Configuration */}
            <div className="mb-4 p-4 border border-gray-200 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-750 min-h-[200px]">
                 <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-3 text-center flex items-center justify-center gap-2"><Settings2 className="h-5 w-5"/> Character Setup</h3>
                 {!initialSlotsSet && availableModels.length > 0 && (
                      <div className="flex justify-center items-center h-20 text-gray-500 dark:text-gray-400">
                          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading setup...
                      </div>
                 )}
                 {availableModels.length === 0 && !initialSlotsSet && (
                    <p className="text-center text-sm text-yellow-600 dark:text-yellow-500">Waiting for available AI models...</p>
                 )}

                 {initialSlotsSet && characterSlots.length > 0 && (
                     <ul className="space-y-3 max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-gray-100 dark:scrollbar-track-gray-800 pr-2">
                         {characterSlots.map((slot, index) => (
                             <CharacterSlotItem
                                key={slot.clientId}
                                slot={slot}
                                index={index}
                                availableModels={availableModels}
                                availableRoles={availableRolesForSelection}
                                isSubmitting={isSubmitting}
                                canRemove={characterSlots.length > 5}
                                onUpdateRole={updateSlotRole}
                                onUpdateModel={updateSlotModel}
                                onRemove={removePlayerSlot}
                            />
                         ))}
                     </ul>
                 )}
                  {initialSlotsSet && characterSlots.length === 0 && (
                      <p className="text-center text-sm text-gray-500 dark:text-gray-400 italic py-4">Use the '+' button to add player slots (minimum 5).</p>
                  )}
            </div>

             {/* Status/Error Message Area */}
             <div className="h-10 text-center flex items-center justify-center px-2 mt-4 mb-2 text-sm">
                  {errorMsg ? (
                      <p className="text-red-600 dark:text-red-400 flex items-center gap-1"><AlertTriangle className="h-4 w-4"/> {errorMsg}</p>
                  ) : isSubmitting ? (
                      <p className="text-blue-600 dark:text-blue-400 flex items-center gap-1"><Loader2 className="h-4 w-4 animate-spin"/> {infoMsg || 'Processing...'}</p>
                  ) : postGenValidationMsg ? (
                       <p className={`flex items-center gap-1 ${isPostGenValid === true ? 'text-green-600 dark:text-green-400' : (isPostGenValid === false ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-500 dark:text-gray-400')}`}>
                           {isPostGenValid === true ? <CheckCircle2 className="h-4 w-4"/> : (isPostGenValid === false ? <AlertTriangle className="h-4 w-4"/> : null)}
                           {postGenValidationMsg}
                       </p>
                  ) : configValidation.isValid ? (
                      <p className="text-green-600 dark:text-green-400 flex items-center gap-1"><CheckCircle2 className="h-4 w-4"/> {configValidation.message}</p>
                  ) : initialSlotsSet ? (
                      <p className="text-yellow-600 dark:text-yellow-400 flex items-center gap-1"><AlertTriangle className="h-4 w-4"/> {configValidation.message}</p>
                  ) : (
                       <p className="text-gray-500 dark:text-gray-400 italic">Configure player slots, roles, and models.</p>
                  )}
             </div>


            {/* Generate & Start Game Button */}
            <Button
                type="button"
                onClick={handleGenerateAndStartGame}
                className="w-full px-6 py-3 text-lg font-semibold flex justify-center items-center cursor-pointer"
                size="lg"
                disabled={!canAttemptStart}
                aria-label="Generate characters and start new game"
            >
                {isSubmitting ? (
                    <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                         {infoMsg && infoMsg.startsWith("Generating") ? 'Generating...' : 'Starting...'}
                    </>
                ) : (
                    'Generate & Start Game'
                )}
            </Button>
        </div>
    );
} 