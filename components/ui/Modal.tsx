"use client";

import React, { useEffect, useRef, useId } from "react";

export type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  isDestructive?: boolean;
  isLoading?: boolean;
  className?: string;
};

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  isDestructive = false,
  isLoading = false,
  className = "",
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      const timer = setTimeout(() => {
        const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable && focusable.length > 0) {
          focusable[0]?.focus();
        }
      }, 50);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          onClose();
        }

        if (e.key === "Tab" && modalRef.current) {
          const focusables = modalRef.current.querySelectorAll<HTMLElement>(
            'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
          );
          if (focusables.length === 0) return;
          const first = focusables[0];
          const last = focusables[focusables.length - 1];

          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      };

      document.addEventListener("keydown", handleKeyDown);
      return () => {
        clearTimeout(timer);
        document.removeEventListener("keydown", handleKeyDown);
        document.body.style.overflow = previousOverflow;
        previousFocusRef.current?.focus();
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={`relative z-10 w-full max-w-lg rounded-2xl border border-cyan-300/25 bg-zinc-950 p-6 shadow-2xl shadow-cyan-950/40 text-white ${className}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-xl font-black tracking-tight text-white">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-2 text-xs leading-5 text-gray-300">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-lg focus:outline-none focus:ring-1 focus:ring-cyan-300"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {children && <div className="mt-4">{children}</div>}

        <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="rounded-xl border border-white/15 bg-zinc-900 px-4 py-2.5 text-xs font-bold text-gray-300 hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-cyan-300 disabled:opacity-50"
          >
            {cancelLabel}
          </button>

          {onConfirm && confirmLabel && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={isLoading}
              className={`rounded-xl px-4 py-2.5 text-xs font-black transition focus:outline-none focus:ring-2 focus:ring-cyan-300 disabled:opacity-50 ${
                isDestructive
                  ? "bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-950/40"
                  : "bg-cyan-300 hover:bg-cyan-200 text-zinc-950 shadow-lg shadow-cyan-950/40"
              }`}
            >
              {isLoading ? "Processing..." : confirmLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default Modal;
