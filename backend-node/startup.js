/**
 * startup.js — Hostinger entry point
 * Builds the React frontend first, then starts the Express backend.
 */
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const frontendDir = path.join(__dirname, "..", "frontend");
const buildDir = path.join(frontendDir, "build");

// Only build if frontend/build doesn't already exist
if (!fs.existsSync(path.join(buildDir, "index.html"))) {
  console.log("Building React frontend...");
  try {
    // Install frontend deps if needed
    if (!fs.existsSync(path.join(frontendDir, "node_modules"))) {
      console.log("Installing frontend dependencies...");
      execSync("npm install --legacy-peer-deps", { cwd: frontendDir, stdio: "inherit" });
    }
    execSync("npm run build", { cwd: frontendDir, stdio: "inherit" });
    console.log("Frontend build complete!");
  } catch (e) {
    console.error("Frontend build failed (will run API-only):", e.message);
  }
} else {
  console.log("Frontend build already exists, skipping build.");
}

// Start the Express backend (which also serves the frontend if build exists)
require("./server.js");
