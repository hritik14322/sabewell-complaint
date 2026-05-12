import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import "@/App.css";

import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import AdminDashboard from "@/pages/AdminDashboard";
import NewComplaint from "@/pages/NewComplaint";
import ComplaintDetail from "@/pages/ComplaintDetail";
import PublicTrack from "@/pages/PublicTrack";
import PublicTrackLookup from "@/pages/PublicTrackLookup";
import CustomersList from "@/pages/CustomersList";
import CustomerDetail from "@/pages/CustomerDetail";

function RequireAuth({ children }) {
  const token = typeof window !== "undefined" ? localStorage.getItem("sw_token") : null;
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/track" element={<PublicTrackLookup />} />
          <Route path="/track/:cid" element={<PublicTrack />} />
          <Route
            path="/admin"
            element={
              <RequireAuth>
                <AdminDashboard />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/new"
            element={
              <RequireAuth>
                <NewComplaint />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/c/:cid"
            element={
              <RequireAuth>
                <ComplaintDetail />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/customers"
            element={
              <RequireAuth>
                <CustomersList />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/customers/:phone"
            element={
              <RequireAuth>
                <CustomerDetail />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster richColors position="top-right" />
    </div>
  );
}
