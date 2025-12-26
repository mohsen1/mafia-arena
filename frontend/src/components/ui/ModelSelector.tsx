"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Sparkles, Network } from "lucide-react"

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
import type { ApiProvider } from "./ProviderSelector"

interface Model {
  id: string
  name: string
  displayName?: string
  description?: string
  contextLength: number
  pricing: {
    inputPer1M?: number
    outputPer1M?: number
    input?: number
    output?: number
  }
  apiProvider?: ApiProvider
  apiModelId?: string
}

interface ModelsData {
  providers?: string[]
  families?: string[]
  modelsByProvider?: Record<string, Model[]>
  modelsByFamily?: Record<string, Model[]>
  models?: Model[]
  totalModels?: number
  total?: number
  apiProvider?: ApiProvider
  isAggregator?: boolean
  isStatic?: boolean
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
  /** Filter models to this API provider (for two-step selection) */
  apiProvider?: ApiProvider
}

const FAMILY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
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
  cerebras: { bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400", border: "border-red-500/30" },
  fireworks: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", border: "border-amber-500/30" },
}

const DEFAULT_COLORS = { bg: "bg-zinc-500/10", text: "text-zinc-600 dark:text-zinc-400", border: "border-zinc-500/30" }

function getFamilyColors(family: string) {
  return FAMILY_COLORS[family.toLowerCase()] || DEFAULT_COLORS
}

function formatPrice(price: number | undefined): string {
  if (price === undefined || price === 0) return "Free"
  if (price < 0.01) return `$${(price * 1000).toFixed(2)}/B`
  if (price < 1) return `$${price.toFixed(2)}/M`
  return `$${price.toFixed(0)}/M`
}

function getModelName(model: Model): string {
  return model.name || model.displayName || model.id
}

function getModelInputPrice(model: Model): number {
  return model.pricing.inputPer1M ?? (model.pricing.input ? model.pricing.input * 1000 : 0)
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
  apiProvider,
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

  // Fetch models from API based on provider
  React.useEffect(() => {
    const apiUrl = (typeof window !== 'undefined' && (window as unknown as { ENV?: { PUBLIC_API_URL?: string } }).ENV?.PUBLIC_API_URL) 
      || 'https://mafia-arena.me-f9a.workers.dev'
    
    // Reset when provider changes
    setLoading(true)
    setError(null)
    
    // Determine which endpoint to use
    const endpoint = apiProvider === 'openrouter' || !apiProvider
      ? `${apiUrl}/api/models/openrouter`
      : `${apiUrl}/api/models/by-provider/${apiProvider}`
    
    fetch(endpoint)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch models')
        return res.json()
      })
      .then((data: ModelsData) => {
        // Normalize the data structure for consistent access
        // Direct provider responses have models[] and modelsByFamily[]
        // OpenRouter responses have modelsByProvider[] and providers[]
        const normalizedData = {
          ...data,
          families: data.families || data.providers || [],
          modelsByFamily: data.modelsByFamily || data.modelsByProvider || {},
        }
        setModelsData(normalizedData)
        setLoading(false)
        
        // Auto-select a random model if no value is set
        const families = normalizedData.families
        const modelsByGroup = normalizedData.modelsByFamily
        
        if (!value && families.length > 0) {
          const randomFamily = families[Math.floor(Math.random() * families.length)]
          const familyModels = modelsByGroup[randomFamily]
          if (familyModels && familyModels.length > 0) {
            const randomModel = familyModels[Math.floor(Math.random() * familyModels.length)]
            handleChange(randomModel.id, getModelName(randomModel))
          }
        }
      })
      .catch(err => {
        console.error('Failed to fetch models:', err)
        setError(err.message)
        setLoading(false)
      })
  }, [apiProvider])

  // Find selected model details
  const selectedModel = React.useMemo(() => {
    if (!modelsData || !value) return null
    const families = modelsData.families || []
    const modelsByGroup = modelsData.modelsByFamily || {}
    
    for (const family of families) {
      const model = modelsByGroup[family]?.find(m => m.id === value)
      if (model) return { ...model, family, displayName: getModelName(model) }
    }
    return null
  }, [modelsData, value])

  const teamColors = team === "mafia" 
    ? "border-rose-500/50 focus:ring-rose-500/30" 
    : team === "town" 
    ? "border-indigo-500/50 focus:ring-indigo-500/30"
    : ""
  
  const isOpenRouter = apiProvider === 'openrouter' || !apiProvider || modelsData?.isAggregator

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
                    getFamilyColors(selectedModel.family).bg,
                    getFamilyColors(selectedModel.family).text,
                    getFamilyColors(selectedModel.family).border
                  )}
                >
                  {selectedModel.family}
                </Badge>
                <span className="truncate">{selectedModel.displayName}</span>
                {isOpenRouter && (
                  <Badge variant="secondary" className="text-[9px] px-1 py-0 shrink-0 flex items-center gap-0.5">
                    <Network className="h-2.5 w-2.5" />
                    OR
                  </Badge>
                )}
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
              {(modelsData?.families || []).map(family => (
                <CommandGroup 
                  key={family} 
                  heading={
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant="outline"
                        className={cn(
                          "text-[10px] px-1.5 py-0",
                          getFamilyColors(family).bg,
                          getFamilyColors(family).text,
                          getFamilyColors(family).border
                        )}
                      >
                        {family}
                      </Badge>
                      <span className="text-muted-foreground text-[10px]">
                        {modelsData?.modelsByFamily?.[family]?.length} models
                      </span>
                      {isOpenRouter && (
                        <Badge variant="secondary" className="text-[9px] px-1 py-0 flex items-center gap-0.5">
                          <Network className="h-2.5 w-2.5" />
                          via OpenRouter
                        </Badge>
                      )}
                    </div>
                  }
                >
                  {modelsData?.modelsByFamily?.[family]?.map(model => {
                    const modelName = getModelName(model)
                    return (
                      <CommandItem
                        key={model.id}
                        value={`${family} ${modelName} ${model.id}`}
                        onSelect={() => {
                          handleChange(model.id, modelName)
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
                          <span className="truncate">{modelName}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <span className="text-[10px] text-muted-foreground">
                            {formatContext(model.contextLength)}
                          </span>
                          <Badge 
                            variant="secondary" 
                            className="text-[10px] px-1.5 py-0 font-mono"
                          >
                            {formatPrice(getModelInputPrice(model))}
                          </Badge>
                        </div>
                      </CommandItem>
                    )
                  })}
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
