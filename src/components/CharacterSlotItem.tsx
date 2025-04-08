import Image from 'next/image';
import { ConfigCharacterSlot, Role } from '@/lib/types/game';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from '@/components/ui/button';
import { Users, ServerCrash, Bot, X } from 'lucide-react';

interface CharacterSlotItemProps {
    slot: ConfigCharacterSlot;
    index: number;
    availableModels: string[];
    availableRoles: Role[]; // Pass available roles
    isSubmitting: boolean;
    canRemove: boolean; // Control remove button visibility
    onUpdateRole: (clientId: string, newRole: Role) => void;
    onUpdateModel: (clientId: string, newModel: string) => void;
    onRemove: (clientId: string) => void;
}

export function CharacterSlotItem({
    slot,
    index,
    availableModels,
    availableRoles,
    isSubmitting,
    canRemove,
    onUpdateRole,
    onUpdateModel,
    onRemove
}: CharacterSlotItemProps) {
    return (
        <li key={slot.clientId} className={`p-3 rounded border dark:border-gray-600 shadow-sm transition-all duration-300 ease-in-out ${slot.generationError ? 'bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-700' : 'bg-white dark:bg-gray-700 border-gray-200'}`}>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                {/* Left side: Status/Generated Info */}
                <div className="flex items-center gap-3 flex-grow min-w-0">
                    {slot.isGenerated && !slot.generationError ? (
                        <>
                            {slot.imageUrl ? (
                                <Image src={slot.imageUrl} alt={slot.profile?.characterName || 'Character'} width={40} height={40} className="rounded-full object-cover w-10 h-10 flex-shrink-0" />
                            ) : (
                                <div className="w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center flex-shrink-0">
                                    <Users className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                                </div>
                            )}
                            <div className="truncate min-w-0">
                                <span className="font-medium truncate block text-sm text-gray-800 dark:text-gray-100" title={slot.profile?.characterName}>
                                    {slot.profile?.characterName || 'Unnamed'}
                                </span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">({slot.assignedRole})</span>
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
                            <span className="ml-2 text-sm italic">Slot #{index + 1} ({slot.roleSelection})</span>
                        </div>
                    )}
                </div>

                {/* Right side: Role/Model Selectors & Remove */}
                 <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto justify-end flex-wrap">
                      {/* Role Selector */}
                     <Select
                        value={slot.roleSelection}
                        onValueChange={(newRole) => onUpdateRole(slot.clientId, newRole as Role)}
                        required
                        disabled={isSubmitting}
                     >
                        <SelectTrigger className="w-full sm:w-[120px] text-xs h-9" id={`role-${slot.clientId}`}>
                            <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                            {availableRoles.map(roleId => (
                                <SelectItem key={roleId} value={roleId} className="text-xs">
                                    {roleId}
                                </SelectItem>
                            ))}
                        </SelectContent>
                     </Select>

                     {/* Model Selector */}
                      <Select
                         value={slot.aiModel}
                         onValueChange={(newModel) => onUpdateModel(slot.clientId, newModel)}
                         required
                         disabled={isSubmitting || availableModels.length === 0}
                     >
                         <SelectTrigger className="w-full sm:w-[160px] text-xs h-9" id={`model-${slot.clientId}`}>
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

                     {/* Remove Button */}
                      {canRemove && (
                          <Button
                             type="button"
                             variant="ghost"
                             size="icon"
                             onClick={() => onRemove(slot.clientId)}
                             disabled={isSubmitting}
                             className="p-1 text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-500 h-9 w-9 flex-shrink-0"
                             aria-label={`Remove player slot ${index + 1}`}
                           >
                             <X className="h-4 w-4" />
                         </Button>
                     )}
                 </div>
            </div>
        </li>
    );
}
