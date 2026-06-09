import React, { useState } from "react";
import { Database } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DemoToggle() {
  const [isDemo, setIsDemo] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("demo_mode") === "true";
    }
    return false;
  });

  const toggle = () => {
    const next = !isDemo;
    localStorage.setItem("demo_mode", next ? "true" : "false");
    setIsDemo(next);
    window.location.reload();
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggle}
      className={`h-8 px-2.5 flex items-center justify-center gap-1.5 transition-all ${
        isDemo
          ? "bg-amber-500 hover:bg-amber-600 text-white border-transparent"
          : "border-slate-200 hover:border-slate-400 text-slate-700 dark:text-slate-200"
      }`}
      title={isDemo ? "Switch to Live Database" : "Switch to Demo Sandbox"}
      data-testid="demo-toggle-btn"
    >
      <Database className="h-3.5 w-3.5" />
      <span className="text-[11px] font-semibold">
        {isDemo ? "Sandbox Mode" : "Live DB"}
      </span>
    </Button>
  );
}
