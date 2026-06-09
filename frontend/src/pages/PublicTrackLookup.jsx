import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Search, ArrowLeft, ClipboardList } from "lucide-react";
import Logo from "@/components/Logo";
import DemoToggle from "@/components/DemoToggle";

export default function PublicTrackLookup() {
  const navigate = useNavigate();
  const [cid, setCid] = useState("");

  const submit = (e) => {
    e.preventDefault();
    const v = cid.trim();
    if (!v) return;
    navigate(`/track/${encodeURIComponent(v)}`);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-4 flex items-center justify-between">
          <Logo to="/" size="md" testid="lookup-brand-logo" />
          <div className="flex items-center gap-3">
            <DemoToggle />
            <Link to="/" className="text-sm text-slate-600 hover:text-slate-900" data-testid="lookup-back-link">
              <ArrowLeft className="h-4 w-4 inline mr-1" /> Back
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 md:px-12 py-16">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white border border-slate-200 rounded-full text-xs font-semibold uppercase tracking-[0.2em] text-slate-600 mb-6">
            Public tracking
          </div>
          <h1 className="font-heading text-4xl sm:text-5xl font-bold tracking-tight">Track your complaint</h1>
          <p className="mt-3 text-slate-600">Enter the Complaint ID you received from sabewell.</p>
        </div>

        <Card className="p-6 sm:p-8 border-slate-200 shadow-sm">
          <form onSubmit={submit} className="flex flex-col sm:flex-row gap-3">
            <Input
              value={cid}
              onChange={(e) => setCid(e.target.value)}
              placeholder="520260001"
              className="flex-1 bg-white border-slate-300 focus-visible:ring-slate-900 font-mono"
              data-testid="lookup-cid-input"
            />
            <Button type="submit" className="bg-black hover:bg-slate-800 text-white" data-testid="lookup-submit-btn">
              <Search className="h-4 w-4 mr-1.5" /> Track
            </Button>
          </form>
          <p className="text-xs text-slate-500 mt-3">
            Tip: the ID looks like <span className="font-mono">MYYYYNNNN</span> and was sent to you via WhatsApp.
          </p>
        </Card>
      </main>
    </div>
  );
}
