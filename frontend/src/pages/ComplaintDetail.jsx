import React, { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Link as LinkIcon, MessageCircle, Copy, Camera, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { StatusPill, STATUSES, WARRANTIES, WarrantyPill, formatDateTime } from "@/lib/complaint";
import PhotoGallery from "@/components/PhotoGallery";

export default function ComplaintDetail() {
  const { cid } = useParams();
  const navigate = useNavigate();
  const [c, setC] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newStatus, setNewStatus] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchOne = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/complaints/${cid}`);
      setC(data);
      setNewStatus(data.status);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Not found");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOne();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid]);

  const updateStatus = async () => {
    if (!c) return;
    if (newStatus === c.status) {
      toast.error("Status is unchanged");
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.patch(`/complaints/${cid}/status`, {
        status: newStatus,
        note: note || null,
      });
      setC(data);
      setNote("");
      const sms = data.sms_status || { ok: false, message: "" };
      const wa = data.whatsapp_status || { ok: false, message: "" };
      if (sms.ok && wa.ok) {
        toast.success(`Status set to ${data.status}. SMS + WhatsApp sent.`);
      } else if (sms.ok) {
        toast.success(`Status set to ${data.status}. SMS sent.`);
        if (wa.message && wa.message !== "Fast2SMS not configured") {
          toast.error(`WhatsApp failed: ${wa.message}`);
        }
      } else if (wa.ok) {
        toast.success(`Status set to ${data.status}. WhatsApp sent.`);
        toast.error(`SMS failed: ${sms.message || "see logs"}`);
      } else {
        toast.error(`Status updated, but SMS failed: ${sms.message || "see logs"}`);
        if (wa.message && wa.message !== "Fast2SMS not configured") {
          toast.error(`WhatsApp failed: ${wa.message}`);
        }
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to update status");
    } finally {
      setSaving(false);
    }
  };

  const trackUrl = `${window.location.origin}/track/${cid}`;
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(trackUrl);
      toast.success("Tracking link copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  const deleteComplaint = async () => {
    if (!window.confirm(`Delete complaint ${cid}? This cannot be undone.`)) return;
    try {
      await api.delete(`/complaints/${cid}`);
      toast.success(`Complaint ${cid} deleted`);
      navigate("/admin", { replace: true });
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Delete failed");
    }
  };

  const updateWarranty = async (newW) => {
    if (!c || newW === c.warranty) return;
    try {
      const { data } = await api.patch(`/complaints/${cid}/warranty`, { warranty: newW });
      setC(data);
      toast.success(`Warranty set to ${newW}`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to update warranty");
    }
  };

  if (loading) {
    return (
      <AdminLayout title="Loading...">
        <div className="text-slate-500 text-sm">Fetching complaint...</div>
      </AdminLayout>
    );
  }

  if (!c) {
    return (
      <AdminLayout title="Not found">
        <Link to="/admin">
          <Button variant="outline" className="border-slate-200 hover:border-slate-400">
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to dashboard
          </Button>
        </Link>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title={c.complaint_id}
      action={
        <div className="flex gap-2">
          <Link to="/admin" data-testid="detail-back">
            <Button variant="outline" className="border-slate-200 hover:border-slate-400">
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
            </Button>
          </Link>
          <Button
            variant="outline"
            className="border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
            onClick={deleteComplaint}
            data-testid="detail-delete-complaint-btn"
          >
            <Trash2 className="h-4 w-4 mr-1.5" /> Delete
          </Button>
        </div>
      }
    >
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6 border-slate-200 shadow-sm">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex gap-6 flex-wrap">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">Status</div>
                  <div className="mt-2"><StatusPill status={c.status} testid="detail-current-status" /></div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">Warranty</div>
                  <div className="mt-2 flex items-center gap-2">
                    <WarrantyPill warranty={c.warranty} testid="detail-current-warranty" />
                    <Select value={c.warranty} onValueChange={updateWarranty}>
                      <SelectTrigger className="h-7 px-2 text-xs bg-white border-slate-300 w-auto" data-testid="detail-warranty-select">
                        <SelectValue placeholder="Change" />
                      </SelectTrigger>
                      <SelectContent>
                        {WARRANTIES.map((w) => (
                          <SelectItem key={w} value={w} data-testid={`detail-warranty-option-${w.toLowerCase()}`}>{w}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <div className="text-sm text-slate-500">
                <div>Created {formatDateTime(c.created_at)}</div>
                <div>Updated {formatDateTime(c.updated_at)}</div>
              </div>
            </div>
          </Card>

          <Card className="p-6 border-slate-200 shadow-sm">
            <h2 className="font-heading text-lg font-semibold mb-4">Customer</h2>
            <dl className="grid sm:grid-cols-2 gap-4 text-sm">
              <Field label="Name" value={c.name} testid="detail-name" />
              <Field label="Phone" value={c.phone} testid="detail-phone" mono />
              <Field label="Date" value={c.date} testid="detail-date" />
              <Field label="Pincode" value={c.pincode || "—"} testid="detail-pincode" mono />
              <Field label="Village" value={c.village || "—"} testid="detail-village" />
              <Field label="City" value={c.city || "—"} testid="detail-city" />
              <Field label="District" value={c.district || "—"} testid="detail-district" />
              <Field label="State" value={c.state || "—"} testid="detail-state" />
              <div className="sm:col-span-2">
                <Field label="Street/Address" value={c.address} testid="detail-address" />
              </div>
            </dl>
            <div className="mt-3 pt-3 border-t border-slate-100">
              <Link to={`/admin/customers/${encodeURIComponent(c.phone)}`} className="text-xs text-slate-600 hover:text-slate-900 underline" data-testid="view-customer-profile-link">
                View full customer profile →
              </Link>
            </div>
          </Card>

          <Card className="p-6 border-slate-200 shadow-sm">
            <h2 className="font-heading text-lg font-semibold mb-4">Complaint</h2>
            <dl className="grid sm:grid-cols-2 gap-4 text-sm">
              <Field label="Invoice number" value={c.invoice_number || "—"} testid="detail-invoice" mono />
              <Field label="Product serial" value={c.product_serial} testid="detail-serial" mono />
              <div className="sm:col-span-2">
                <Field label="Product details" value={c.product_details || "—"} testid="detail-product" />
              </div>
              <div className="sm:col-span-2">
                <Field label="Issue description" value={c.issue_description} testid="detail-issue" multiline />
              </div>
            </dl>
          </Card>

          <Card className="p-6 border-slate-200 shadow-sm">
            <h2 className="font-heading text-lg font-semibold mb-4 flex items-center gap-2">
              <Camera className="h-4 w-4" /> Product damage photos
            </h2>
            <PhotoGallery
              complaintId={c.complaint_id}
              photos={c.photos || []}
              editable={true}
              publicMode={false}
              onChange={(updated) => setC({ ...c, photos: updated })}
            />
          </Card>

          <Card className="p-6 border-slate-200 shadow-sm">
            <h2 className="font-heading text-lg font-semibold mb-4">Timeline</h2>
            <ol className="relative border-l border-slate-200 ml-3 space-y-6">
              {[...c.status_history].reverse().map((h, idx) => (
                <li key={idx} className="ml-6">
                  <span className="absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full bg-white border-2 border-slate-900" />
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusPill status={h.status} />
                    <span className="text-xs text-slate-500">{formatDateTime(h.at)}</span>
                  </div>
                  {h.note && <p className="text-sm text-slate-700 mt-1.5">{h.note}</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6 border-slate-200 shadow-sm">
            <h2 className="font-heading text-lg font-semibold">Update status</h2>
            <p className="text-sm text-slate-600 mt-1">An SMS will be sent to the customer.</p>
            <div className="mt-4 space-y-3">
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger className="bg-white border-slate-300" data-testid="status-select">
                  <SelectValue placeholder="Choose status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s} data-testid={`status-option-${s.toLowerCase().replace(" ", "-")}`}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Add an internal note (optional, sent to customer too)"
                className="bg-white border-slate-300 focus-visible:ring-slate-900"
                data-testid="status-note-input"
              />
              <Button
                onClick={updateStatus}
                disabled={saving || newStatus === c.status}
                className="w-full bg-black hover:bg-slate-800 text-white"
                data-testid="status-update-btn"
              >
                <MessageCircle className="h-4 w-4 mr-1.5" />
                {saving ? "Updating..." : "Update & notify"}
              </Button>
            </div>
          </Card>

          <Card className="p-6 border-slate-200 shadow-sm">
            <h2 className="font-heading text-lg font-semibold flex items-center gap-2">
              <LinkIcon className="h-4 w-4" /> Tracking link
            </h2>
            <p className="text-sm text-slate-600 mt-1">Share this link with the customer.</p>
            <div className="mt-3 flex gap-2">
              <input
                readOnly
                value={trackUrl}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs font-mono text-slate-700 outline-none"
                data-testid="tracking-link-input"
              />
              <Button onClick={copyLink} variant="outline" size="sm" className="border-slate-200 hover:border-slate-400" data-testid="copy-tracking-link-btn">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <Link
              to={`/track/${c.complaint_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-slate-600 hover:text-slate-900 underline mt-3 inline-block"
              data-testid="open-tracking-link"
            >
              Open public tracking page →
            </Link>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}

function Field({ label, value, mono, multiline, testid }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold">{label}</div>
      <div
        data-testid={testid}
        className={`mt-1.5 text-slate-900 ${mono ? "font-mono" : ""} ${multiline ? "whitespace-pre-wrap" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
