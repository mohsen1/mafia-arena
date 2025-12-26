"use client"

import * as React from "react"
import { ProviderSelector, type ApiProvider, PROVIDERS } from "./ProviderSelector"
import { ModelSelector } from "./ModelSelector"
import { cn } from "@/lib/utils"

interface ProviderModelSelectorProps {
  value?: string
  onChange?: (value: string) => void
  team?: "mafia" | "town"
  placeholder?: string
  className?: string
  inputId?: string
  defaultValue?: string
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

  React.useEffect(() => {
    if (inputId && typeof document !== 'undefined') {
      const input = document.getElementById(inputId) as HTMLInputElement | null
      if (input) {
        input.value = selectedModel
        input.dataset.apiProvider = selectedProvider
      }
    }
  }, [inputId, selectedModel, selectedProvider])

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
    setSelectedModel("")
    onChange?.("")
  }

  const handleModelChange = (model: string) => {
    setSelectedModel(model)
    onChange?.(model)
  }

  const teamLabel = team === "mafia" 
    ? { color: "text-rose-500", dot: "bg-rose-500" }
    : team === "town" 
    ? { color: "text-indigo-500", dot: "bg-indigo-500" }
    : null

  return (
    <div className={cn("space-y-3", className)}>
      {team && teamLabel && (
        <div className={cn("flex items-center gap-1.5 text-xs font-medium", teamLabel.color)}>
          <span className={cn("inline-block w-2 h-2 rounded-full", teamLabel.dot)}></span>
          {team === "mafia" ? "Mafia Model" : "Town Model"}
        </div>
      )}

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">API Provider</label>
        <ProviderSelector
          value={selectedProvider}
          onChange={handleProviderChange}
          placeholder="Select provider..."
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Model</label>
        <ModelSelector
          value={selectedModel}
          onChange={handleModelChange}
          team={team}
          placeholder={placeholder}
          apiProvider={selectedProvider}
        />
      </div>

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
