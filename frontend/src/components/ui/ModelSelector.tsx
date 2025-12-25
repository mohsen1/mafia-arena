"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Sparkles } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"

interface Model {
  id: string
  name: string
  description?: string
  contextLength: number
  pricing: {
    inputPer1M: number
    outputPer1M: number
  }
}

interface ModelsData {
  providers: string[]
  modelsByProvider: Record<string, Model[]>
  totalModels: number
}

interface ModelSelectorProps {
  value?: string
  onChange?: (value: string) => void
  label?: string
  team?: "mafia" | "town"
  placeholder?: string
  className?: string
  /** ID of a hidden input to sync the selected value to (for form submission) */
  inputId?: string
  /** Default model ID to select on mount */
  defaultValue?: string
}

const PROVIDER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  anthropic: { bg: "bg-orange-500/10", text: "text-orange-600 dark:text-orange-400", border: "border-orange-500/30" },
  openai: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-500/30" },
  google: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", border: "border-blue-500/30" },
  meta: { bg: "bg-indigo-500/10", text: "text-indigo-600 dark:text-indigo-400", border: "border-indigo-500/30" },
  mistralai: { bg: "bg-purple-500/10", text: "text-purple-600 dark:text-purple-400", border: "border-purple-500/30" },
  qwen: { bg: "bg-cyan-500/10", text: "text-cyan-600 dark:text-cyan-400", border: "border-cyan-500/30" },
  "x-ai": { bg: "bg-zinc-500/10", text: "text-zinc-600 dark:text-zinc-400", border: "border-zinc-500/30" },
  amazon: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", border: "border-amber-500/30" },
  minimax: { bg: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-400", border: "border-rose-500/30" },
  nvidia: { bg: "bg-lime-500/10", text: "text-lime-600 dark:text-lime-400", border: "border-lime-500/30" },
}

const DEFAULT_COLORS = { bg: "bg-zinc-500/10", text: "text-zinc-600 dark:text-zinc-400", border: "border-zinc-500/30" }

function getProviderColors(provider: string) {
  return PROVIDER_COLORS[provider.toLowerCase()] || DEFAULT_COLORS
}

function formatPrice(price: number): string {
  if (price === 0) return "Free"
  if (price < 0.01) return `$${(price * 1000).toFixed(2)}/B`
  if (price < 1) return `$${price.toFixed(2)}/M`
  return `$${price.toFixed(0)}/M`
}

function formatContext(length: number): string {
  if (length >= 1000000) return `${(length / 1000000).toFixed(0)}M`
  if (length >= 1000) return `${(length / 1000).toFixed(0)}K`
  return String(length)
}

export function ModelSelector({
  value: controlledValue,
  onChange,
  label,
  team,
  placeholder = "Select model...",
  className,
  inputId,
  defaultValue,
}: ModelSelectorProps) {
  const [open, setOpen] = React.useState(false)
  const [modelsData, setModelsData] = React.useState<ModelsData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [internalValue, setInternalValue] = React.useState(defaultValue || "")

  // Use controlled value if provided, otherwise use internal state
  const value = controlledValue !== undefined ? controlledValue : internalValue

  // Define handleChange before effects that use it
  const handleChange = React.useCallback((newValue: string, displayName?: string) => {
    setInternalValue(newValue)
    onChange?.(newValue)
    
    // Also sync with hidden input immediately
    if (inputId && typeof document !== 'undefined') {
      const input = document.getElementById(inputId) as HTMLInputElement | null
      if (input) {
        input.value = newValue
        // Store display name as data attribute for form submission
        if (displayName) {
          input.dataset.displayName = displayName
        }
      }
    }
  }, [onChange, inputId])

  // Sync with hidden input if inputId is provided
  React.useEffect(() => {
    if (inputId && typeof document !== 'undefined') {
      const input = document.getElementById(inputId) as HTMLInputElement | null
      if (input) {
        input.value = value
      }
    }
  }, [inputId, value])

  // Listen for external model selection events
  React.useEffect(() => {
    if (!inputId || typeof window === 'undefined') return
    
    const handleExternalSelect = (e: CustomEvent<{ inputId: string; modelId: string; displayName?: string }>) => {
      if (e.detail.inputId === inputId) {
        handleChange(e.detail.modelId, e.detail.displayName)
      }
    }
    
    window.addEventListener('selectModel', handleExternalSelect as EventListener)
    return () => window.removeEventListener('selectModel', handleExternalSelect as EventListener)
  }, [inputId, handleChange])

  // Fetch models from OpenRouter API
  React.useEffect(() => {
    const apiUrl = (typeof window !== 'undefined' && (window as unknown as { ENV?: { PUBLIC_API_URL?: string } }).ENV?.PUBLIC_API_URL) 
      || 'https://mafia-arena.me-f9a.workers.dev'
    
    fetch(`${apiUrl}/api/models/openrouter`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch models')
        return res.json()
      })
      .then((data: ModelsData) => {
        setModelsData(data)
        setLoading(false)
        
        // Auto-select a random model if no value is set
        if (!value && data.providers.length > 0) {
          const randomProvider = data.providers[Math.floor(Math.random() * data.providers.length)]
          const providerModels = data.modelsByProvider[randomProvider]
          if (providerModels && providerModels.length > 0) {
            const randomModel = providerModels[Math.floor(Math.random() * providerModels.length)]
            handleChange(randomModel.id, randomModel.name)
          }
        }
      })
      .catch(err => {
        console.error('Failed to fetch models:', err)
        setError(err.message)
        setLoading(false)
      })
  }, [])

  // Find selected model details
  const selectedModel = React.useMemo(() => {
    if (!modelsData || !value) return null
    for (const provider of modelsData.providers) {
      const model = modelsData.modelsByProvider[provider]?.find(m => m.id === value)
      if (model) return { ...model, provider }
    }
    return null
  }, [modelsData, value])

  const teamColors = team === "mafia" 
    ? "border-rose-500/50 focus:ring-rose-500/30" 
    : team === "town" 
    ? "border-indigo-500/50 focus:ring-indigo-500/30"
    : ""

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label className="text-sm font-medium text-muted-foreground">
          {label}
        </label>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "w-full justify-between h-auto min-h-[42px] py-2",
              teamColors,
              !value && "text-muted-foreground"
            )}
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 animate-pulse" />
                Loading models...
              </span>
            ) : error ? (
              <span className="text-destructive">Error loading models</span>
            ) : selectedModel ? (
              <div className="flex items-center gap-2 overflow-hidden">
                <Badge 
                  variant="outline" 
                  className={cn(
                    "text-[10px] px-1.5 py-0",
                    getProviderColors(selectedModel.provider).bg,
                    getProviderColors(selectedModel.provider).text,
                    getProviderColors(selectedModel.provider).border
                  )}
                >
                  {selectedModel.provider}
                </Badge>
                <span className="truncate">{selectedModel.name}</span>
                <span className="text-xs text-muted-foreground ml-auto shrink-0">
                  {formatContext(selectedModel.contextLength)}
                </span>
              </div>
            ) : (
              placeholder
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search models..." />
            <CommandList className="max-h-[350px]">
              <CommandEmpty>No models found.</CommandEmpty>
              {modelsData?.providers.map(provider => (
                <CommandGroup 
                  key={provider} 
                  heading={
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant="outline"
                        className={cn(
                          "text-[10px] px-1.5 py-0",
                          getProviderColors(provider).bg,
                          getProviderColors(provider).text,
                          getProviderColors(provider).border
                        )}
                      >
                        {provider}
                      </Badge>
                      <span className="text-muted-foreground text-[10px]">
                        {modelsData.modelsByProvider[provider]?.length} models
                      </span>
                    </div>
                  }
                >
                  {modelsData.modelsByProvider[provider]?.map(model => (
                    <CommandItem
                      key={model.id}
                      value={`${provider} ${model.name} ${model.id}`}
                      onSelect={() => {
                        handleChange(model.id, model.name)
                        setOpen(false)
                      }}
                      className="flex items-center justify-between py-2"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Check
                          className={cn(
                            "h-4 w-4 shrink-0",
                            value === model.id ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <span className="truncate">{model.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-[10px] text-muted-foreground">
                          {formatContext(model.contextLength)}
                        </span>
                        <Badge 
                          variant="secondary" 
                          className="text-[10px] px-1.5 py-0 font-mono"
                        >
                          {formatPrice(model.pricing.inputPer1M)}
                        </Badge>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}

export default ModelSelector

