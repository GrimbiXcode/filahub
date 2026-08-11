import { Routes, Route } from "react-router";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LEGAL_PATHS, RELEASE_NOTES_PATH, SETTINGS_PATH } from "@/const";
import { Toaster } from "@/components/ui/sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import AdminPresets from "./pages/AdminPresets";
import AdminProposals from "./pages/AdminProposals";
import AdminSystem from "./pages/AdminSystem";
import FriendInventory from "./pages/FriendInventory";
import Friends from "./pages/Friends";
import Home from "./pages/Home";
import Import from "./pages/Import";
import MaterialDetail from "./pages/MaterialDetail";
import SpoolTypes from "./pages/SpoolTypes";
import StorageBoxes from "./pages/StorageBoxes";
import Legal from "./pages/Legal";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import ReleaseNotes from "./pages/ReleaseNotes";
import Settings from "./pages/Settings";

export default function App() {
  const isMobile = useIsMobile();

  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/import" element={<Import />} />
        <Route path="/material/:id" element={<MaterialDetail />} />
        <Route path="/rollentypen" element={<SpoolTypes />} />
        <Route path="/lagerboxen" element={<StorageBoxes />} />
        <Route path="/freunde" element={<Friends />} />
        <Route path="/freunde/:id" element={<FriendInventory />} />
        <Route path={RELEASE_NOTES_PATH} element={<ReleaseNotes />} />
        <Route path={SETTINGS_PATH} element={<Settings />} />
        <Route path="/verwaltung/presets" element={<AdminPresets />} />
        <Route path="/verwaltung/vorschlaege" element={<AdminProposals />} />
        <Route path="/verwaltung/system" element={<AdminSystem />} />
        <Route path="/login" element={<Login />} />
        {/* Ohne Anmeldung erreichbar – siehe LEGAL_PATHS in src/const.ts */}
        <Route
          path={LEGAL_PATHS.privacy}
          element={<Legal document="privacy" />}
        />
        <Route
          path={LEGAL_PATHS.imprint}
          element={<Legal document="imprint" />}
        />
        <Route path={LEGAL_PATHS.terms} element={<Legal document="terms" />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      {/* Auf dem Telefon oben: unten rechts würde die Meldung den
          Aktionsknopf über der Materialliste verdecken. */}
      <Toaster richColors position={isMobile ? "top-center" : "bottom-right"} />
    </ErrorBoundary>
  );
}
