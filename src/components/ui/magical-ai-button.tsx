"use client";

import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { forwardRef } from "react";

import { cn } from "@/lib/utils";

const magicalAIButtonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] before:absolute before:inset-0 before:rounded-md before:-z-10 before:content-[''] before:opacity-60 before:animate-[orbit_8s_linear_infinite] before:shadow-[0_0_12px_theme(colors.pink.500),4px_-4px_12px_theme(colors.purple.500),-4px_4px_12px_theme(colors.blue.500),-4px_-4px_12px_theme(colors.cyan.500)]",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 z-10 relative before:shadow-[0_0_8px_theme(colors.primary/60),3px_-3px_8px_theme(colors.primary/40),-3px_3px_8px_theme(colors.primary/40),-3px_-3px_8px_theme(colors.primary/60)]",
        destructive:
          "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90 z-10 relative before:shadow-[0_0_8px_theme(colors.destructive/60),3px_-3px_8px_theme(colors.destructive/40),-3px_3px_8px_theme(colors.destructive/40),-3px_-3px_8px_theme(colors.destructive/60)]",
        outline:
          "border-0 bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground z-10 relative before:shadow-[0_0_6px_theme(colors.accent/50),2px_-2px_6px_theme(colors.accent/30),-2px_2px_6px_theme(colors.accent/30),-2px_-2px_6px_theme(colors.accent/50)]",
        secondary:
          "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80 z-10 relative before:shadow-[0_0_8px_theme(colors.secondary/60),3px_-3px_8px_theme(colors.secondary/40),-3px_3px_8px_theme(colors.secondary/40),-3px_-3px_8px_theme(colors.secondary/60)]",
        ghost: "bg-background hover:bg-accent hover:text-accent-foreground z-10 relative before:shadow-[0_0_6px_theme(colors.accent/50),2px_-2px_6px_theme(colors.accent/30),-2px_2px_6px_theme(colors.accent/30),-2px_-2px_6px_theme(colors.accent/50)]",
        magical:
          "bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg hover:from-purple-700 hover:to-blue-700 hover:shadow-xl z-10 font-semibold relative before:shadow-[0_0_12px_theme(colors.pink.500),4px_-4px_12px_theme(colors.purple.500),-4px_4px_12px_theme(colors.blue.500),-4px_-4px_12px_theme(colors.cyan.500)] hover:before:opacity-80",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5 before:shadow-[0_0_10px_theme(colors.pink.500),3px_-3px_10px_theme(colors.purple.500),-3px_3px_10px_theme(colors.blue.500),-3px_-3px_10px_theme(colors.cyan.500)]",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4 before:rounded-lg before:shadow-[0_0_16px_theme(colors.pink.500),6px_-6px_16px_theme(colors.purple.500),-6px_6px_16px_theme(colors.blue.500),-6px_-6px_16px_theme(colors.cyan.500)]",
        icon: "size-9",
      },
      animationSpeed: {
        slow: "before:animate-[orbit_12s_linear_infinite]",
        normal: "before:animate-[orbit_8s_linear_infinite]",
        fast: "before:animate-[orbit_4s_linear_infinite]",
      },
      glowIntensity: {
        none: "before:opacity-0",
        subtle: "before:opacity-40 hover:before:opacity-50",
        medium: "before:opacity-60 hover:before:opacity-70",
        strong: "before:opacity-80 hover:before:opacity-90",
      },
    },
    defaultVariants: {
      variant: "magical",
      size: "default",
      animationSpeed: "normal",
      glowIntensity: "medium",
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