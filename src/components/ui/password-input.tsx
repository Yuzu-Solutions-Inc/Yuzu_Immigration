"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function PasswordInput({
  id,
  name,
  autoComplete,
  required,
  minLength,
  showLabel,
  hideLabel,
  className,
}: {
  id: string;
  name: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  showLabel: string;
  hideLabel: string;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={cn("group relative", className)}>
      <Input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        className="pr-10"
      />
      <button
        type="button"
        tabIndex={-1}
        className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        aria-label={visible ? hideLabel : showLabel}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? (
          <EyeOff className="size-4" aria-hidden />
        ) : (
          <Eye className="size-4" aria-hidden />
        )}
      </button>
    </div>
  );
}
