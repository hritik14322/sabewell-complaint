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
import { Plus, Search, ChevronRight, Download, Printer } from "lucide-react";
import { toast } from "sonner";
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
  const [dateFilterType, setDateFilterType] = useState(() => {
    return sessionStorage.getItem("admin_complaints_date_filter_type") || "all";
  });
  const [customStartDate, setCustomStartDate] = useState(() => {
    return sessionStorage.getItem("admin_complaints_custom_start_date") || "";
  });
  const [customEndDate, setCustomEndDate] = useState(() => {
    return sessionStorage.getItem("admin_complaints_custom_end_date") || "";
  });
  const [loading, setLoading] = useState(true);

  const toLocalDateString = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const getDateRange = () => {
    if (dateFilterType === "this-month") {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { start_date: toLocalDateString(start), end_date: toLocalDateString(end) };
    }
    if (dateFilterType === "last-month") {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start_date: toLocalDateString(start), end_date: toLocalDateString(end) };
    }
    if (dateFilterType === "custom") {
      return { start_date: customStartDate || null, end_date: customEndDate || null };
    }
    return { start_date: null, end_date: null };
  };

  const fetchAll = async (s = statusFilter, query = q) => {
    setLoading(true);
    try {
      const params = {};
      if (s && s !== "all") params.status_filter = s;
      if (query) params.q = query;

      const dateRange = getDateRange();
      if (dateRange.start_date) params.start_date = dateRange.start_date;
      if (dateRange.end_date) params.end_date = dateRange.end_date;

      const [statsRes, listRes] = await Promise.all([
        api.get("/stats", { params: { start_date: dateRange.start_date, end_date: dateRange.end_date } }),
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

  useEffect(() => {
    sessionStorage.setItem("admin_complaints_date_filter_type", dateFilterType);
  }, [dateFilterType]);

  useEffect(() => {
    sessionStorage.setItem("admin_complaints_custom_start_date", customStartDate);
  }, [customStartDate]);

  useEffect(() => {
    sessionStorage.setItem("admin_complaints_custom_end_date", customEndDate);
  }, [customEndDate]);

  // Initial + status + date filter changes
  useEffect(() => {
    fetchAll(statusFilter, q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, dateFilterType, customStartDate, customEndDate]);

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

  const downloadExcel = () => {
    if (items.length === 0) return;
    
    // Headers
    const headers = [
      "Complaint ID",
      "Customer Name",
      "Phone",
      "Date",
      "Status",
      "Warranty",
      "Product Details",
      "Product Serial",
      "Invoice Number",
      "Issue Description",
      "Address",
      "Village",
      "City",
      "District",
      "State",
      "Pincode"
    ];
    
    // Rows
    const rows = items.map(c => [
      c.complaint_id,
      c.name,
      c.phone,
      c.date,
      c.status,
      c.warranty || "Warranted",
      c.product_details || "",
      c.product_serial || "",
      c.invoice_number || "",
      c.issue_description || "",
      c.address || "",
      c.village || "",
      c.city || "",
      c.district || "",
      c.state || "",
      c.pincode || ""
    ]);
    
    // Convert to CSV string, escaping quotes
    const csvContent = [
      headers.join(","),
      ...rows.map(row => 
        row.map(val => {
          const text = String(val).replace(/"/g, '""'); // Escape quotes
          return text.includes(",") || text.includes("\n") || text.includes('"') ? `"${text}"` : text;
        }).join(",")
      )
    ].join("\n");
    
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: "text/csv;charset=utf-8;" }); // UTF-8 BOM
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `complaints_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadPdf = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Popup blocker prevented opening the print window.");
      return;
    }
    
    const htmlRows = items.map(c => `
      <tr>
        <td style="font-family: monospace;">${c.complaint_id}</td>
        <td>${c.name}</td>
        <td>${c.phone}</td>
        <td>${formatDate(c.date)}</td>
        <td>${c.status}</td>
        <td>${c.warranty || "Warranted"}</td>
        <td>${c.product_serial}</td>
      </tr>
    `).join("");
    
    const htmlContent = `
      <html>
        <head>
          <title>Complaints Report - ${new Date().toISOString().slice(0, 10)}</title>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; margin: 30px; }
            h1 { font-size: 24px; margin-bottom: 5px; font-weight: bold; }
            .meta { font-size: 12px; color: #666; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
            th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
            th { background-color: #f5f5f5; font-weight: bold; }
            tr:nth-child(even) { background-color: #fafafa; }
            @media print {
              body { margin: 10px; }
              @page { size: auto; margin: 15mm; }
            }
          </style>
        </head>
        <body>
          <h1>Sabewell Support - Complaints Report</h1>
          <div class="meta">Generated on: ${new Date().toLocaleString()} | Total complaints: ${items.length}</div>
          <table>
            <thead>
              <tr>
                <th>Complaint ID</th>
                <th>Customer</th>
                <th>Phone</th>
                <th>Date</th>
                <th>Status</th>
                <th>Warranty</th>
                <th>Product Serial</th>
              </tr>
            </thead>
            <tbody>
              ${htmlRows}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `;
    
    printWindow.document.write(htmlContent);
    printWindow.document.close();
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
      <Card className="p-5 mb-4 border-slate-200 shadow-sm">
        <form onSubmit={onSearchSubmit} className="space-y-4">
          {/* Row 1: Search */}
          <div className="flex gap-3 items-center">
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
            <Button type="submit" className="bg-black hover:bg-slate-800 text-white" data-testid="search-submit-btn">
              Search
            </Button>
          </div>

          {/* Row 2: Status & Date Filters */}
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
            {/* Status Filter */}
            <div className="flex items-center gap-2 w-full md:w-auto">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Status:</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-48 bg-white border-slate-300" data-testid="status-filter-select">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" data-testid="status-filter-all">All statuses</SelectItem>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s} data-testid={`status-filter-${s.toLowerCase().replace(" ", "-")}`}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date Filter */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto flex-1">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Date:</label>
                <Select value={dateFilterType} onValueChange={setDateFilterType}>
                  <SelectTrigger className="w-full sm:w-44 bg-white border-slate-300" data-testid="date-filter-select">
                    <SelectValue placeholder="Filter by date" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" data-testid="date-filter-all">All time</SelectItem>
                    <SelectItem value="this-month" data-testid="date-filter-this-month">This month</SelectItem>
                    <SelectItem value="last-month" data-testid="date-filter-last-month">Last month</SelectItem>
                    <SelectItem value="custom" data-testid="date-filter-custom">Custom date</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Custom Date Range Picker */}
              {dateFilterType === "custom" && (
                <div className="flex items-center gap-2 flex-1 sm:flex-none">
                  <Input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="bg-white border-slate-300 text-xs py-1 h-9 w-full sm:w-36"
                    data-testid="date-filter-start"
                  />
                  <span className="text-xs text-slate-400">to</span>
                  <Input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="bg-white border-slate-300 text-xs py-1 h-9 w-full sm:w-36"
                    data-testid="date-filter-end"
                  />
                </div>
              )}
            </div>
          </div>
        </form>
      </Card>

      {/* Count display */}
      <div className="flex justify-between items-center mb-3 px-1">
        <span className="text-sm font-semibold text-slate-700" data-testid="complaints-count">
          {loading ? (
            <span className="text-slate-400">Loading complaints...</span>
          ) : (
            <span>
              Total: {items.length} complaint{items.length === 1 ? "" : "s"} found
            </span>
          )}
        </span>
        {items.length > 0 && !loading && (
          <div className="flex gap-2">
            <Button
              onClick={downloadExcel}
              variant="outline"
              size="sm"
              className="text-xs border-slate-200 hover:border-slate-400 h-8 flex items-center gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
            <Button
              onClick={downloadPdf}
              variant="outline"
              size="sm"
              className="text-xs border-slate-200 hover:border-slate-400 h-8 flex items-center gap-1.5"
            >
              <Printer className="h-3.5 w-3.5" />
              Print / Save PDF
            </Button>
          </div>
        )}
      </div>

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
