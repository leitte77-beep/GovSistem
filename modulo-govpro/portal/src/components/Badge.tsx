import clsx from "clsx";

type Tone = "primary" | "success" | "warning" | "error" | "neutral";

const TONES: Record<Tone, string> = {
  primary: "bg-primary-container/15 text-primary border-primary/20",
  success: "bg-secondary-container/30 text-on-secondary-container border-secondary/30",
  warning: "bg-tertiary-container/15 text-on-tertiary-container border-tertiary/20",
  error: "bg-error-container text-on-error-container border-error/30",
  neutral: "bg-surface-container-high text-on-surface-variant border-outline-variant",
};

export default function Badge({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-label-md font-label-md",
        TONES[tone]
      )}
    >
      {children}
    </span>
  );
}
