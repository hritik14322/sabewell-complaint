import React from "react";
import { Link } from "react-router-dom";

/**
 * Sabewell brand logo. Renders the official logo image cleanly on light backgrounds.
 */
export default function Logo({ to = "/", className = "", size = "md", testid = "brand-logo" }) {
  const heights = {
    sm: "h-7",
    md: "h-9",
    lg: "h-12",
    xl: "h-16",
  };
  const h = heights[size] || heights.md;

  const inner = (
    <img
      data-testid={testid}
      src="/brand/logo.png"
      alt="Sabewell"
      className={`${h} w-auto object-contain select-none ${className}`}
      draggable={false}
    />
  );

  if (!to) return inner;
  return (
    <Link to={to} aria-label="Sabewell home" className="inline-flex items-center">
      {inner}
    </Link>
  );
}

