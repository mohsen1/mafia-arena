"use client"

import * as React from "react"
import { ProviderSelector, type ApiProvider, PROVIDERS } from "./ProviderSelector"
import { ModelSelector } from "./ModelSelector"
import { Badge } from "./badge"
import { Network, Zap } from "lucide-react"
import { cn } from "@/lib/utils"

interface ProviderModelSelectorProps {
  value?: string
  onChange?: (value: string) => void
  team?: "mafia" | "town"
  placeholder?: string
  className?: string
  /** ID of a hidden input to sync the selected value to (for form submission) */
  inputId?: string
  /** Default model ID to select on mount */
  defaultValue?: string
  /** Start with provider already selected */
  defaultProvider?: ApiProvider
}

export function ProviderModelSelector({
  value,
  onChange,
  team,
  placeholder = "Select model...",
  className,
  inputId,
  defaultValue,
  defaultProvider = 'openrouter',
}: ProviderModelSelectorProps) {
  const [selectedProvider, setSelectedProvider] = React.useState<ApiProvider>(defaultProvider)
  const [selectedModel, setSelectedModel] = React.useState<string>(defaultValue || value || "")

  // Sync with hidden input
  React.useEffect(() => {
    if (inputId && typeof document !== 'undefined') {
      const input = document.getElementById(inputId) as HTMLInputElement | null
      if (input) {
        input.value = selectedModel
        input.dataset.apiProvider = selectedProvider
      }
    }
  }, [inputId, selectedModel, selectedProvider])

  // Listen for external model selection events
  React.useEffect(() => {
    if (!inputId || typeof window === 'undefined') return
    
    const handleExternalSelect = (e: CustomEvent<{ inputId: string; modelId: string; displayName?: string; apiProvider?: ApiProvider }>) => {
      if (e.detail.inputId === inputId) {
        setSelectedModel(e.detail.modelId)
        if (e.detail.apiProvider) {
          setSelectedProvider(e.detail.apiProvider)
        }
        onChange?.(e.detail.modelId)
      }
    }
    
    window.addEventListener('selectModel', handleExternalSelect as EventListener)
    return () => window.removeEventListener('selectModel', handleExternalSelect as EventListener)
  }, [inputId, onChange])

  const handleProviderChange = (provider: ApiProvider) => {
    setSelectedProvider(provider)
    // Clear model selection when provider changes
    setSelectedModel("")
    onChange?.("")
  }

  const handleModelChange = (model: string) => {
    setSelectedModel(model)
    onChange?.(model)
  }

  const providerInfo = PROVIDERS.find(p => p.id === selectedProvider)

  const teamLabel = team === "mafia" 
    ? { color: "text-rose-500", dot: "bg-rose-500" }
    : team === "town" 
    ? { color: "text-indigo-500", dot: "bg-indigo-500" }
    : null

  return (
    <div className={cn("space-y-3", className)}>
      {/* Team Label */}
      {team && teamLabel && (
        <div className={cn("flex items-center gap-1.5 text-xs", teamLabel.color)}>
          <span className={cn("inline-block w-2 h-2 rounded-full", teamLabel.dot)}></span>
          {team === "mafia" ? "Mafia Model" : "Town Model"}
        </div>
      )}

      {/* Provider Selection */}
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">API Provider</label>
        <ProviderSelector
          value={selectedProvider}
          onChange={handleProviderChange}
          placeholder="Select provider..."
        />
      </div>

      {/* Model Selection */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Model</span>
          {providerInfo && (
            <Badge 
              variant="outline" 
              className={cn(
                "text-[9px] px-1 py-0",
                providerInfo.color.bg,
                providerInfo.color.text,
                providerInfo.color.border
              )}
            >
              {providerInfo.isAggregator ? (
                <>
                  <Network className="h-2.5 w-2.5 mr-0.5" />
                  {providerInfo.displayName}
                </>
              ) : (
                <>
                  <Zap className="h-2.5 w-2.5 mr-0.5" />
                  Direct
                </>
              )}
            </Badge>
          )}
        </div>
        <ModelSelector
          value={selectedModel}
          onChange={handleModelChange}
          team={team}
          placeholder={placeholder}
          apiProvider={selectedProvider}
        />
      </div>

      {/* Hidden input for form submission */}
      {inputId && (
        <input 
          type="hidden" 
          id={inputId} 
          name={inputId} 
          value={selectedModel} 
          data-api-provider={selectedProvider}
        />
      )}
    </div>
  )
}

export default ProviderModelSelector

