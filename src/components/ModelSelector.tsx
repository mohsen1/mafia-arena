'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ModelDefinition } from "@/lib/models";

// Define Dictionary type locally or import if shared
type Dictionary = {
  [key: string]: string | Dictionary;
};


interface ModelSelectorProps {
  id?: string;
  models: ModelDefinition[]; // Updated to accept ModelDefinition objects
  selectedModel: string;
  onModelChange: (newModel: string) => void;
  placeholder?: string;
  disabled?: boolean;
  dict?: Dictionary; // Optional dict prop for translations
}

export default function ModelSelector({
  id,
  models,
  selectedModel,
  onModelChange,
  placeholder = "Select model", // Default placeholder
  disabled = false,
  // dict, // Currently unused, but available
}: ModelSelectorProps) {
  // const t = (key: string, fallback?: string) => dict?.[key] || fallback;

  return (
    <Select
      value={selectedModel}
      onValueChange={onModelChange}
      required
      disabled={disabled || models.length === 0}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {models.length === 0 ? (
          <SelectItem value="loading" disabled>
            {/* TODO: Use translation key */} Loading models...
          </SelectItem>
        ) : (
          // Map over ModelDefinition objects
          models.map((model) => (
            <SelectItem key={model.value} value={model.value}>
              {model.title} {/* Display model title */}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
} 