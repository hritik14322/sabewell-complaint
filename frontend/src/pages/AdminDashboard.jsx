import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Search, ChevronRight } from "lucide-react";
import api from "@/lib/api";
import { StatusPill, WarrantyPill, formatDate, formatDateTime, STATUSES } from "@/lib/complaint";

const STAT_TILES = [
  { key: "total", label: "Total", color: "text-slate-900", dot: "bg-slate-900" },
  { key: "pending", label: "Pending", color: "text-amber-700", dot: "bg-amber-500" },
  { key: "in_progress", label: "In Progress", color: "text-blue-700", dot: "bg-blue-500" },
  { key: "resolved", label: "Resolved", color: "text-emerald-700", dot: "bg-emerald-500" },
];

export default function AdminDashboard() {
  const role = typeof window !== "undefined" ? localStorage.getItem("sw_role") : "admin";
  const [stats, setStats] = useState({ total: 0, pending: 0, in_progress: 0, resolved: 0 });
  const [items, setItems] = useState([]);
  const [statusFilter, setStatusFilter] = useState(() => {
    return sessionStorage.getItem("admin_complaints_status_filter") || "all";
  });
  const [q, setQ] = useState(() => {
    return sessionStorage.getItem("admin_complaints_search_query") || "";
  });
  const [loading, setLoading] = useState(true);

  const fetchAll = async (s = statusFilter, query = q) => {
    setLoading(true);
    try {
      const params = {};
      if (s && s !== "all") params.status_filter = s;
      if (query) params.q = query;
      const [statsRes, listRes] = await Promise.all([
        api.get("/stats"),
        api.get("/complaints", { params }),
      ]);
      setStats(statsRes.data);
      setItems(listRes.data);
    } catch (e) {
      // 401 redirects in interceptor
    } finally {
      setLoading(false);
    }
  };

  // Sync state to sessionStorage
  useEffect(() => {
    sessionStorage.setItem("admin_complaints_status_filter", statusFilter);
  }, [statusFilter]);

  useEffect(() => {
    sessionStorage.setItem("admin_complaints_search_query", q);
  }, [q]);

  // Initial + status filter changes
  useEffect(() => {
    fetchAll(statusFilter, q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  // Real-time debounced search
  useEffect(() => {
    const t = setTimeout(() => {
      fetchAll(statusFilter, q);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const onSearchSubmit = (e) => {
    e.preventDefault();
    fetchAll(statusFilter, q);
  };

  return (
    <AdminLayout
      title="Complaints"
      action={
        role === "admin" && (
          <Link to="/admin/new" data-testid="new-complaint-link">
            <Button className="bg-black hover:bg-slate-800 text-white">
              <Plus className="h-4 w-4 mr-1.5" /> Register complaint
            </Button>
          </Link>
        )
      }
    >
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8" data-testid="stats-grid">
        {STAT_TILES.map((t) => (
          <Card key={t.key} className="p-5 border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">{t.label}</div>
              <span className={`w-2 h-2 rounded-full ${t.dot}`} />
            </div>
            {loading ? (
              <div className="h-9 w-16 bg-slate-100 animate-pulse rounded mt-3" />
            ) : (
              <div className={`font-heading text-3xl sm:text-4xl font-bold mt-3 tracking-tight ${t.color}`} data-testid={`stat-${t.key}`}>
                {stats[t.key] ?? 0}
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="p-4 mb-4 border-slate-200 shadow-sm">
        <form onSubmit={onSearchSubmit} className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search ID, name, phone, serial, invoice, product, village, city, district, state, pincode…"
              className="pl-9 bg-white border-slate-300 focus-visible:ring-slate-900"
              data-testid="search-input"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="sm:w-56 bg-white border-slate-300" data-testid="status-filter-select">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" data-testid="status-filter-all">All statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s} data-testid={`status-filter-${s.toLowerCase().replace(" ", "-")}`}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" variant="outline" className="border-slate-200 hover:border-slate-400" data-testid="search-submit-btn">
            Search
          </Button>
        </form>
      </Card>

      {/* Table */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50">
              <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Complaint ID</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Customer</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-semibold hidden md:table-cell">Serial</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-semibold hidden lg:table-cell">Phone</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-semibold hidden lg:table-cell">Date</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Status</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-semibold w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody data-testid="complaints-table-body">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i} className="border-b border-slate-100 hover:bg-transparent">
                  <TableCell className="py-4"><div className="h-5 w-24 bg-slate-100 animate-pulse rounded" /></TableCell>
                  <TableCell className="py-4">
                    <div className="h-5 w-36 bg-slate-100 animate-pulse rounded mb-2" />
                    <div className="h-4 w-48 bg-slate-100 animate-pulse rounded" />
                  </TableCell>
                  <TableCell className="py-4 hidden md:table-cell"><div className="h-5 w-28 bg-slate-100 animate-pulse rounded" /></TableCell>
                  <TableCell className="py-4 hidden lg:table-cell"><div className="h-5 w-28 bg-slate-100 animate-pulse rounded" /></TableCell>
                  <TableCell className="py-4 hidden lg:table-cell"><div className="h-5 w-20 bg-slate-100 animate-pulse rounded" /></TableCell>
                  <TableCell className="py-4">
                    <div className="h-6 w-20 bg-slate-100 animate-pulse rounded-full" />
                  </TableCell>
                  <TableCell className="py-4 text-right">
                    <div className="h-4 w-4 bg-slate-100 animate-pulse rounded ml-auto" />
                  </TableCell>
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-16 text-center">
                  <div className="text-slate-500 text-sm">No complaints yet.</div>
                  <Link to="/admin/new" className="inline-block mt-3" data-testid="empty-create-link">
                    <Button className="bg-black hover:bg-slate-800 text-white">
                      <Plus className="h-4 w-4 mr-1.5" /> Register first complaint
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            ) : (
              items.map((c) => (
                <TableRow key={c.id} className="border-b border-slate-100 hover:bg-slate-50" data-testid={`row-${c.complaint_id}`}>
                  <TableCell className="py-4 font-mono text-sm font-medium text-slate-900">
                    <Link to={`/admin/c/${c.complaint_id}`} className="hover:underline" data-testid={`row-link-${c.complaint_id}`}>
                      {c.complaint_id}
                    </Link>
                  </TableCell>
                  <TableCell className="py-4 text-sm">
                    <div className="font-medium text-slate-900">{c.name}</div>
                    <div className="text-xs text-slate-500 truncate max-w-[280px]">{c.issue_description}</div>
                  </TableCell>
                  <TableCell className="py-4 text-sm text-slate-700 hidden md:table-cell font-mono">{c.product_serial}</TableCell>
                  <TableCell className="py-4 text-sm text-slate-700 hidden lg:table-cell">{c.phone}</TableCell>
                  <TableCell className="py-4 text-sm text-slate-700 hidden lg:table-cell">{formatDate(c.date)}</TableCell>
                  <TableCell className="py-4">
                    <StatusPill status={c.status} testid={`row-status-${c.complaint_id}`} />
                    {c.warranty && (
                      <div className="mt-1.5">
                        <WarrantyPill warranty={c.warranty} testid={`row-warranty-${c.complaint_id}`} />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="py-4 text-right">
                    <Link to={`/admin/c/${c.complaint_id}`} data-testid={`row-arrow-${c.complaint_id}`}>
                      <ChevronRight className="h-4 w-4 text-slate-400 hover:text-slate-900 inline" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </AdminLayout>
  );
}
