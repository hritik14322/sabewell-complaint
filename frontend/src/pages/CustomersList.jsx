import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, ChevronRight, Users } from "lucide-react";
import api from "@/lib/api";
import { formatDateTime } from "@/lib/complaint";

export default function CustomersList() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchAll = async (query = "") => {
    setLoading(true);
    try {
      const { data } = await api.get("/customers", { params: query ? { q: query } : {} });
      setItems(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => fetchAll(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <AdminLayout title="Customers">
      <Card className="p-4 mb-4 border-slate-200 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, phone, village, city, district, state, pincode…"
            className="pl-9 bg-white border-slate-300 focus-visible:ring-slate-900"
            data-testid="customer-search-input"
          />
        </div>
      </Card>

      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50">
              <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Phone</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Name</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-semibold hidden md:table-cell">Location</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-semibold hidden lg:table-cell">Last update</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Complaints</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody data-testid="customers-table-body">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i} className="border-b border-slate-100 hover:bg-transparent">
                  <TableCell className="py-4"><div className="h-5 w-32 bg-slate-100 animate-pulse rounded" /></TableCell>
                  <TableCell className="py-4"><div className="h-5 w-24 bg-slate-100 animate-pulse rounded" /></TableCell>
                  <TableCell className="py-4 hidden md:table-cell"><div className="h-5 w-56 bg-slate-100 animate-pulse rounded" /></TableCell>
                  <TableCell className="py-4 hidden lg:table-cell"><div className="h-5 w-32 bg-slate-100 animate-pulse rounded" /></TableCell>
                  <TableCell className="py-4"><div className="h-6 w-8 bg-slate-100 animate-pulse rounded-full" /></TableCell>
                  <TableCell className="py-4 text-right"><div className="h-4 w-4 bg-slate-100 animate-pulse rounded ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-16 text-center">
                  <Users className="h-8 w-8 text-slate-300 mx-auto mb-3" />
                  <div className="text-slate-500 text-sm">No customers found.</div>
                  <p className="text-xs text-slate-400 mt-1">Customer profiles are created automatically when you register the first complaint with a new phone number.</p>
                </TableCell>
              </TableRow>
            ) : (
              items.map((c) => {
                const loc = [c.village, c.city, c.district, c.state, c.pincode].filter(Boolean).join(", ");
                return (
                  <TableRow key={c.phone} className="border-b border-slate-100 hover:bg-slate-50" data-testid={`customer-row-${c.phone}`}>
                    <TableCell className="py-4 font-mono text-sm font-medium text-slate-900">
                      <Link to={`/admin/customers/${encodeURIComponent(c.phone)}`} className="hover:underline">{c.phone}</Link>
                    </TableCell>
                    <TableCell className="py-4 text-sm font-medium text-slate-900">{c.name}</TableCell>
                    <TableCell className="py-4 text-sm text-slate-700 hidden md:table-cell">
                      <span className="line-clamp-1">{loc || <span className="text-slate-400">—</span>}</span>
                    </TableCell>
                    <TableCell className="py-4 text-sm text-slate-700 hidden lg:table-cell">{formatDateTime(c.updated_at)}</TableCell>
                    <TableCell className="py-4 text-sm">
                      <span className="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full bg-slate-900 text-white text-xs font-bold">
                        {c.complaint_count}
                      </span>
                    </TableCell>
                    <TableCell className="py-4 text-right">
                      <Link to={`/admin/customers/${encodeURIComponent(c.phone)}`}>
                        <ChevronRight className="h-4 w-4 text-slate-400 hover:text-slate-900 inline" />
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </AdminLayout>
  );
}
