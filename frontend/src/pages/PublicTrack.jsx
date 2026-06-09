import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, ClipboardList, CheckCircle2, Loader2, Clock, MessageCircle, Camera } from "lucide-react";
import { StatusPill, formatDateTime, formatDate } from "@/lib/complaint";
import Logo from "@/components/Logo";
import PhotoGallery from "@/components/PhotoGallery";
import api from "@/lib/api";
import DemoToggle from "@/components/DemoToggle";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STEPS = ["Pending", "In Progress", "Resolved"];

function StepIcon({ status, active, done }) {
  const Icon = status === "Pending" ? Clock : status === "In Progress" ? Loader2 : CheckCircle2;
  return (
    <div
      className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
        done
          ? "bg-emerald-50 border-emerald-500 text-emerald-700"
          : active
          ? "bg-slate-900 border-slate-900 text-white"
          : "bg-white border-slate-300 text-slate-400"
      }`}
    >
      <Icon className="h-5 w-5" />
    </div>
  );
}

export default function PublicTrack() {
  const { cid } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/track/${encodeURIComponent(cid)}`);
        if (!cancelled) setData(res.data);
      } catch (err) {
        if (!cancelled) setError(err?.response?.data?.detail || "Complaint not found");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [cid]);

  const currentIdx = data ? STEPS.indexOf(data.status) : -1;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 md:px-12 py-4 flex items-center justify-between">
          <Logo to="/" size="md" testid="track-brand-logo" />
          <div className="flex items-center gap-3">
            <DemoToggle />
            <Link to="/track" className="text-sm text-slate-600 hover:text-slate-900" data-testid="track-other-link">
              <ArrowLeft className="h-4 w-4 inline mr-1" /> Track another
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 md:px-12 py-10 md:py-14">
        {loading ? (
          <div className="text-slate-500 text-sm">Loading...</div>
        ) : error ? (
          <Card className="p-8 border-slate-200 shadow-sm text-center" data-testid="track-error">
            <div className="text-2xl font-heading font-bold tracking-tight">Complaint not found</div>
            <p className="text-slate-600 mt-2">We couldn't find a complaint with ID <span className="font-mono">{cid}</span>.</p>
            <Link to="/track" className="inline-block mt-4">
              <Button className="bg-black hover:bg-slate-800 text-white">Try again</Button>
            </Link>
          </Card>
        ) : (
          <div className="space-y-6 animate-fade-up">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">Complaint</div>
                <div className="font-heading text-3xl sm:text-4xl font-bold tracking-tight font-mono mt-1" data-testid="track-cid">
                  {data.complaint_id}
                </div>
                <div className="text-sm text-slate-600 mt-2">Registered on {formatDate(data.date)}</div>
              </div>
              <div className="flex flex-col items-start sm:items-end gap-2">
                <StatusPill status={data.status} testid="track-status" />
                <div className="text-xs text-slate-500">Last update {formatDateTime(data.updated_at)}</div>
              </div>
            </div>

            {/* Stepper */}
            <Card className="p-6 sm:p-8 border-slate-200 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                {STEPS.map((s, idx) => {
                  const done = idx < currentIdx || (currentIdx === STEPS.length - 1 && idx === currentIdx);
                  const active = idx === currentIdx;
                  return (
                    <React.Fragment key={s}>
                      <div className="flex flex-col items-center gap-2 flex-shrink-0">
                        <StepIcon status={s} active={active} done={done} />
                        <div className={`text-xs uppercase tracking-wider font-semibold text-center ${active ? "text-slate-900" : done ? "text-emerald-700" : "text-slate-400"}`}>
                          {s}
                        </div>
                      </div>
                      {idx < STEPS.length - 1 && (
                        <div className={`flex-1 h-0.5 ${idx < currentIdx ? "bg-emerald-500" : "bg-slate-200"}`} />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </Card>

            <div className="grid md:grid-cols-3 gap-6">
              <Card className="p-6 border-slate-200 shadow-sm md:col-span-2">
                <h2 className="font-heading text-lg font-semibold">Details</h2>
                <dl className="mt-4 grid sm:grid-cols-2 gap-4 text-sm">
                  <Field label="Name" value={data.name} />
                  <Field label="Phone" value={data.phone_masked} mono />
                  <Field label="Product serial" value={data.product_serial} mono />
                  <Field label="Date" value={formatDate(data.date)} />
                  <div className="sm:col-span-2">
                    <Field label="Issue" value={data.issue_description} multiline />
                  </div>
                </dl>

                {(data.photos || []).length > 0 && (
                  <div className="mt-6 pt-6 border-t border-slate-100">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold flex items-center gap-2 mb-3">
                      <Camera className="h-3 w-3" /> Damage photos
                    </div>
                    <PhotoGallery
                      complaintId={data.complaint_id}
                      photos={data.photos}
                      editable={false}
                      publicMode={true}
                    />
                  </div>
                )}
              </Card>

              <Card className="p-6 border-slate-200 shadow-sm">
                <h2 className="font-heading text-lg font-semibold flex items-center gap-2">
                  <MessageCircle className="h-4 w-4" /> Updates
                </h2>
                <ol className="relative border-l border-slate-200 ml-3 space-y-4 mt-4" data-testid="track-timeline">
                  {[...data.status_history].reverse().map((h, idx) => (
                    <li key={idx} className="ml-5">
                      <span className="absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full bg-white border-2 border-slate-900" />
                      <StatusPill status={h.status} />
                      <div className="text-xs text-slate-500 mt-1">{formatDateTime(h.at)}</div>
                      {h.note && <p className="text-sm text-slate-700 mt-1">{h.note}</p>}
                    </li>
                  ))}
                </ol>
              </Card>
            </div>

            <p className="text-xs text-slate-500 text-center pt-4">
              You'll receive WhatsApp updates from {data.brand} as your complaint progresses.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function Field({ label, value, mono, multiline }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold">{label}</div>
      <div className={`mt-1.5 text-slate-900 ${mono ? "font-mono" : ""} ${multiline ? "whitespace-pre-wrap" : ""}`}>
        {value}
      </div>
    </div>
  );
}
