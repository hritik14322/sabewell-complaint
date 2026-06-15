import React, { useEffect, useRef, useState } from "react";
import { ImagePlus, X, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import api from "@/lib/api";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";
const API_BASE = `${BACKEND_URL}/api`;

const MAX_PHOTOS = 5;
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

/**
 * PhotoGallery — used by admin (editable) and public (read-only).
 *
 * Props:
 *   complaintId: string
 *   photos: array of {id, original_filename, content_type, ...}
 *   editable: boolean — when true, shows upload + delete controls (admin)
 *   onChange: callback(photos) when photos array changes
 *   publicMode: boolean — when true, uses /api/track/{cid}/photos/{id}; else uses authed /api/complaints/{cid}/photos/{id}
 */
export default function PhotoGallery({ complaintId, photos = [], editable = false, onChange, publicMode = false }) {
  const [uploading, setUploading] = useState(false);
  const [previewUrls, setPreviewUrls] = useState({}); // {photoId: blobUrl}
  const [previewing, setPreviewing] = useState(null); // photoId for lightbox
  const fileInputRef = useRef(null);

  const buildUrl = (photoId) => {
    if (publicMode) {
      return `${API_BASE}/track/${complaintId}/photos/${photoId}`;
    }
    // admin: need auth header, fetched as blob
    return null;
  };

  // For admin (auth required) — fetch each photo as blob
  useEffect(() => {
    if (publicMode) return;
    const fetchBlobs = async () => {
      const next = { ...previewUrls };
      for (const p of photos) {
        if (next[p.id]) continue;
        try {
          const res = await api.get(`/complaints/${complaintId}/photos/${p.id}`, { responseType: "blob" });
          next[p.id] = URL.createObjectURL(res.data);
        } catch (e) {
          // silent
        }
      }
      setPreviewUrls(next);
    };
    fetchBlobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos.map((p) => p.id).join(","), publicMode, complaintId]);

  useEffect(() => {
    return () => {
      Object.values(previewUrls).forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getSrc = (p) => (publicMode ? buildUrl(p.id) : previewUrls[p.id]);

  const handleFile = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (photos.length + files.length > MAX_PHOTOS) {
      toast.error(`Max ${MAX_PHOTOS} photos per complaint`);
      e.target.value = "";
      return;
    }
    setUploading(true);
    const updated = [...photos];
    for (const f of files) {
      if (!ALLOWED.includes(f.type)) {
        toast.error(`${f.name}: only JPG/PNG/WebP`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        toast.error(`${f.name}: exceeds 5MB`);
        continue;
      }
      try {
        const fd = new FormData();
        fd.append("file", f);
        const { data } = await api.post(`/complaints/${complaintId}/photos`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        updated.push(data);
        toast.success(`Uploaded ${f.name}`);
      } catch (err) {
        toast.error(err?.response?.data?.detail || `Failed to upload ${f.name}`);
      }
    }
    setUploading(false);
    onChange && onChange(updated);
    e.target.value = "";
  };

  const handleDelete = async (photoId) => {
    if (!window.confirm("Delete this photo?")) return;
    try {
      await api.delete(`/complaints/${complaintId}/photos/${photoId}`);
      const updated = photos.filter((p) => p.id !== photoId);
      onChange && onChange(updated);
      if (previewUrls[photoId]) {
        URL.revokeObjectURL(previewUrls[photoId]);
        const next = { ...previewUrls };
        delete next[photoId];
        setPreviewUrls(next);
      }
      toast.success("Photo deleted");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Delete failed");
    }
  };

  return (
    <div data-testid="photo-gallery">
      {photos.length === 0 && !editable && (
        <div className="text-sm text-slate-500 italic">No photos attached.</div>
      )}

      {(photos.length > 0 || editable) && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {photos.map((p) => {
            const src = getSrc(p);
            return (
              <div
                key={p.id}
                className="relative group aspect-square rounded-md border border-slate-200 bg-slate-50 overflow-hidden"
                data-testid={`photo-${p.id}`}
              >
                {src ? (
                  <img
                    src={src}
                    alt={p.original_filename || "complaint photo"}
                    className="w-full h-full object-cover cursor-pointer"
                    onClick={() => setPreviewing(p.id)}
                    draggable={false}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-400">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                )}
                {editable && (
                  <button
                    type="button"
                    onClick={() => handleDelete(p.id)}
                    className="absolute top-1.5 right-1.5 bg-white/95 hover:bg-red-50 text-red-600 border border-slate-200 rounded-md p-1 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                    data-testid={`delete-photo-${p.id}`}
                    title="Delete photo"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}

          {editable && photos.length < MAX_PHOTOS && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="aspect-square rounded-md border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 hover:border-slate-400 transition-colors flex flex-col items-center justify-center gap-1.5 text-slate-500 hover:text-slate-700"
              data-testid="upload-photo-btn"
            >
              {uploading ? (
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
      )}

      {editable && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={handleFile}
          data-testid="photo-file-input"
        />
      )}

      {editable && (
        <p className="text-xs text-slate-500 mt-2">
          JPG/PNG/WebP, up to 5MB each. {photos.length}/{MAX_PHOTOS} uploaded.
        </p>
      )}

      {/* Lightbox preview */}
      {previewing && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setPreviewing(null)}
          data-testid="photo-lightbox"
        >
          <button
            type="button"
            className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white rounded-full p-2 transition-colors"
            onClick={() => setPreviewing(null)}
            data-testid="close-lightbox-btn"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={getSrc({ id: previewing })}
            alt="preview"
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-md"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
