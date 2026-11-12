// Local-only fixture: real product components, deterministic data, no accounts.
import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router";
import Dashboard from "@/pages/Dashboard";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useUiStore } from "@/lib/store";
import "@/index.css";

window.setFixtureTheme = (theme) =>
  useUiStore.getState().setPreference("theme", theme);
createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <TooltipProvider>
      <Routes>
        <Route path="/dashboard/*" element={<Dashboard />} />
      </Routes>
    </TooltipProvider>
  </BrowserRouter>,
);
