import { Navigate, Routes, Route } from "react-router";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  APPEARANCE_PATH,
  CONTAINER_TYPES_PATH,
  DRYBOXES_PATH,
  LAGER_PATH,
  ORGANIZATIONS_PATH,
  LEGACY_CONTAINER_TYPES_PATH,
  LEGACY_DRYBOXES_PATH,
  LEGAL_PATHS,
  RELEASE_NOTES_PATH,
  SETTINGS_PATH,
} from "@/const";
import { Toaster } from "@/components/ui/sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import AdminPresets from "./pages/AdminPresets";
import Appearance from "./pages/Appearance";
import AdminProposals from "./pages/AdminProposals";
import AdminSystem from "./pages/AdminSystem";
import FriendInventory from "./pages/FriendInventory";
import Friends from "./pages/Friends";
import Home from "./pages/Home";
import LagerPage from "./pages/Lager";
import Import from "./pages/Import";
import MaterialDetail from "./pages/MaterialDetail";
import ContainerTypes from "./pages/ContainerTypes";
import StorageBoxes from "./pages/StorageBoxes";
import Legal from "./pages/Legal";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import OrganizationDetail from "./pages/OrganizationDetail";
import Organizations from "./pages/Organizations";
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
        <Route path={CONTAINER_TYPES_PATH} element={<ContainerTypes />} />
        <Route path={DRYBOXES_PATH} element={<StorageBoxes />} />
        <Route path={APPEARANCE_PATH} element={<Appearance />} />
        {/* Alte Pfade aus 2.1.0 bzw. 2.2.0 – gesetzte Lesezeichen sollen nicht
            brechen. */}
        <Route
          path={LEGACY_DRYBOXES_PATH}
          element={<Navigate to={DRYBOXES_PATH} replace />}
        />
        <Route
          path={LEGACY_CONTAINER_TYPES_PATH}
          element={<Navigate to={CONTAINER_TYPES_PATH} replace />}
        />
        <Route path={LAGER_PATH} element={<LagerPage />} />
        <Route path={ORGANIZATIONS_PATH} element={<Organizations />} />
        <Route
          path={`${ORGANIZATIONS_PATH}/:id`}
          element={<OrganizationDetail />}
        />
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
