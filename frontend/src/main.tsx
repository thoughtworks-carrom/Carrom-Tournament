import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import OverlayPage from "./overlay/OverlayPage";
import "./index.css";

const path = window.location.pathname.replace(/\/$/, "") || "/";
const isOverlay = path.endsWith("/overlay");

if (isOverlay) {
  document.documentElement.classList.add("overlay-route");
  document.body.classList.add("overlay-route");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isOverlay ? <OverlayPage /> : <App />}
  </StrictMode>,
);
