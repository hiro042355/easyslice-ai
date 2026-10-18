"use client";

import React, { useId } from "react";

export type SelectOption<T extends string | number = string> = {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
};

export type SelectProps<T extends string | number = string> = {
  label?: string;
  options: readonly SelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
};

export function Select<T extends string | number = string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
  className = "",
  id: customId,
}: SelectProps<T>) {
  const generatedId = useId();
  const selectId = customId || generatedId;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label htmlFor={selectId} className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          value={String(value)}
          disabled={disabled}
          onChange={(e) => {
            const rawVal = e.target.value;
            const match = options.find((opt) => String(opt.value) === rawVal);
            if (match) onChange(match.value);
          }}
          className="w-full appearance-none rounded-xl border border-white/10 bg-zinc-900/90 px-4 py-2.5 text-xs font-bold text-white outline-none transition hover:border-cyan-300/40 focus:border-cyan-300 focus:ring-1 focus:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-50 pr-8"
        >
          {options.map((opt) => (
            <option
              key={String(opt.value)}
              value={String(opt.value)}
              disabled={opt.disabled}
              className="bg-zinc-950 text-white font-medium"
            >
              {opt.label}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-cyan-300 text-xs">
          ▼
        </div>
      </div>
    </div>
  );
}

export default Select;
