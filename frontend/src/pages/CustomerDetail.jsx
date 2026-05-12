import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Save, Trash2, Pencil, X, ChevronRight, Phone } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { StatusPill, formatDate, formatDateTime } from "@/lib/complaint";

export default function CustomerDetail() {
  const { phone: rawPhone } = useParams();
  const phone = decodeURIComponent(rawPhone || "");
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const fetchOne = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/customers/${encodeURIComponent(phone)}`);
      setData(data);
      setForm({
        ...data.customer,
        new_phone: data.customer.phone,
      });
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Not found");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOne();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        address: form.address,
        village: form.village,
        city: form.city,
        district: form.district,
        state: form.state,
        pincode: form.pincode,
      };
      if (form.new_phone && form.new_phone !== phone) payload.phone = form.new_phone;
      const { data: updated } = await api.patch(`/customers/${encodeURIComponent(phone)}`, payload);
      toast.success("Customer updated");
      setEditing(false);
      if (updated.phone !== phone) {
        navigate(`/admin/customers/${encodeURIComponent(updated.phone)}`, { replace: true });
      } else {
        fetchOne();
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    return; // disabled — customer deletion is not allowed
  };

  const deleteComplaint = async (cid) => {
    if (!window.confirm(`Delete complaint ${cid}? This cannot be undone.`)) return;
    try {
      await api.delete(`/complaints/${cid}`);
      toast.success(`Complaint ${cid} deleted`);
      fetchOne();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Delete failed");
    }
  };

  if (loading) {
    return <AdminLayout title="Loading…"><div className="text-slate-500 text-sm">Fetching customer…</div></AdminLayout>;
  }
  if (!data) {
    return (
      <AdminLayout title="Not found">
        <Link to="/admin/customers"><Button variant="outline" className="border-slate-200 hover:border-slate-400"><ArrowLeft className="h-4 w-4 mr-1.5" /> Back</Button></Link>
      </AdminLayout>
    );
  }

  const c = data.customer;
  const location = [c.village, c.city, c.district, c.state, c.pincode].filter(Boolean).join(", ");

  return (
    <AdminLayout
      title={c.name}
      action={
        <div className="flex gap-2">
          <Link to="/admin/customers" data-testid="customer-back-link">
            <Button variant="outline" className="border-slate-200 hover:border-slate-400">
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
            </Button>
          </Link>
          {!editing && (
            <Button variant="outline" className="border-slate-200 hover:border-slate-400" onClick={() => setEditing(true)} data-testid="customer-edit-btn">
              <Pencil className="h-4 w-4 mr-1.5" /> Edit
            </Button>
          )}
        </div>
      }
    >
      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="p-6 border-slate-200 shadow-sm lg:col-span-1">
          <h2 className="font-heading text-lg font-semibold mb-4 flex items-center gap-2">
            <Phone className="h-4 w-4" /> Profile
          </h2>
          {!editing ? (
            <dl className="space-y-4 text-sm">
              <Row label="Phone" value={c.phone} mono />
              <Row label="Name" value={c.name} />
              <Row label="Street/Address" value={c.address} />
              <Row label="Village" value={c.village} />
              <Row label="City" value={c.city} />
              <Row label="District" value={c.district} />
              <Row label="State" value={c.state} />
              <Row label="Pincode" value={c.pincode} mono />
              <Row label="Updated" value={formatDateTime(c.updated_at)} />
            </dl>
          ) : (
            <div className="space-y-3 text-sm">
              <EditField label="Phone" value={form.new_phone} onChange={(v) => setForm({ ...form, new_phone: v })} mono testid="edit-phone" />
              <EditField label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} testid="edit-name" />
              <EditField label="Village" value={form.village} onChange={(v) => setForm({ ...form, village: v })} testid="edit-village" />
              <EditField label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} testid="edit-city" />
              <EditField label="District" value={form.district} onChange={(v) => setForm({ ...form, district: v })} testid="edit-district" />
              <EditField label="State" value={form.state} onChange={(v) => setForm({ ...form, state: v })} testid="edit-state" />
              <EditField label="Pincode" value={form.pincode} onChange={(v) => setForm({ ...form, pincode: v })} mono testid="edit-pincode" />
              <div className="space-y-1.5">
                <Label className="text-xs">Address</Label>
                <Textarea rows={2} value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} className="bg-white border-slate-300 focus-visible:ring-slate-900" data-testid="edit-address" />
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={save} disabled={saving} className="flex-1 bg-black hover:bg-slate-800 text-white" data-testid="edit-save-btn">
                  <Save className="h-4 w-4 mr-1.5" /> {saving ? "Saving…" : "Save"}
                </Button>
                <Button variant="outline" onClick={() => { setEditing(false); setForm({ ...c, new_phone: c.phone }); }} className="border-slate-200 hover:border-slate-400" data-testid="edit-cancel-btn">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>

        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6 border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-heading text-lg font-semibold">Complaint history</h2>
              <span className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">{data.complaints.length} total</span>
            </div>
            {data.complaints.length === 0 ? (
              <div className="text-sm text-slate-500 italic py-8 text-center">No complaints yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50">
                    <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-semibold">ID</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Date</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-semibold hidden md:table-cell">Serial</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Status</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.complaints.map((cp) => (
                    <TableRow key={cp.complaint_id} className="border-b border-slate-100 hover:bg-slate-50" data-testid={`history-row-${cp.complaint_id}`}>
                      <TableCell className="py-3 font-mono text-sm font-medium">
                        <Link to={`/admin/c/${cp.complaint_id}`} className="hover:underline">{cp.complaint_id}</Link>
                      </TableCell>
                      <TableCell className="py-3 text-sm text-slate-700">{formatDate(cp.date)}</TableCell>
                      <TableCell className="py-3 text-sm text-slate-700 hidden md:table-cell font-mono">{cp.product_serial}</TableCell>
                      <TableCell className="py-3"><StatusPill status={cp.status} /></TableCell>
                      <TableCell className="py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => deleteComplaint(cp.complaint_id)}
                            className="p-1 rounded-md text-red-600 hover:bg-red-50 transition-colors"
                            title="Delete complaint"
                            data-testid={`history-delete-${cp.complaint_id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                          <Link to={`/admin/c/${cp.complaint_id}`}>
                            <ChevronRight className="h-4 w-4 text-slate-400 hover:text-slate-900 inline" />
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}

function Row({ label, value, mono }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold">{label}</div>
      <div className={`mt-0.5 text-slate-900 ${mono ? "font-mono" : ""}`}>{value || <span className="text-slate-400">—</span>}</div>
    </div>
  );
}

function EditField({ label, value, onChange, mono, testid }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className={`bg-white border-slate-300 focus-visible:ring-slate-900 ${mono ? "font-mono" : ""}`}
        data-testid={testid}
      />
    </div>
  );
}
