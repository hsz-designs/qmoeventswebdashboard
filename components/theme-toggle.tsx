"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

const THEME_STORAGE_KEY = "qmo-theme";
const THEME_CHANGE_EVENT = "qmo-theme-change";

function subscribeToTheme(onStoreChange: () => void) {
    function handleStorage(event: StorageEvent) {
        if (event.key !== THEME_STORAGE_KEY) return;

        const nextIsDark = event.newValue === "dark";
        document.documentElement.classList.toggle("dark", nextIsDark);
        document.documentElement.style.colorScheme = nextIsDark ? "dark" : "light";
        onStoreChange();
    }

    window.addEventListener("storage", handleStorage);
    window.addEventListener(THEME_CHANGE_EVENT, onStoreChange);

    return () => {
        window.removeEventListener("storage", handleStorage);
        window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange);
    };
}

function getThemeSnapshot() {
    return document.documentElement.classList.contains("dark");
}

export function ThemeToggle() {
    const isDark = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, () => false);

    function toggleTheme() {
        const nextIsDark = !isDark;

        document.documentElement.classList.toggle("dark", nextIsDark);
        document.documentElement.style.colorScheme = nextIsDark ? "dark" : "light";
        localStorage.setItem(THEME_STORAGE_KEY, nextIsDark ? "dark" : "light");
        window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
    }

    return (
        <button
            type="button"
            role="switch"
            aria-checked={isDark}
            aria-label={`Switch to ${isDark ? "light" : "dark"} theme`}
            title={`Switch to ${isDark ? "light" : "dark"} theme`}
            onClick={toggleTheme}
            className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 p-2 text-slate-500 shadow-[0_12px_35px_-12px_rgba(15,23,42,0.4)] backdrop-blur-xl transition-colors hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-400 dark:hover:text-white"
        >
            <Sun size={16} className={isDark ? "" : "text-amber-500"} aria-hidden="true" />
            <span className="relative h-6 w-11 rounded-full bg-slate-200 transition-colors dark:bg-sky-600" aria-hidden="true">
                <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${isDark ? "translate-x-6" : "translate-x-1"}`} />
            </span>
            <Moon size={16} className={isDark ? "text-sky-300" : ""} aria-hidden="true" />
        </button>
    );
}
