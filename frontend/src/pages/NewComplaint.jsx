import React, { useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Camera, ImagePlus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

const todayISO = () => new Date().toISOString().slice(0, 10);
const MAX_PHOTOS = 5;
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

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
  const [photos, setPhotos] = useState([]); // [{file, previewUrl, id}]
  const fileInputRef = useRef(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const addPhotos = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (photos.length + files.length > MAX_PHOTOS) {
      toast.error(`Max ${MAX_PHOTOS} photos`);
      e.target.value = "";
      return;
    }
    const next = [...photos];
    for (const f of files) {
      if (!ALLOWED.includes(f.type)) {
        toast.error(`${f.name}: only JPG/PNG/WebP`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        toast.error(`${f.name}: exceeds 5MB`);
        continue;
      }
      next.push({ file: f, previewUrl: URL.createObjectURL(f), id: `${Date.now()}-${f.name}` });
    }
    setPhotos(next);
    e.target.value = "";
  };

  const removePhoto = (id) => {
    setPhotos((prev) => {
      const found = prev.find((p) => p.id === id);
      if (found) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.phone || !form.product_serial || !form.issue_description || !form.address) {
      toast.error("Please fill all fields");
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post("/complaints", form);
      const cid = data.complaint_id;

      // Upload staged photos sequentially
      if (photos.length > 0) {
        let uploaded = 0;
        for (const p of photos) {
          try {
            const fd = new FormData();
            fd.append("file", p.file);
            await api.post(`/complaints/${cid}/photos`, fd, {
              headers: { "Content-Type": "multipart/form-data" },
            });
            uploaded += 1;
          } catch (err) {
            toast.error(err?.response?.data?.detail || `Failed to upload ${p.file.name}`);
          }
        }
        if (uploaded > 0) {
          toast.success(`Complaint ${cid} created with ${uploaded} photo${uploaded > 1 ? "s" : ""}`);
        } else {
          toast.success(`Complaint ${cid} created (photo upload failed)`);
        }
      } else {
        toast.success(`Complaint ${cid} created`);
      }
      photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      navigate(`/admin/c/${cid}`);
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

          <Card className="p-6 border-slate-200 shadow-sm">
            <h2 className="font-heading text-lg font-semibold mb-4 flex items-center gap-2">
              <Camera className="h-4 w-4" /> Product damage photos
              <span className="text-xs font-normal text-slate-500 ml-1">(optional)</span>
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {photos.map((p) => (
                <div
                  key={p.id}
                  className="relative group aspect-square rounded-md border border-slate-200 bg-slate-50 overflow-hidden"
                  data-testid={`staged-photo-${p.id}`}
                >
                  <img
                    src={p.previewUrl}
                    alt={p.file.name}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(p.id)}
                    className="absolute top-1.5 right-1.5 bg-white/95 hover:bg-red-50 text-red-600 border border-slate-200 rounded-md p-1 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                    data-testid={`remove-staged-${p.id}`}
                    title="Remove"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}

              {photos.length < MAX_PHOTOS && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={saving}
                  className="aspect-square rounded-md border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 hover:border-slate-400 transition-colors flex flex-col items-center justify-center gap-1.5 text-slate-500 hover:text-slate-700"
                  data-testid="form-add-photo-btn"
                >
                  {saving ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <ImagePlus className="h-5 w-5" />
                      <span className="text-xs font-medium">Add photo</span>
                    </>
                  )}
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={addPhotos}
              data-testid="form-photo-file-input"
            />
            <p className="text-xs text-slate-500 mt-3">
              Attach product damage photos. JPG/PNG/WebP, up to 5MB each. {photos.length}/{MAX_PHOTOS} selected.
            </p>
          </Card>
        </div>

        <div>
          <Card className="p-6 border-slate-200 shadow-sm sticky top-24">
            <h2 className="font-heading text-lg font-semibold">Summary</h2>
            <p className="text-sm text-slate-600 mt-2">
              On submit:
            </p>
            <ul className="text-sm text-slate-600 mt-2 space-y-1 list-disc list-inside">
              <li>A unique Complaint ID (e.g., <span className="font-mono">{new Date().getMonth() + 1}{new Date().getFullYear()}0001</span>) is generated.</li>
              <li>Initial status is set to <span className="status-pending px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider">Pending</span>.</li>
              <li>WhatsApp confirmation is sent to the customer with a tracking link.</li>
              {photos.length > 0 && (
                <li>{photos.length} photo{photos.length > 1 ? "s" : ""} will be attached to the complaint.</li>
              )}
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
