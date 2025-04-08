'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom'; // Import useFormStatus
import { Loader2 } from 'lucide-react';
import { startGameAction } from '@/app/actions';
import { DEFAULT_GAME_SETTINGS } from '@/lib/config'; // Import defaults for placeholder
import { Role } from '@/lib/types/game'; // Import Role type

// Props interface for the form
interface StartGameFormProps {
    availableModels: string[]; // Add prop for models
}

// Separate component for the button to use useFormStatus
function SubmitButton() {
  const { pending } = useFormStatus(); // Get pending state from the form

  return (
    <button 
      type="submit" 
      className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition duration-150 ease-in-out text-lg font-semibold disabled:bg-blue-400 disabled:cursor-not-allowed flex justify-center items-center"
      disabled={pending} // Disable button when form is pending
    >
      {pending ? (
        <>
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Creating game...
        </>
      ) : (
        'Start New Game'
      )}
    </button>
  );
}

export default function StartGameForm({ availableModels }: StartGameFormProps) { // Destructure props
  // No need for isSubmitting state here anymore

  // Optional: Add state for displaying potential errors from the server action
  // const [error, setError] = useState<string | null>(null);

  // Define roles to iterate over for form fields
  const roles: Role[] = ['Werewolf', 'Seer', 'Doctor', 'Villager'];

  return (
    // Pass the server action directly to the form's action prop
    // Next.js will automatically pass FormData
    <form 
      action={async (formData) => {
          // setError(null); // Reset error on new submission
          try {
              await startGameAction(formData);
              // Redirect happens in the action, no client-side handling needed
          } catch (err) {
              console.error("Starting game failed:", err);
              // TODO: Improve error handling - maybe set an error state
              // setError(err instanceof Error ? err.message : "An unknown error occurred");
          }
      }} 
      className="mb-8 p-6 border rounded-lg shadow-md bg-white max-w-md mx-auto"
    >
       <h2 className="text-xl font-semibold mb-4 text-gray-700">Create New Game</h2>
       
       {/* AI Model Dropdown */}
       <div className="mb-4">
          <label htmlFor="aiModel" className="block text-sm font-medium text-gray-600 mb-1">
            AI Model
          </label>
          <select
            id="aiModel"
            name="aiModel" // Name attribute is crucial for FormData
            // Set default value if the default exists in the fetched list
            defaultValue={availableModels.includes(DEFAULT_GAME_SETTINGS.aiModel) ? DEFAULT_GAME_SETTINGS.aiModel : ""}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
            required // Make selection required if desired, or handle default logic better
          >
            {/* Optional: Add a default placeholder option */}
            <option value="" disabled={availableModels.length > 0}>
              {availableModels.length > 0 ? "-- Select Model --" : "-- No models found --"}
            </option>
            
            {/* Add default model if not in fetched list (optional) */}
            {!availableModels.includes(DEFAULT_GAME_SETTINGS.aiModel) && (
                 <option key={DEFAULT_GAME_SETTINGS.aiModel} value={DEFAULT_GAME_SETTINGS.aiModel}>
                     {DEFAULT_GAME_SETTINGS.aiModel} (Default)
                 </option>
            )}

            {/* Map fetched models */}
            {availableModels.map((modelId) => (
              <option key={modelId} value={modelId}>
                {modelId}
                {modelId === DEFAULT_GAME_SETTINGS.aiModel ? " (Default)" : ""}
              </option>
            ))}
          </select>
          {availableModels.length === 0 && (
               <p className="text-xs text-red-500 mt-1">Could not fetch model list. Using default.</p>
          )}
       </div>

       {/* Role Distribution Inputs */}
       <fieldset className="mb-4 border p-4 rounded-md">
           <legend className="text-sm font-medium text-gray-600 px-1">Role Counts</legend>
           <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-2">
               {roles.map((role) => (
                   <div key={role}>
                       <label htmlFor={role} className="block text-sm font-medium text-gray-600 mb-1">
                           {role}s
                       </label>
                       <input
                           type="number"
                           id={role}
                           name={role} // Name matches the role key
                           min="0"
                           defaultValue={DEFAULT_GAME_SETTINGS.roleDistribution[role]}
                           className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                           required // Ensure a value is provided
                       />
                   </div>
               ))}
           </div>
            <p className="text-xs text-gray-500 mt-2">Total players will be calculated based on these counts.</p>
       </fieldset>

       <SubmitButton /> 

       {/* Optional: Display error message */}
       {/* {error && <p className="mt-2 text-sm text-red-600">{error}</p>} */}
     </form>
  );
} 