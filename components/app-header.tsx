"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const THEME_KEY = "chezcar-theme";

function applyTheme(theme: "light" | "dark") {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

export function AppHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [isReady, setIsReady] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(THEME_KEY);
    const nextTheme =
      storedTheme === "dark" || storedTheme === "light"
        ? storedTheme
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";

    setTheme(nextTheme);
    applyTheme(nextTheme);
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    window.localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
  }, [isReady, theme]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  return (
    <div className="mb-6 flex flex-col gap-4 rounded-[1.75rem] border border-brand-100 bg-white px-5 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h2 className="text-2xl font-bold text-foreground">{title}</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button
          variant="outline"
          size="icon"
          className="rounded-2xl border-brand-100 bg-brand-50 text-brand-700 hover:bg-brand-100 hover:text-brand-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
          onClick={() =>
            setTheme((current) => (current === "light" ? "dark" : "light"))
          }
          aria-label={
            theme === "light" ? "Switch to dark mode" : "Switch to light mode"
          }
        >
          {theme === "light" ? (
            <Moon className="h-5 w-5" />
          ) : (
            <Sun className="h-5 w-5" />
          )}
        </Button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            className="flex items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50/70 px-3 py-2 text-left transition hover:bg-brand-100 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
            onClick={() => setIsMenuOpen((current) => !current)}
            aria-expanded={isMenuOpen}
            aria-haspopup="menu"
          >
            <Image
              src="/user-avatar.svg"
              alt="Current user avatar"
              width={40}
              height={40}
              className="rounded-full border border-brand-100 bg-white dark:border-slate-700 dark:bg-slate-950"
            />
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-sm font-semibold text-foreground">
                Owner Account
              </p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                Super Admin
              </p>
            </div>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-slate-500 transition-transform dark:text-slate-400",
                isMenuOpen && "rotate-180",
              )}
            />
          </button>

          <div
            className={cn(
              "absolute right-0 top-[calc(100%+0.75rem)] z-30 w-56 rounded-2xl border border-brand-100 bg-white p-2 shadow-soft transition dark:border-slate-800 dark:bg-slate-950",
              isMenuOpen
                ? "pointer-events-auto translate-y-0 opacity-100"
                : "pointer-events-none -translate-y-2 opacity-0",
            )}
            role="menu"
          >
            <div className="rounded-xl bg-brand-50/80 px-3 py-2 dark:bg-slate-900">
              <p className="text-sm font-semibold text-foreground">
                Owner Account
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                owner@chezcar.local
              </p>
            </div>
            <button
              type="button"
              className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10"
              role="menuitem"
              onClick={() => setIsMenuOpen(false)}
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
