"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import { fieldControlClassName } from "@/lib/field-styles";
import { cn } from "@/lib/utils";

export type CertifiedOption = { value: string; label: string };

const MAX_VISIBLE = 80;

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function matches(option: CertifiedOption, query: string): boolean {
  if (!query) return true;
  const q = fold(query);
  return fold(option.label).includes(q) || fold(option.value).includes(q);
}

export function CertifiedSearchSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
  required,
  compact,
  label,
  noMatchLabel,
  refineLabel,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: CertifiedOption[];
  placeholder: string;
  required?: boolean;
  compact?: boolean;
  label: string;
  noMatchLabel: string;
  refineLabel: string;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = options.find((opt) => opt.value === value);
  const selectedLabel = selected?.label ?? "";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(selectedLabel);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!open) setQuery(selectedLabel);
  }, [selectedLabel, open]);

  const filtered = useMemo(
    () => options.filter((opt) => matches(opt, query)),
    [options, query],
  );
  const visible = filtered.slice(0, MAX_VISIBLE);

  useEffect(() => {
    setActive(0);
  }, [query]);

  function exactCertified(raw: string): CertifiedOption | undefined {
    const folded = fold(raw.trim());
    if (!folded) return undefined;
    return options.find(
      (opt) => fold(opt.label) === folded || fold(opt.value) === folded,
    );
  }

  function commitOrRevert() {
    const typed = query.trim();
    if (!typed) {
      if (value) onChange("");
      setQuery("");
      return;
    }
    const hit = exactCertified(typed) ?? (filtered.length === 1 ? filtered[0] : undefined);
    if (hit) {
      onChange(hit.value);
      setQuery(hit.label);
      return;
    }
    setQuery(selectedLabel);
  }

  function pick(option: CertifiedOption) {
    onChange(option.value);
    setQuery(option.label);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(visible.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const choice = visible[active];
      if (choice) pick(choice);
      else commitOrRevert();
      setOpen(false);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setQuery(selectedLabel);
      setOpen(false);
    }
  }

  return (
    <div className={cn("relative min-w-0", open && "z-30")}>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && visible[active] ? `${listId}-${visible[active].value}` : undefined
          }
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={open ? query : selectedLabel}
          required={required && !value}
          onFocus={() => {
            setOpen(true);
            setQuery(selectedLabel);
            requestAnimationFrame(() => inputRef.current?.select());
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            commitOrRevert();
            setOpen(false);
          }}
          className={cn(
            fieldControlClassName({ density: compact ? "compact" : "default" }),
            "pr-8 text-brand",
          )}
        />
        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
      </div>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className={cn(
            "absolute z-50 mt-1 max-h-60 w-full overflow-auto border border-border bg-surface py-1 shadow-elevated",
            compact ? "rounded-lg text-sm" : "rounded-xl text-[15px]",
          )}
        >
          {visible.length === 0 ? (
            <li className="px-3 py-2 text-muted-foreground">{noMatchLabel}</li>
          ) : (
            visible.map((opt, index) => (
              <li key={opt.value} role="presentation">
                <button
                  type="button"
                  id={`${listId}-${opt.value}`}
                  role="option"
                  aria-selected={opt.value === value}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => pick(opt)}
                  className={cn(
                    "flex w-full px-3 py-1.5 text-left text-brand",
                    index === active && "bg-canvas",
                    opt.value === value && "font-medium",
                  )}
                >
                  {opt.label}
                </button>
              </li>
            ))
          )}
          {filtered.length > MAX_VISIBLE ? (
            <li className="px-3 py-1.5 text-xs text-muted-foreground">
              {refineLabel}
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
