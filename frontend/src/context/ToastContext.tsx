"use client";

/*
 * frontend/src/context/ToastContext.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Toast notification system with custom toasts (success, warning, error, info).
 * Features stackable notifications, auto-dismiss, progress indicator, and close button.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { createContext, useContext, useState, useCallback } from "react";

export type ToastType = "success" | "warning" | "error" | "info";

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextType {
  toasts: ToastMessage[];
  addToast: (toast: Omit<ToastMessage, "id">) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    ({ type, title, message, duration = 4000 }: Omit<ToastMessage, "id">) => {
      const id = Math.random().toString(36).substring(2, 9);
      const newToast: ToastMessage = { id, type, title, message, duration };

      setToasts((prev) => [...prev.slice(-4), newToast]); // Keep up to 5 at once

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      {/* Toast Container */}
      <div
        aria-live="assertive"
        className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto transform transition-all duration-300 ease-out translate-y-0 opacity-100 flex items-start gap-3 p-3.5 rounded-xl border shadow-xl backdrop-blur-md ${
              toast.type === "success"
                ? "bg-slate-900/95 dark:bg-slate-900/95 light:bg-white/95 border-emerald-500/40 text-slate-100"
                : toast.type === "warning"
                ? "bg-slate-900/95 dark:bg-slate-900/95 light:bg-white/95 border-amber-500/40 text-slate-100"
                : toast.type === "error"
                ? "bg-slate-900/95 dark:bg-slate-900/95 light:bg-white/95 border-red-500/40 text-slate-100"
                : "bg-slate-900/95 dark:bg-slate-900/95 light:bg-white/95 border-blue-500/40 text-slate-100"
            }`}
          >
            {/* Status icon */}
            <div className="flex-shrink-0 mt-0.5">
              {toast.type === "success" && (
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
              {toast.type === "warning" && (
                <div className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
              )}
              {toast.type === "error" && (
                <div className="w-5 h-5 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
              )}
              {toast.type === "info" && (
                <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pr-1">
              <h4 className="text-xs font-semibold text-white leading-snug">{toast.title}</h4>
              {toast.message && (
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed break-words">{toast.message}</p>
              )}
            </div>

            {/* Dismiss button */}
            <button
              onClick={() => removeToast(toast.id)}
              className="flex-shrink-0 text-slate-500 hover:text-slate-300 transition-colors p-1"
              aria-label="Dismiss toast"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
