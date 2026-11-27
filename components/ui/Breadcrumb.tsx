"use client";

import React from "react";

export type BreadcrumbItem = {
  label: string;
  href?: string;
  current?: boolean;
};

export type BreadcrumbProps = {
  items: readonly BreadcrumbItem[];
  className?: string;
};

export function Breadcrumb({ items, className = "" }: BreadcrumbProps) {
  if (!items || items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={`flex items-center text-xs font-medium text-gray-400 ${className}`}>
      <ol className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        {items.map((item, index) => {
          const isLast = index === items.length - 1 || Boolean(item.current);

          return (
            <li key={`${item.label}-${index}`} className="inline-flex items-center gap-1.5 sm:gap-2">
              {index > 0 && (
                <span className="text-gray-600 select-none" aria-hidden="true">
                  /
                </span>
              )}
              {isLast ? (
                <span
                  className="font-semibold text-cyan-300 max-w-[180px] sm:max-w-[280px] truncate"
                  aria-current="page"
                  title={item.label}
                >
                  {item.label}
                </span>
              ) : item.href ? (
                <a
                  href={item.href}
                  className="text-gray-400 hover:text-cyan-200 transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-300 rounded px-1 max-w-[140px] sm:max-w-[200px] truncate"
                  title={item.label}
                >
                  {item.label}
                </a>
              ) : (
                <span className="text-gray-400 max-w-[140px] sm:max-w-[200px] truncate" title={item.label}>
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default Breadcrumb;
