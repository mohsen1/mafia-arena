"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Loader2 } from "lucide-react"

import { cn } from "~/lib/utils"
import { Button } from "~/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover"
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
  /** Whether this model's provider supports batch API pricing for 40-50% discount */
  supportsBatchPricing?: boolean
}

/** Model as returned from /api/models database endpoint */
interface DbModel {
  id: string
  displayName: string
  family: string
  apiProvider: string
  apiModelId?: string
  pricing?: { input?: number; output?: number }
  createdAt?: number
  supportsBatchPricing?: boolean
}

/** Response from /api/models endpoint */
interface ModelsApiResponse {
  models: DbModel[]
  modelsByApiProvider: Record<string, DbModel[]>
  total: number
  defaults?: { pricing: { input: number; output: number } }
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
  inputId?: string
  defaultValue?: string
  apiProvider?: ApiProvider
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

  const value = controlledValue !== undefined ? controlledValue : internalValue

  const handleChange = React.useCallback((newValue: string, displayName?: string, supportsBatchPricing?: boolean) => {
    setInternalValue(newValue)
    onChange?.(newValue)
    
    if (inputId && typeof document !== 'undefined') {
      const input = document.getElementById(inputId) as HTMLInputElement | null
      if (input) {
        input.value = newValue
        if (displayName) {
          input.dataset.displayName = displayName
        }
        // Store batch pricing support for conditional UI
        input.dataset.supportsBatchPricing = String(supportsBatchPricing ?? false)
        // Dispatch event for form to react to model change
        window.dispatchEvent(new CustomEvent('modelChanged', { 
          detail: { inputId, modelId: newValue, supportsBatchPricing: supportsBatchPricing ?? false } 
        }))
      }
    }
  }, [onChange, inputId])

  React.useEffect(() => {
    if (inputId && typeof document !== 'undefined') {
      const input = document.getElementById(inputId) as HTMLInputElement | null
      if (input) {
        input.value = value
      }
    }
  }, [inputId, value])

  React.useEffect(() => {
    if (!inputId || typeof window === 'undefined') return
    
    const handleExternalSelect = (e: CustomEvent<{ inputId: string; modelId: string; displayName?: string; supportsBatchPricing?: boolean }>) => {
      if (e.detail.inputId === inputId) {
        handleChange(e.detail.modelId, e.detail.displayName, e.detail.supportsBatchPricing)
      }
    }
    
    window.addEventListener('selectModel', handleExternalSelect as EventListener)
    return () => window.removeEventListener('selectModel', handleExternalSelect as EventListener)
  }, [inputId, handleChange])

  React.useEffect(() => {
    // Detect API URL based on hostname
    // Return empty string in dev to use relative paths via Vite proxy (for cookie support)
    const getApiUrl = () => {
      if (typeof window !== 'undefined') {
        const hostname = window.location.hostname
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
          return '' // Use relative path via Vite proxy
        }
      }
      return 'https://api.mafia-arena.com'
    }
    const apiUrl = getApiUrl()
    
    setLoading(true)
    setError(null)
    
    // Always fetch all models from database
    const endpoint = `${apiUrl}/api/models`
    
    fetch(endpoint)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch models')
        return res.json() as Promise<ModelsApiResponse>
      })
      .then((data) => {
        // Transform DB models to UI format, using pre-grouped data from API
        const modelsByProvider: Record<string, Model[]> = {}
        
        // If apiProvider is specified, filter to just that provider
        const sourceProviders = apiProvider 
          ? [apiProvider].filter(p => data.modelsByApiProvider[p])
          : Object.keys(data.modelsByApiProvider)
        const providers: string[] = sourceProviders.sort()
        
        for (const provider of providers) {
          const dbModels = data.modelsByApiProvider[provider] || []
          modelsByProvider[provider] = dbModels.map(dbModel => ({
            id: dbModel.id,
            name: dbModel.displayName,
            displayName: dbModel.displayName,
            contextLength: 128000, // Default context length
            pricing: {
              inputPer1M: (dbModel.pricing?.input || 0) * 1000,
              outputPer1M: (dbModel.pricing?.output || 0) * 1000,
            },
            apiProvider: dbModel.apiProvider as ApiProvider,
            supportsBatchPricing: dbModel.supportsBatchPricing ?? false,
          }))
        }
        
        const totalInView = providers.reduce((sum, p) => sum + (modelsByProvider[p]?.length || 0), 0)
        
        const normalizedData: ModelsData = {
          families: providers,
          modelsByFamily: modelsByProvider,
          totalModels: totalInView,
        }
        setModelsData(normalizedData)
        setLoading(false)
        
        const families = normalizedData.families || []
        const modelsByGroup = normalizedData.modelsByFamily || {}
        
        if (!value && families.length > 0) {
          const randomFamily = families[Math.floor(Math.random() * families.length)]
          const familyModels = modelsByGroup[randomFamily]
          if (familyModels && familyModels.length > 0) {
            const randomModel = familyModels[Math.floor(Math.random() * familyModels.length)]
            handleChange(randomModel.id, getModelName(randomModel), randomModel.supportsBatchPricing)
          }
        }
      })
      .catch(err => {
        console.error('Failed to fetch models:', err)
        setError(err.message)
        setLoading(false)
      })
  }, [apiProvider])

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
              "w-full justify-between h-10",
              teamColors,
              !value && "text-muted-foreground"
            )}
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </span>
            ) : error ? (
              <span className="text-destructive">Error loading models</span>
            ) : selectedModel ? (
              <span className="truncate">{selectedModel.displayName}</span>
            ) : (
              placeholder
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent 
          className="w-[calc(100vw-2rem)] sm:w-[380px] p-0" 
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Command>
            <CommandInput placeholder="Search models..." />
            <CommandList className="max-h-[350px]">
              <CommandEmpty>No models found.</CommandEmpty>
              {(modelsData?.families || []).map(family => (
                <CommandGroup 
                  key={family} 
                  heading={`${family} (${modelsData?.modelsByFamily?.[family]?.length || 0})`}
                >
                  {modelsData?.modelsByFamily?.[family]?.map(model => {
                    const modelName = getModelName(model)
                    return (
                      <CommandItem
                        key={model.id}
                        value={`${family} ${modelName} ${model.id}`}
                        onSelect={() => {
                          handleChange(model.id, modelName, model.supportsBatchPricing)
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
                        <div className="flex items-center gap-3 shrink-0 ml-2 text-xs text-muted-foreground">
                          <span>{formatContext(model.contextLength)}</span>
                          <span className="font-mono">{formatPrice(getModelInputPrice(model))}</span>
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
