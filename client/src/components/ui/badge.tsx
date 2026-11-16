import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        primary:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        success:
          "border-transparent bg-success text-primary-foreground [a&]:hover:bg-success/90",
        warning:
          "border-transparent bg-warning-soft text-warning-strong [a&]:hover:bg-warning-soft/80",
        "success-soft":
          "border-transparent bg-success-soft text-success-strong [a&]:hover:bg-success-soft/80",
        "warning-soft":
          "border-transparent bg-warning-soft text-warning-strong [a&]:hover:bg-warning-soft/80",
        "danger-soft":
          "border-transparent bg-danger-soft text-destructive [a&]:hover:bg-danger-soft/80",
        "info-soft":
          "border-transparent bg-info-soft text-info [a&]:hover:bg-info-soft/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "border-transparent bg-destructive text-primary-foreground [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
