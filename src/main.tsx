import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import "./index.css";
import { FormatProvider } from "@/providers/format";
import { ThemeProvider } from "@/providers/theme";
import { TRPCProvider } from "@/providers/trpc";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <TRPCProvider>
          <FormatProvider>
            <App />
          </FormatProvider>
        </TRPCProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>
);
