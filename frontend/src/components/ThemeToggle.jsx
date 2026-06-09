import React, { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("theme");
      if (saved) return saved === "dark";
    }
    return true; // Default to dark theme
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (isDark) {
      root.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      root.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDark]);

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setIsDark(!isDark)}
      className="border-slate-200 hover:border-slate-400 h-8 px-2 flex items-center justify-center gap-1.5"
      data-testid="theme-toggle-btn"
    >
      {isDark ? (
        <>
          <Sun className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-[11px] font-semibold">Light Mode</span>
        </>
      ) : (
        <>
          <Moon className="h-3.5 w-3.5 text-slate-700" />
          <span className="text-[11px] font-semibold">Dark Mode</span>
        </>
      )}
    </Button>
  );
}
