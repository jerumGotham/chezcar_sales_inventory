import type { StylesConfig } from "react-select";

export type SelectOption = { value: string; label: string };

/**
 * react-select renders inline style, which Tailwind classes never reach, so
 * every screen kept its own copy of this object with fixed hex colours. That
 * left the control and its menu white on a dark page. Reading the theme tokens
 * instead means one definition follows the palette, including inside a light
 * island such as the sign-in card.
 */
export function themedSelectStyles<Option = SelectOption>(): StylesConfig<Option, false> {
  return {
    control: (base, state) => ({
      ...base,
      minHeight: "40px",
      borderRadius: "0.75rem",
      backgroundColor: "var(--background)",
      borderColor: state.isFocused ? "var(--ring)" : "var(--input)",
      boxShadow: "none",
      "&:hover": { borderColor: "var(--ring)" },
    }),
    valueContainer: (base) => ({ ...base, paddingLeft: "10px", paddingRight: "10px" }),
    input: (base) => ({ ...base, color: "var(--foreground)" }),
    singleValue: (base) => ({ ...base, color: "var(--foreground)" }),
    placeholder: (base) => ({ ...base, color: "var(--muted-foreground)", fontSize: "14px" }),
    indicatorSeparator: (base) => ({ ...base, backgroundColor: "var(--border)" }),
    dropdownIndicator: (base) => ({ ...base, color: "var(--muted-foreground)" }),
    clearIndicator: (base) => ({ ...base, color: "var(--muted-foreground)" }),
    menu: (base) => ({
      ...base,
      borderRadius: "0.75rem",
      overflow: "hidden",
      zIndex: 70,
      backgroundColor: "var(--popover)",
      border: "1px solid var(--border)",
    }),
    menuList: (base) => ({ ...base, backgroundColor: "var(--popover)" }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isSelected
        ? "var(--primary)"
        : state.isFocused
          ? "var(--accent)"
          : "var(--popover)",
      color: state.isSelected ? "var(--primary-foreground)" : "var(--popover-foreground)",
      cursor: "pointer",
    }),
    noOptionsMessage: (base) => ({ ...base, color: "var(--muted-foreground)" }),
  };
}

export const reactSelectStyles = themedSelectStyles();
