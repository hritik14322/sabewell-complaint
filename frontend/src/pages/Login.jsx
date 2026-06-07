import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { ClipboardList, ArrowLeft, Wifi, WifiOff, Loader2 } from "lucide-react";
import api from "@/lib/api";
import Logo from "@/components/Logo";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@company.com");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // "idle" | "warming" | "ready" | "error"
  const [serverStatus, setServerStatus] = useState("idle");

  // Pre-warm the backend the moment the login page loads.
  // Render free-tier spins down after 15 min of inactivity; the first request
  // takes 30-90 s. By pinging here we absorb that delay while the user types.
  useEffect(() => {
    let cancelled = false;
    const warm = async () => {
      setServerStatus("warming");
      // Retry up to 3 times with increasing back-off (2 s, 5 s, 10 s)
      const delays = [0, 2000, 5000];
      for (let attempt = 0; attempt < 3; attempt++) {
        if (cancelled) return;
        if (delays[attempt] > 0) {
          await new Promise((r) => setTimeout(r, delays[attempt]));
        }
        try {
          await api.get("/ping", { timeout: 30000 });
          if (!cancelled) setServerStatus("ready");
          return;
        } catch {
          // keep trying
        }
      }
      if (!cancelled) setServerStatus("error");
    };
    warm();
    return () => { cancelled = true; };
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      localStorage.setItem("sw_token", data.access_token);
      localStorage.setItem("sw_email", data.email);
      toast.success("Welcome back");
      navigate("/admin");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6 py-12">
      <div className="absolute top-6 left-6">
        <Link to="/" className="inline-flex items-center text-sm text-slate-600 hover:text-slate-900" data-testid="login-back-home">
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
        </Link>
      </div>
      <Card className="w-full max-w-md p-8 border-slate-200 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <Logo to={null} size="md" testid="login-brand-logo" />
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold">Admin Console</div>
          </div>
        </div>

        <h1 className="font-heading text-2xl font-bold tracking-tight">Sign in</h1>
        <p className="text-sm text-slate-600 mt-1">Enter your admin credentials to manage complaints.</p>

        {/* Server warm-up status banner */}
        {serverStatus === "warming" && (
          <div className="mt-4 flex items-center gap-2.5 rounded-lg bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-sm text-amber-700">
            <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
            <span>Waking up server&hellip; This takes a few seconds.</span>
          </div>
        )}
        {serverStatus === "ready" && (
          <div className="mt-4 flex items-center gap-2.5 rounded-lg bg-green-50 border border-green-200 px-3.5 py-2.5 text-sm text-green-700">
            <Wifi className="h-4 w-4 flex-shrink-0" />
            <span>Server is ready. You can sign in instantly.</span>
          </div>
        )}
        {serverStatus === "error" && (
          <div className="mt-4 flex items-center gap-2.5 rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-sm text-red-700">
            <WifiOff className="h-4 w-4 flex-shrink-0" />
            <span>Server may be slow to respond. Sign in may take longer.</span>
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-sm font-medium">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              className="bg-white border-slate-300 focus-visible:ring-slate-900"
              data-testid="login-email-input"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-sm font-medium">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="bg-white border-slate-300 focus-visible:ring-slate-900"
              data-testid="login-password-input"
            />
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-black hover:bg-slate-800 text-white"
            data-testid="login-submit-btn"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                Signing in&hellip;
              </>
            ) : "Sign in"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
