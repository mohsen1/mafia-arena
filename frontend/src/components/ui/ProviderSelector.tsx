"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Cloud, Zap, Network } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"

export type ApiProvider = 
  | 'openrouter'
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'cerebras'
  | 'minimax'
  | 'fireworks'

interface ProviderInfo {
  id: ApiProvider
  displayName: string
  description: string
  isAggregator: boolean
  icon: React.ReactNode
  color: { bg: string; text: string; border: string }
}

const PROVIDERS: ProviderInfo[] = [
  {
    id: 'openrouter',
    displayName: 'OpenRouter',
    description: 'Access 100+ models from many providers',
    isAggregator: true,
    icon: <Network className="h-4 w-4" />,
    color: { bg: "bg-violet-500/10", text: "text-violet-600 dark:text-violet-400", border: "border-violet-500/30" },
  },
  {
    id: 'openai',
    displayName: 'OpenAI',
    description: 'GPT-4o, o1, and more',
    isAggregator: false,
    icon: <Zap className="h-4 w-4" />,
    color: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-500/30" },
  },
  {
    id: 'anthropic',
    displayName: 'Anthropic',
    description: 'Claude 3.5, Claude 4',
    isAggregator: false,
    icon: <Zap className="h-4 w-4" />,
    color: { bg: "bg-orange-500/10", text: "text-orange-600 dark:text-orange-400", border: "border-orange-500/30" },
  },
  {
    id: 'google',
    displayName: 'Google (Gemini)',
    description: 'Gemini 2.0, 2.5 Flash & Pro',
    isAggregator: false,
    icon: <Zap className="h-4 w-4" />,
    color: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", border: "border-blue-500/30" },
  },
  {
    id: 'cerebras',
    displayName: 'Cerebras',
    description: 'Ultra-fast inference',
    isAggregator: false,
    icon: <Zap className="h-4 w-4" />,
    color: { bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400", border: "border-red-500/30" },
  },
  {
    id: 'minimax',
    displayName: 'MiniMax',
    description: 'MiniMax models',
    isAggregator: false,
    icon: <Cloud className="h-4 w-4" />,
    color: { bg: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-400", border: "border-rose-500/30" },
  },
  {
    id: 'fireworks',
    displayName: 'Fireworks AI',
    description: 'Fast open-source models',
    isAggregator: false,
    icon: <Zap className="h-4 w-4" />,
    color: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", border: "border-amber-500/30" },
  },
]

interface ProviderSelectorProps {
  value?: ApiProvider
  onChange?: (value: ApiProvider) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function ProviderSelector({
  value,
  onChange,
  placeholder = "Select provider...",
  className,
  disabled,
}: ProviderSelectorProps) {
  const [open, setOpen] = React.useState(false)
  
  const selectedProvider = PROVIDERS.find(p => p.id === value)

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "w-full justify-between h-auto min-h-[42px] py-2",
              !value && "text-muted-foreground"
            )}
            disabled={disabled}
          >
            {selectedProvider ? (
              <div className="flex items-center gap-2">
                <Badge 
                  variant="outline" 
                  className={cn(
                    "text-[10px] px-1.5 py-0",
                    selectedProvider.color.bg,
                    selectedProvider.color.text,
                    selectedProvider.color.border
                  )}
                >
                  {selectedProvider.icon}
                </Badge>
                <span>{selectedProvider.displayName}</span>
                {selectedProvider.isAggregator && (
                  <Badge variant="secondary" className="text-[10px] px-1 py-0">
                    Aggregator
                  </Badge>
                )}
              </div>
            ) : (
              placeholder
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[340px] p-0" align="start">
          <Command>
            <CommandList>
              <CommandEmpty>No providers found.</CommandEmpty>
              <CommandGroup heading="Aggregators">
                {PROVIDERS.filter(p => p.isAggregator).map(provider => (
                  <CommandItem
                    key={provider.id}
                    value={provider.id}
                    onSelect={() => {
                      onChange?.(provider.id)
                      setOpen(false)
                    }}
                    className="flex items-center justify-between py-3"
                  >
                    <div className="flex items-center gap-2">
                      <Check
                        className={cn(
                          "h-4 w-4 shrink-0",
                          value === provider.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "text-[10px] px-1.5 py-0",
                          provider.color.bg,
                          provider.color.text,
                          provider.color.border
                        )}
                      >
                        {provider.icon}
                      </Badge>
                      <div>
                        <div className="font-medium">{provider.displayName}</div>
                        <div className="text-xs text-muted-foreground">{provider.description}</div>
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup heading="Direct Providers">
                {PROVIDERS.filter(p => !p.isAggregator).map(provider => (
                  <CommandItem
                    key={provider.id}
                    value={provider.id}
                    onSelect={() => {
                      onChange?.(provider.id)
                      setOpen(false)
                    }}
                    className="flex items-center justify-between py-3"
                  >
                    <div className="flex items-center gap-2">
                      <Check
                        className={cn(
                          "h-4 w-4 shrink-0",
                          value === provider.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "text-[10px] px-1.5 py-0",
                          provider.color.bg,
                          provider.color.text,
                          provider.color.border
                        )}
                      >
                        {provider.icon}
                      </Badge>
                      <div>
                        <div className="font-medium">{provider.displayName}</div>
                        <div className="text-xs text-muted-foreground">{provider.description}</div>
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}

export { PROVIDERS }
export type { ProviderInfo }

