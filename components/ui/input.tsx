import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onWheel, onChange, ...props }, ref) => {
    // Fields that start at "0" otherwise keep it once a digit is typed, so a
    // quantity of one reads "01". Only a zero directly in front of another
    // digit is dropped — "0.5" and a lone "0" are left alone.
    const handleChange = React.useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        if (type === "number" && /^-?0\d/.test(event.currentTarget.value)) {
          event.currentTarget.value = event.currentTarget.value.replace(
            /^(-?)0+(?=\d)/,
            "$1",
          );
        }
        onChange?.(event);
      },
      [onChange, type],
    );

    // A focused number input treats the wheel as a spinner, so scrolling the
    // page over an amount silently edits it — a ₱5,000.00 field reads
    // ₱4,999.01 after ninety-nine notches. Money must never change without a
    // keystroke, so the field gives up focus and lets the page scroll instead.
    const handleWheel = React.useCallback(
      (event: React.WheelEvent<HTMLInputElement>) => {
        if (type === "number" && event.currentTarget === document.activeElement) {
          event.currentTarget.blur();
        }
        onWheel?.(event);
      },
      [onWheel, type],
    );

    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        onWheel={handleWheel}
        onChange={handleChange}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
