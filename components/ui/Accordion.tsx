"use client";

import React, { useState, useId } from "react";

export type AccordionItemProps = {
  id?: string;
  title: string;
  subtitle?: string;
  defaultExpanded?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
};

export function AccordionItem({
  id: customId,
  title,
  subtitle,
  defaultExpanded = false,
  disabled = false,
  children,
  className = "",
}: AccordionItemProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const generatedId = useId();
  const itemId = customId || generatedId;
  const contentId = `${itemId}-content`;
  const headerId = `${itemId}-header`;

  const toggle = () => {
    if (!disabled) setIsExpanded((prev) => !prev);
  };

  return (
    <div className={`rounded-2xl border border-white/10 bg-zinc-950/80 overflow-hidden ${className}`}>
      <h3>
        <button
          id={headerId}
          type="button"
          aria-expanded={isExpanded}
          aria-controls={contentId}
          disabled={disabled}
          onClick={toggle}
          className={`w-full flex items-center justify-between p-4 text-left transition ${
            disabled ? "cursor-not-allowed opacity-50" : "hover:bg-white/[0.04]"
          }`}
        >
          <div>
            <span className="text-sm font-bold text-white block">{title}</span>
            {subtitle && (
              <span className="text-xs text-gray-400 mt-0.5 block">{subtitle}</span>
            )}
          </div>
          <span
            className={`text-cyan-300 text-xs transform transition-transform duration-200 ${
              isExpanded ? "rotate-180" : "rotate-0"
            }`}
          >
            ▼
          </span>
        </button>
      </h3>

      {isExpanded && (
        <div
          id={contentId}
          role="region"
          aria-labelledby={headerId}
          className="border-t border-white/10 p-4 text-xs text-gray-200 bg-black/30 animate-in fade-in duration-150"
        >
          {children}
        </div>
      )}
    </div>
  );
}

export type AccordionProps = {
  children: React.ReactNode;
  className?: string;
};

export function Accordion({ children, className = "" }: AccordionProps) {
  return <div className={`flex flex-col gap-3 ${className}`}>{children}</div>;
}

export default Accordion;
