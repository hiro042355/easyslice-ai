"use client";

import React, { useId } from "react";

export type RadioOption<T extends string | number = string> = {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
};

export type RadioGroupProps<T extends string | number = string> = {
  name?: string;
  label?: string;
  options: readonly RadioOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  orientation?: "horizontal" | "vertical";
  className?: string;
};

export function RadioGroup<T extends string | number = string>({
  name: customName,
  label,
  options,
  value,
  onChange,
  disabled = false,
  orientation = "vertical",
  className = "",
}: RadioGroupProps<T>) {
  const generatedName = useId();
  const groupName = customName || generatedName;

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    const enabledOptions = options.filter((opt) => !opt.disabled && !disabled);
    if (enabledOptions.length === 0) return;

    let nextIndex = index;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      nextIndex = (index + 1) % options.length;
      while (options[nextIndex]?.disabled && nextIndex !== index) {
        nextIndex = (nextIndex + 1) % options.length;
      }
      if (options[nextIndex] && !options[nextIndex].disabled) {
        onChange(options[nextIndex].value);
      }
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      nextIndex = (index - 1 + options.length) % options.length;
      while (options[nextIndex]?.disabled && nextIndex !== index) {
        nextIndex = (nextIndex - 1 + options.length) % options.length;
      }
      if (options[nextIndex] && !options[nextIndex].disabled) {
        onChange(options[nextIndex].value);
      }
    }
  };

  return (
    <div role="radiogroup" aria-label={label} className={`flex flex-col gap-2 ${className}`}>
      {label && (
        <span className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
          {label}
        </span>
      )}
      <div
        className={
          orientation === "horizontal"
            ? "flex flex-wrap gap-3"
            : "flex flex-col gap-2"
        }
      >
        {options.map((opt, idx) => {
          const isSelected = opt.value === value;
          const isDisabled = disabled || Boolean(opt.disabled);

          return (
            <label
              key={String(opt.value)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              className={`relative flex items-start gap-3 p-3 rounded-xl border transition cursor-pointer select-none ${
                isSelected
                  ? "border-cyan-300 bg-cyan-300/10 text-white"
                  : "border-white/10 bg-zinc-900/60 text-gray-300 hover:border-cyan-300/30 hover:bg-white/[0.04]"
              } ${isDisabled ? "cursor-not-allowed opacity-50" : ""}`}
            >
              <input
                type="radio"
                name={groupName}
                value={String(opt.value)}
                checked={isSelected}
                disabled={isDisabled}
                onChange={() => !isDisabled && onChange(opt.value)}
                className="mt-0.5 h-4 w-4 rounded-full border-white/20 bg-zinc-900 text-cyan-300 focus:ring-cyan-300 accent-cyan-300"
              />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-white">{opt.label}</span>
                {opt.description && (
                  <span className="text-[11px] leading-4 text-gray-400 mt-0.5">
                    {opt.description}
                  </span>
                )}
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export default RadioGroup;
