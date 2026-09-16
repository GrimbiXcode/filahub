// Muss vor allem stehen, was zod-Schemata anlegt – Begründung in der Datei.
import "@/lib/zodConfig";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
// Die Schriften vor dem Stylesheet, damit dessen `--font-*` sie schon kennen.
import "@fontsource-variable/manrope";
import "@fontsource-variable/jetbrains-mono";
import "./index.css";
import { FormatProvider } from "@/providers/format";
import { I18nProvider } from "@/providers/i18n";
import { ThemeProvider } from "@/providers/theme";
import { TRPCProvider } from "@/providers/trpc";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <TRPCProvider>
          <I18nProvider>
            <FormatProvider>
              <App />
            </FormatProvider>
          </I18nProvider>
        </TRPCProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>
);
