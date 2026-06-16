import React from "react";
import { Link, useLocation } from "react-router-dom";
import { LogOut, Users, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";

export default function AdminLayout({ children, title, action }) {
  const email = typeof window !== "undefined" ? localStorage.getItem("sw_email") : "";
  const location = useLocation();
  const isActive = (p) => location.pathname === p || location.pathname.startsWith(p + "/");

  const logout = () => {
    localStorage.removeItem("sw_token");
    localStorage.removeItem("sw_email");
    localStorage.removeItem("sw_role");
    sessionStorage.removeItem("admin_complaints_search_query");
    sessionStorage.removeItem("admin_complaints_status_filter");
    sessionStorage.removeItem("admin_customers_search_query");
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <header className="max-w-7xl mx-auto px-6 md:px-12 py-4 flex items-center justify-between gap-6">
          <Link to="/admin" className="flex items-center gap-3" data-testid="admin-home-link">
            <Logo to={null} size="md" testid="admin-brand-logo" />
            <div className="hidden sm:block">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold">Admin Console</div>
            </div>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            <Link
              to="/admin"
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive("/admin") && !isActive("/admin/customers") ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}
              data-testid="nav-complaints"
            >
              <ClipboardList className="h-4 w-4 inline mr-1.5 -mt-0.5" /> Complaints
            </Link>
            <Link
              to="/admin/customers"
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive("/admin/customers") ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}
              data-testid="nav-customers"
            >
              <Users className="h-4 w-4 inline mr-1.5 -mt-0.5" /> Customers
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600 hidden lg:inline" data-testid="admin-email">{email}</span>
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
        </header>
        <div className="md:hidden border-t border-slate-100 px-6 py-2.5 flex justify-center gap-3">
          <Link
            to="/admin"
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors flex items-center ${isActive("/admin") && !isActive("/admin/customers") ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}
            data-testid="mobile-nav-complaints"
          >
            <ClipboardList className="h-3.5 w-3.5 mr-1.5" /> Complaints
          </Link>
          <Link
            to="/admin/customers"
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors flex items-center ${isActive("/admin/customers") ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}
            data-testid="mobile-nav-customers"
          >
            <Users className="h-3.5 w-3.5 mr-1.5" /> Customers
          </Link>
        </div>
      </div>
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
