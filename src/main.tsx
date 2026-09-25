// First, before the Supabase client starts: keep what a password link brought.
import "./lib/initialUrl";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";

createRoot(document.getElementById("root")!).render(<App />);
