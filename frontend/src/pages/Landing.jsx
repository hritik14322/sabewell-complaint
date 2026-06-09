import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowRight, ShieldCheck, MessageCircle, Search } from "lucide-react";
import Logo from "@/components/Logo";
import DemoToggle from "@/components/DemoToggle";

export default function Landing() {
  const navigate = useNavigate();
  const [cid, setCid] = React.useState("");

  const onTrack = (e) => {
    e.preventDefault();
    const v = cid.trim();
    if (!v) return;
    navigate(`/track/${encodeURIComponent(v)}`);
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-5 flex items-center justify-between">
          <Logo to="/" size="md" testid="landing-brand-logo" />
          <div className="flex items-center gap-3">
            <DemoToggle />
            <Link to="/track" data-testid="header-track-link" className="text-sm text-slate-600 hover:text-slate-900 transition-colors">Track complaint</Link>
            <Link to="/login" data-testid="header-admin-login-link">
              <Button variant="outline" className="border-slate-200 hover:border-slate-400" size="sm">Admin login</Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-grid pointer-events-none" />
        <div className="relative max-w-7xl mx-auto px-6 md:px-12 py-16 md:py-24 grid lg:grid-cols-2 gap-12 items-center">
          <div className="animate-fade-up">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-100 border border-slate-200 rounded-full text-xs font-semibold uppercase tracking-[0.2em] text-slate-600 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Complaints & support
            </div>
            <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05]">
              Track every complaint.<br />
              <span className="text-slate-500">Update every buyer.</span>
            </h1>
            <p className="mt-6 text-base sm:text-lg text-slate-600 max-w-xl">
              A focused workspace for the sabewell team to log customer issues, move them through pending → in-progress → resolved, and push WhatsApp updates the moment status changes.
            </p>

            <form onSubmit={onTrack} className="mt-8 flex gap-2 max-w-md">
              <Input
                value={cid}
                onChange={(e) => setCid(e.target.value)}
                placeholder="Enter Complaint ID e.g. 520260001"
                className="bg-white border-slate-300 focus-visible:ring-slate-900"
                data-testid="landing-track-input"
              />
              <Button type="submit" className="bg-black hover:bg-slate-800 text-white" data-testid="landing-track-btn">
                <Search className="h-4 w-4 mr-1.5" /> Track
              </Button>
            </form>
            <div className="mt-4 text-xs text-slate-500">No login required for tracking.</div>

            <div className="mt-10 flex gap-3 flex-wrap">
              <Link to="/login" data-testid="hero-admin-cta">
                <Button className="bg-black hover:bg-slate-800 text-white px-6">
                  Admin login <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </Link>
              <Link to="/track" data-testid="hero-track-cta">
                <Button variant="outline" className="border-slate-200 hover:border-slate-400 px-6">
                  Track a complaint
                </Button>
              </Link>
            </div>
          </div>

          <div className="relative animate-fade-up" style={{ animationDelay: "120ms" }}>
            <div className="grid grid-cols-2 gap-4">
              <Card className="p-6 border-slate-200 shadow-sm">
                <ShieldCheck className="h-6 w-6 text-slate-900" />
                <div className="mt-4 text-xs uppercase tracking-[0.2em] font-semibold text-slate-500">Owner-side</div>
                <div className="mt-1 font-heading text-xl font-bold tracking-tight">Structured intake</div>
                <p className="text-sm text-slate-600 mt-2">Capture name, address, product serial, issue. Get an auto-ID instantly.</p>
              </Card>
              <Card className="p-6 border-slate-200 shadow-sm bg-slate-900 text-white">
                <MessageCircle className="h-6 w-6 text-white" />
                <div className="mt-4 text-xs uppercase tracking-[0.2em] font-semibold text-slate-400">Buyer-side</div>
                <div className="mt-1 font-heading text-xl font-bold tracking-tight">WhatsApp updates</div>
                <p className="text-sm text-slate-300 mt-2">Every status change pings the buyer with a tracking link.</p>
              </Card>
              <Card className="p-6 border-slate-200 shadow-sm col-span-2">
                <div className="text-xs uppercase tracking-[0.2em] font-semibold text-slate-500">Workflow</div>
                <div className="mt-3 flex items-center gap-3 flex-wrap">
                  <span className="status-pending px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">Pending</span>
                  <ArrowRight className="h-4 w-4 text-slate-400" />
                  <span className="status-in-progress px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">In Progress</span>
                  <ArrowRight className="h-4 w-4 text-slate-400" />
                  <span className="status-resolved px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">Resolved</span>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 py-8 mt-12">
        <div className="max-w-7xl mx-auto px-6 md:px-12 text-xs text-slate-500">
          © {new Date().getFullYear()} sabewell. Internal complaint tracking system.
        </div>
      </footer>
    </div>
  );
}
