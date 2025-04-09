'use client'; // Ensure this is a client component

import Image from 'next/image';
import { ConfigCharacterSlot, Role } from '@/lib/types/game';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from '@/components/ui/button';
import { Users, ServerCrash, Bot, X } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

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
    translations: Record<string, string>; // Accept translations prop
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
    onRemove,
    translations // Destructure translations prop
}: CharacterSlotItemProps) {
    const { t } = useTranslation({ translations });

    return (
        <li key={slot.clientId} className={`p-4 rounded-lg transition-all duration-300 ease-in-out flex flex-col gap-3 ${slot.generationError ? 'bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700' : 'bg-white dark:bg-gray-700'}`}>
            {/* Top section: Status/Generated Info & Remove Button */}
            <div className="flex items-center justify-between gap-3">
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
                                    {slot.profile?.characterName || t('UnnamedCharacterLabel', 'Unnamed')}
                                </span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">({t(slot.assignedRole || 'RoleUnknown', slot.assignedRole || 'Unknown')})</span>
                            </div>
                        </>
                    ) : slot.generationError ? (
                         <div className="flex items-center text-red-600 dark:text-red-400 text-sm flex-grow">
                              <ServerCrash className="h-4 w-4 mr-2 flex-shrink-0"/>
                              <span className="truncate" title={slot.generationError}>{t('GenerationErrorPrefix', 'Error')}: {slot.generationError}</span>
                         </div>
                     ) : (
                        // Display Placeholder before generation - Removed Slot # and Role text
                        <div className="flex items-center text-gray-500 dark:text-gray-400 flex-grow">
                            <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center flex-shrink-0">
                                 <Bot className="h-5 w-5" />
                            </div>
                            {/* Removed redundant text: Slot #{index + 1} ({t(slot.roleSelection, slot.roleSelection)}) */}
                             <span className="ml-2 text-sm italic">{t('PlayerSlotPendingLabel', 'Player Slot')}</span>
                        </div>
                    )}
                </div>

                {/* Remove Button (moved to top right) */}
                {canRemove && (
                    <Button
                       type="button"
                       variant="ghost"
                       size="icon"
                       onClick={() => onRemove(slot.clientId)}
                       disabled={isSubmitting}
                       className="p-1 text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-500 h-9 w-9 flex-shrink-0"
                       aria-label={t('RemovePlayerSlotAriaLabel', 'Remove player slot') + ` ${index + 1}`} // Keep index for aria-label clarity
                     >
                       <X className="h-4 w-4" />
                   </Button>
               )}
            </div>

             {/* Bottom section: Role/Model Selectors - Always stacked vertically */}
             <div className="flex flex-col items-center gap-2 w-full">
                  {/* Role Selector */}
                 <div className="w-full">
                      <label htmlFor={`role-${slot.clientId}`} className="sr-only">{t('SelectRolePlaceholder', 'Select role')}</label>
                     <Select
                        value={slot.roleSelection}
                        onValueChange={(newRole) => onUpdateRole(slot.clientId, newRole as Role)}
                        required
                        disabled={isSubmitting}
                     >
                        <SelectTrigger className="w-full text-xs h-9" id={`role-${slot.clientId}`}>
                            <SelectValue placeholder={t('SelectRolePlaceholder', 'Select role')} />
                        </SelectTrigger>
                        <SelectContent>
                            {availableRoles.map(roleId => (
                                <SelectItem key={roleId} value={roleId} className="text-xs">
                                    {t(roleId, roleId)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                     </Select>
                </div>

                 {/* Model Selector */}
                 <div className="w-full">
                     <label htmlFor={`model-${slot.clientId}`} className="sr-only">{t('SelectModelPlaceholder', 'Select model')}</label>
                      <Select
                         value={slot.aiModel}
                         onValueChange={(newModel) => onUpdateModel(slot.clientId, newModel)}
                         required
                         disabled={isSubmitting || availableModels.length === 0}
                     >
                         <SelectTrigger className="w-full text-xs h-9" id={`model-${slot.clientId}`}>
                             <SelectValue placeholder={t('SelectModelPlaceholder', 'Select model')} />
                         </SelectTrigger>
                         <SelectContent>
                             {availableModels.length === 0 ? (
                                 <SelectItem value="loading" disabled>{t('LoadingLabel', 'Loading...')}</SelectItem>
                             ) : (
                                 availableModels.map(modelId => (
                                     <SelectItem key={modelId} value={modelId} className="text-xs">{modelId}</SelectItem>
                                 ))
                             )}
                         </SelectContent>
                     </Select>
                </div>
             </div>
        </li>
    );
}
