import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { ClipboardList, ArrowLeft } from "lucide-react";
import api from "@/lib/api";
import Logo from "@/components/Logo";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@company.com");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

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
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
