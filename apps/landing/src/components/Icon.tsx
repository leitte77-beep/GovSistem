import type { CSSProperties } from "react";

type IconProps = {
  /** Material Symbols ligature name, e.g. "rocket_launch". */
  name: string;
  className?: string;
  /** Render the filled variant of the symbol. */
  fill?: boolean;
  /**
   * Accessible label. When provided the icon is exposed to assistive tech as an
   * image; when omitted (the default) the icon is decorative and hidden from
   * screen readers so it isn't announced as its raw ligature text.
   */
  label?: string;
  style?: CSSProperties;
};

export default function Icon({ name, className = "", fill = false, label, style }: IconProps) {
  return (
    <span
      className={`material-symbols-outlined select-none ${className}`}
      style={fill ? { fontVariationSettings: "'FILL' 1", ...style } : style}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      {name}
    </span>
  );
}
