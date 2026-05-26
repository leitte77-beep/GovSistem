"use client";

import { useState, useCallback } from "react";

type ShareDialogProps = {
  url: string;
  title?: string;
};

type ShareOption = {
  key: string;
  label: string;
  icon: string;
  color: string;
  action: (url: string, title?: string) => void;
};

const OPTIONS: ShareOption[] = [
  {
    key: "whatsapp",
    label: "WhatsApp",
    icon: "chat",
    color: "bg-[#25D366]",
    action: (url) => {
      window.open(`https://wa.me/?text=${encodeURIComponent(url)}`, "_blank", "noopener");
    },
  },
  {
    key: "facebook",
    label: "Facebook",
    icon: "facebook",
    color: "bg-[#1877F2]",
    action: (url) => {
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, "_blank", "noopener");
    },
  },
  {
    key: "x",
    label: "X",
    icon: "X",
    color: "bg-[#000000]",
    action: (url, title) => {
      const text = title ? `${title} ${url}` : url;
      window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    },
  },
  {
    key: "email",
    label: "E-mail",
    icon: "mail",
    color: "bg-primary",
    action: (url, title) => {
      window.location.href = `mailto:?subject=${encodeURIComponent(title || "Compartilhar")}&body=${encodeURIComponent(url)}`;
    },
  },
  {
    key: "copy",
    label: "Copiar Link",
    icon: "link",
    color: "bg-on-surface-variant",
    action: async (url) => {
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        const input = document.createElement("input");
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
    },
  },
];

export default function ShareDialog({ url, title }: ShareDialogProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleAction = useCallback(
    async (opt: ShareOption) => {
      if (opt.key === "copy") {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
      opt.action(url, title);
      if (opt.key !== "copy") {
        setOpen(false);
      }
    },
    [url, title],
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-2 border border-outline-variant rounded-lg text-on-surface-variant hover:bg-surface-container-low transition-all"
        title="Compartilhar"
      >
        <span className="material-symbols-outlined">share</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm bg-surface-container-lowest border border-outline-variant rounded-xl shadow-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-headline-sm font-headline-sm text-primary">
                Compartilhar
              </h3>
              <button
                onClick={() => setOpen(false)}
                className="p-1 text-on-surface-variant hover:text-primary rounded-full"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="grid grid-cols-5 gap-3">
              {OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => handleAction(opt)}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-surface-container-low transition-all group"
                >
                  <span
                    className={`w-12 h-12 rounded-full flex items-center justify-center text-white text-lg ${opt.color} group-hover:scale-110 transition-transform`}
                  >
                    {opt.key === "x" ? (
                      <span className="font-bold text-sm">X</span>
                    ) : (
                      <span className="material-symbols-outlined">{opt.icon}</span>
                    )}
                  </span>
                  <span className="text-label-md font-label-md text-on-surface-variant text-center leading-tight">
                    {opt.key === "copy" && copied ? "Copiado!" : opt.label}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-4 p-3 bg-surface-container-low rounded-lg flex items-center gap-2">
              <span className="material-symbols-outlined text-outline text-sm">link</span>
              <span className="text-body-sm font-body-sm text-on-surface-variant truncate flex-1">
                {url}
              </span>
              <button
                onClick={() => handleAction(OPTIONS[4])}
                className="text-label-md font-label-md text-primary hover:underline flex-shrink-0"
              >
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
