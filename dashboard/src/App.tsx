import { Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./components/layout/Shell";
import { DataboardPage } from "./pages/DataboardPage";
import { SummaryPage } from "./pages/SummaryPage";
import { FinanceBoardPage } from "./pages/FinanceBoardPage";
import { AuthError, AuthLoading, LoginScreen, NoAccessScreen } from "./pages/AuthScreens";
import { AuthProvider, useAuth } from "./hooks/useAuth";

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}

/** Auth decides which world renders; the router only matters once we're in. */
function Gate() {
  const { status } = useAuth();
  if (status === "loading") return <AuthLoading />;
  if (status === "signedOut") return <LoginScreen />;
  if (status === "noAccess") return <NoAccessScreen />;
  if (status === "error") return <AuthError />;
  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/databoard" replace />} />
      <Route element={<Shell />}>
        <Route index element={<Navigate to="/databoard" replace />} />
        <Route path="/databoard" element={<DataboardPage />} />
        <Route path="/dashboard" element={<DataboardPage />} />
        <Route path="/finance" element={<SummaryPage />} />
        <Route path="/finance/:unit" element={<FinanceBoardPage tab="overview" />} />
        <Route path="/finance/:unit/details" element={<FinanceBoardPage tab="details" />} />
        <Route path="*" element={<Navigate to="/databoard" replace />} />
      </Route>
    </Routes>
  );
}
