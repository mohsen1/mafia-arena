'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Define Dictionary type locally or import if shared
type Dictionary = {
  [key: string]: string | Dictionary;
};

interface ModelSelectorProps {
  id?: string;
  models: string[];
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
            Loading...
          </SelectItem>
        ) : (
          models.map((modelId) => (
            <SelectItem key={modelId} value={modelId}>
              {modelId}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
} 