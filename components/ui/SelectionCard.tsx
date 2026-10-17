"use client";

import React from "react";

export type SelectionCardProps = {
  title: string;
  description?: string;
  badge?: string;
  icon?: React.ReactNode;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  children?: React.ReactNode;
};

export function SelectionCard({
  title,
  description,
  badge,
  icon,
  selected = false,
  disabled = false,
  onClick,
  className = "",
  children,
}: SelectionCardProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === "Enter" || e.key === " ") && !disabled && onClick) {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-pressed={selected}
      aria-disabled={disabled}
      onClick={() => !disabled && onClick?.()}
      onKeyDown={handleKeyDown}
      className={`group relative rounded-2xl border p-5 transition-all outline-none focus:ring-2 focus:ring-cyan-300 ${
        selected
          ? "border-cyan-300 bg-cyan-300/[0.12] shadow-lg shadow-cyan-950/40"
          : "border-white/10 bg-zinc-950/70 hover:border-cyan-300/40 hover:bg-white/[0.04]"
      } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"} ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {icon && <div className="text-cyan-300 text-lg">{icon}</div>}
          <h3 className="text-base font-black text-white">{title}</h3>
        </div>
        {badge && (
          <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2.5 py-0.5 text-[10px] font-bold text-cyan-200">
            {badge}
          </span>
        )}
      </div>

      {description && (
        <p className="mt-2 text-xs leading-5 text-gray-300">{description}</p>
      )}

      {children && <div className="mt-4">{children}</div>}

      <div
        className={`absolute bottom-3 right-3 h-2 w-2 rounded-full transition-colors ${
          selected ? "bg-cyan-300 shadow-sm shadow-cyan-300" : "bg-white/10"
        }`}
      />
    </div>
  );
}

export default SelectionCard;
