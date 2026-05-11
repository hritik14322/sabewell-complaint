import React from "react";
import { Link } from "react-router-dom";
import { LogOut, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminLayout({ children, title, action }) {
  const email = typeof window !== "undefined" ? localStorage.getItem("sw_email") : "";

  const logout = () => {
    localStorage.removeItem("sw_token");
    localStorage.removeItem("sw_email");
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-4 flex items-center justify-between">
          <Link to="/admin" className="flex items-center gap-2" data-testid="admin-home-link">
            <div className="w-8 h-8 bg-black rounded-md flex items-center justify-center">
              <ClipboardList className="h-4 w-4 text-white" />
            </div>
            <div>
              <div className="font-heading font-bold text-lg leading-none tracking-tight">sabewell</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold mt-0.5">Admin Console</div>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600 hidden sm:inline" data-testid="admin-email">{email}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              className="border-slate-200 hover:border-slate-400"
              data-testid="logout-btn"
            >
              <LogOut className="h-4 w-4 mr-1.5" /> Logout
            </Button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 md:px-12 py-8 md:py-12">
        {(title || action) && (
          <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
            <div>
              {title && <h1 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight">{title}</h1>}
            </div>
            {action}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
