import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function NewComplaint() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    address: "",
    phone: "",
    product_serial: "",
    issue_description: "",
    date: todayISO(),
  });
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.phone || !form.product_serial || !form.issue_description || !form.address) {
      toast.error("Please fill all fields");
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post("/complaints", form);
      toast.success(`Complaint ${data.complaint_id} created`);
      navigate(`/admin/c/${data.complaint_id}`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to create complaint");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout
      title="Register complaint"
      action={
        <Link to="/admin" data-testid="back-to-dashboard">
          <Button variant="outline" className="border-slate-200 hover:border-slate-400">
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
          </Button>
        </Link>
      }
    >
      <p className="text-sm text-slate-600 -mt-4 mb-8 max-w-2xl">
        Fill in the details below. A Complaint ID will be auto-generated and the customer will receive a WhatsApp confirmation with a tracking link.
      </p>

      <form onSubmit={submit} className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6 border-slate-200 shadow-sm">
            <h2 className="font-heading text-lg font-semibold mb-4">Customer details</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" value={form.name} onChange={set("name")} required className="bg-white border-slate-300 focus-visible:ring-slate-900" data-testid="form-name-input" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone (with country code)</Label>
                <Input id="phone" value={form.phone} onChange={set("phone")} placeholder="+15551234567" required className="bg-white border-slate-300 focus-visible:ring-slate-900" data-testid="form-phone-input" />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="address">Address</Label>
                <Textarea id="address" rows={2} value={form.address} onChange={set("address")} required className="bg-white border-slate-300 focus-visible:ring-slate-900" data-testid="form-address-input" />
              </div>
            </div>
          </Card>

          <Card className="p-6 border-slate-200 shadow-sm">
            <h2 className="font-heading text-lg font-semibold mb-4">Issue details</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="serial">Product serial number</Label>
                <Input id="serial" value={form.product_serial} onChange={set("product_serial")} required className="bg-white border-slate-300 focus-visible:ring-slate-900 font-mono" data-testid="form-serial-input" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="date">Date</Label>
                <Input id="date" type="date" value={form.date} onChange={set("date")} className="bg-white border-slate-300 focus-visible:ring-slate-900" data-testid="form-date-input" />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="issue">Issue description</Label>
                <Textarea id="issue" rows={5} value={form.issue_description} onChange={set("issue_description")} required placeholder="Describe the issue the customer is facing..." className="bg-white border-slate-300 focus-visible:ring-slate-900" data-testid="form-issue-input" />
              </div>
            </div>
          </Card>
        </div>

        <div>
          <Card className="p-6 border-slate-200 shadow-sm sticky top-24">
            <h2 className="font-heading text-lg font-semibold">Summary</h2>
            <p className="text-sm text-slate-600 mt-2">
              On submit:
            </p>
            <ul className="text-sm text-slate-600 mt-2 space-y-1 list-disc list-inside">
              <li>A unique Complaint ID (e.g., <span className="font-mono">CMP-{new Date().getFullYear()}-0001</span>) is generated.</li>
              <li>Initial status is set to <span className="status-pending px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider">Pending</span>.</li>
              <li>WhatsApp confirmation is sent to the customer with a tracking link.</li>
            </ul>
            <div className="mt-6 space-y-2">
              <Button
                type="submit"
                disabled={saving}
                className="w-full bg-black hover:bg-slate-800 text-white"
                data-testid="form-submit-btn"
              >
                {saving ? "Submitting..." : "Register complaint"}
              </Button>
              <Link to="/admin" className="block">
                <Button type="button" variant="outline" className="w-full border-slate-200 hover:border-slate-400" data-testid="form-cancel-btn">
                  Cancel
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </form>
    </AdminLayout>
  );
}
