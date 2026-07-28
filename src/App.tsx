import { Routes, Route } from "react-router";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Toaster } from "@/components/ui/sonner";
import Home from "./pages/Home";
import MaterialDetail from "./pages/MaterialDetail";
import SpoolTypes from "./pages/SpoolTypes";
import StorageBoxes from "./pages/StorageBoxes";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/material/:id" element={<MaterialDetail />} />
        <Route path="/rollentypen" element={<SpoolTypes />} />
        <Route path="/lagerboxen" element={<StorageBoxes />} />
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster richColors position="bottom-right" />
    </ErrorBoundary>
  );
}
