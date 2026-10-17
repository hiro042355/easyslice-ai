"use client";

import React, { useState, useEffect, useRef } from "react";

export type NavLink = {
  label: string;
  href: string;
  badge?: string;
  active?: boolean;
};

export type HamburgerMenuProps = {
  links: readonly NavLink[];
  className?: string;
};

export function HamburgerMenu({ links, className = "" }: HamburgerMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
        toggleButtonRef.current?.focus();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const toggleMenu = () => setIsOpen((prev) => !prev);

  return (
    <div className={`relative ${className}`} ref={menuRef}>
      {/* Desktop Navigation */}
      <nav aria-label="Desktop Navigation" className="hidden md:flex items-center gap-6">
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className={`text-xs font-bold transition-colors flex items-center gap-1.5 ${
              link.active
                ? "text-cyan-300 border-b-2 border-cyan-300 pb-0.5"
                : "text-gray-300 hover:text-white"
            }`}
          >
            {link.label}
            {link.badge && (
              <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2 py-0.5 text-[10px] text-cyan-200">
                {link.badge}
              </span>
            )}
          </a>
        ))}
      </nav>

      {/* Mobile Toggle Button */}
      <button
        ref={toggleButtonRef}
        type="button"
        onClick={toggleMenu}
        aria-expanded={isOpen}
        aria-controls="mobile-navigation-menu"
        aria-label={isOpen ? "Close menu" : "Open menu"}
        className="md:hidden flex flex-col justify-center items-center w-10 h-10 rounded-xl border border-white/10 bg-zinc-900 text-gray-200 hover:text-white hover:border-cyan-300/40 focus:outline-none focus:ring-2 focus:ring-cyan-300 transition-colors"
      >
        <span
          className={`block w-5 h-0.5 bg-current transition-transform duration-300 ease-in-out ${
            isOpen ? "rotate-45 translate-y-1" : "-translate-y-1"
          }`}
        />
        <span
          className={`block w-5 h-0.5 bg-current transition-opacity duration-300 ease-in-out ${
            isOpen ? "opacity-0" : "opacity-100"
          }`}
        />
        <span
          className={`block w-5 h-0.5 bg-current transition-transform duration-300 ease-in-out ${
            isOpen ? "-rotate-45 -translate-y-1" : "translate-y-1"
          }`}
        />
      </button>

      {/* Mobile Backdrop & Drawer Menu */}
      {isOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-md"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />

          <div
            id="mobile-navigation-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile Navigation"
            className="relative z-10 w-full bg-zinc-950 border-b border-cyan-300/20 p-6 shadow-2xl flex flex-col gap-4 animate-in slide-in-from-top duration-200"
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <span className="text-xs font-black tracking-widest text-cyan-300 uppercase">
                NEXCUT AI
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg focus:outline-none focus:ring-1 focus:ring-cyan-300"
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>

            <nav aria-label="Mobile Menu Links" className="flex flex-col gap-3">
              {links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  className={`px-4 py-3 rounded-xl font-bold text-sm transition-colors flex items-center justify-between ${
                    link.active
                      ? "bg-cyan-300/15 border border-cyan-300/40 text-cyan-200"
                      : "bg-white/[0.04] text-gray-200 hover:bg-white/[0.08]"
                  }`}
                >
                  <span>{link.label}</span>
                  {link.badge && (
                    <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2 py-0.5 text-[10px] text-cyan-200">
                      {link.badge}
                    </span>
                  )}
                </a>
              ))}
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}

export default HamburgerMenu;
