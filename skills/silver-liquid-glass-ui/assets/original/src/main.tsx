import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/instrument-serif/latin-400.css";
import "@fontsource/instrument-serif/latin-400-italic.css";
import App from "./ExplorerApp";
import "./explorer.css";
import "./discovery.css";
import "./iteration.css";
import "./components/repository-card.css";
import "./components/trend-project-card.css";
import "./components/demand-chat.css";
import "./refined-theme.css";
import "./components/rankings.css";
import "./components/trials.css";
import "./components/project-reader.css";
import "./components/trial-showcase.css";
// Shared material follows page layout; page styles must not replace its control treatment.
import "./frosted-glass.css";
import "./liquid-refraction.css";
import "./components/site-navigation.css";

window.EXCALIDRAW_ASSET_PATH = "/excalidraw-assets/";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
