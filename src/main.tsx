import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
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
