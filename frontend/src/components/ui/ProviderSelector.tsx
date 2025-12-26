"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

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
}

const PROVIDERS: ProviderInfo[] = [
  {
    id: 'openrouter',
    displayName: 'OpenRouter',
    description: 'Access 100+ models from many providers',
    isAggregator: true,
  },
  {
    id: 'openai',
    displayName: 'OpenAI',
    description: 'GPT-4o, GPT-5, and more',
    isAggregator: false,
  },
  {
    id: 'anthropic',
    displayName: 'Anthropic',
    description: 'Claude 3.5, Claude 4, Claude 4.5',
    isAggregator: false,
  },
  {
    id: 'google',
    displayName: 'Google',
    description: 'Gemini 2.5, Gemini 3',
    isAggregator: false,
  },
  {
    id: 'cerebras',
    displayName: 'Cerebras',
    description: 'Ultra-fast inference (free tier)',
    isAggregator: false,
  },
  {
    id: 'minimax',
    displayName: 'MiniMax',
    description: 'MiniMax M1, M2.1',
    isAggregator: false,
  },
  {
    id: 'fireworks',
    displayName: 'Fireworks',
    description: 'DeepSeek, Llama, Qwen',
    isAggregator: false,
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
              "w-full justify-between h-10",
              !value && "text-muted-foreground"
            )}
            disabled={disabled}
          >
            {selectedProvider ? selectedProvider.displayName : placeholder}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-0" align="start">
          <Command>
            <CommandList>
              <CommandEmpty>No providers found.</CommandEmpty>
              <CommandGroup heading="Aggregator">
                {PROVIDERS.filter(p => p.isAggregator).map(provider => (
                  <CommandItem
                    key={provider.id}
                    value={provider.id}
                    onSelect={() => {
                      onChange?.(provider.id)
                      setOpen(false)
                    }}
                    className="py-2"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === provider.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div>
                      <div className="font-medium">{provider.displayName}</div>
                      <div className="text-xs text-muted-foreground">{provider.description}</div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup heading="Direct API">
                {PROVIDERS.filter(p => !p.isAggregator).map(provider => (
                  <CommandItem
                    key={provider.id}
                    value={provider.id}
                    onSelect={() => {
                      onChange?.(provider.id)
                      setOpen(false)
                    }}
                    className="py-2"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === provider.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div>
                      <div className="font-medium">{provider.displayName}</div>
                      <div className="text-xs text-muted-foreground">{provider.description}</div>
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
