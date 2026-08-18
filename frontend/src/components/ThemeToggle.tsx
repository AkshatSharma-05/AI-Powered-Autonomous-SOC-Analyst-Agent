"use client";

/*
 * frontend/src/components/ThemeToggle.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Polished Theme Toggle Switch for Light & Dark mode.
 * Features smooth micro-animations, sun/moon SVG icons, and accessible tooltips.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from "react";
import { useTheme } from "../context/ThemeContext";

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggleTheme, isDark } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      className={`focus-ring relative p-1.5 rounded-lg border transition-all duration-200 flex items-center justify-center ${
        isDark
          ? "bg-slate-800/80 border-slate-700/60 text-amber-400 hover:bg-slate-700/80 hover:text-amber-300 shadow-sm"
          : "bg-slate-100 border-slate-300/80 text-slate-700 hover:bg-slate-200/90 hover:text-slate-900 shadow-sm"
      } ${className}`}
    >
      <div className="relative w-4 h-4 overflow-hidden">
        {/* Sun Icon */}
        <svg
          className={`w-4 h-4 absolute inset-0 transition-transform duration-300 ease-in-out ${
            isDark ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100 text-amber-500"
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>

        {/* Moon Icon */}
        <svg
          className={`w-4 h-4 absolute inset-0 transition-transform duration-300 ease-in-out ${
            isDark ? "rotate-0 scale-100 opacity-100 text-sky-400" : "-rotate-90 scale-0 opacity-0"
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
          />
        </svg>
      </div>
      <span className="sr-only">Toggle theme (current: {theme})</span>
    </button>
  );
}
