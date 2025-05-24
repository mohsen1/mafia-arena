"use client";

import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { forwardRef } from "react";

import { cn } from "@/lib/utils";

const magicalAIButtonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] overflow-hidden before:absolute before:inset-0 before:rounded-md before:padding-[2px] before:bg-gradient-to-r before:from-pink-500 before:via-purple-500 before:via-blue-500 before:via-cyan-500 before:via-green-500 before:via-yellow-500 before:to-pink-500 before:animate-spin before:duration-[3s] before:-z-10 before:content-[''] after:absolute after:inset-[2px] after:rounded-[calc(theme(borderRadius.md)-2px)] after:bg-background after:-z-10 after:content-['']",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 z-10",
        destructive:
          "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90 z-10",
        outline:
          "border-0 bg-card text-card-foreground shadow-xs hover:bg-accent hover:text-accent-foreground z-10",
        secondary:
          "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80 z-10",
        ghost: "bg-card hover:bg-accent hover:text-accent-foreground z-10",
        magical:
          "bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg hover:from-purple-700 hover:to-blue-700 z-10",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
      },
      animationSpeed: {
        slow: "before:duration-[5s]",
        normal: "before:duration-[3s]",
        fast: "before:duration-[1.5s]",
      },
      glowIntensity: {
        none: "",
        subtle: "before:drop-shadow-sm",
        medium: "before:drop-shadow-md before:blur-[1px]",
        strong: "before:drop-shadow-lg before:blur-[2px]",
      },
    },
    defaultVariants: {
      variant: "magical",
      size: "default",
      animationSpeed: "normal",
      glowIntensity: "subtle",
    },
  },
);

interface MagicalAIButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof magicalAIButtonVariants> {
  asChild?: boolean;
  /**
   * Custom gradient colors for the border animation.
   * Should be a valid CSS gradient string.
   */
  customGradient?: string;
}

const MagicalAIButton = forwardRef<HTMLButtonElement, MagicalAIButtonProps>(
  (
    {
      className,
      variant,
      size,
      animationSpeed,
      glowIntensity,
      asChild = false,
      customGradient,
      style,
      children,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";

    const customStyle = customGradient
      ? ({
          "--custom-gradient": customGradient,
        } as React.CSSProperties)
      : {};

    return (
      <Comp
        ref={ref}
        data-slot="magical-ai-button"
        className={cn(
          magicalAIButtonVariants({
            variant,
            size,
            animationSpeed,
            glowIntensity,
            className,
          }),
          customGradient && "before:bg-[image:var(--custom-gradient)]",
        )}
        style={{ ...customStyle, ...style }}
        {...props}
      >
        {children}
      </Comp>
    );
  },
);

MagicalAIButton.displayName = "MagicalAIButton";

export { MagicalAIButton, magicalAIButtonVariants }; 