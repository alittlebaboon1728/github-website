import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/manrope";
import "../frosted-glass.css";
import "../liquid-refraction.css";
import "./admin.css";
import AdminApp from "./AdminApp";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AdminApp />
  </React.StrictMode>,
);
