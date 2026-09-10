import { Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./components/layout/Shell";
import { DataboardPage } from "./pages/DataboardPage";
import { SummaryPage } from "./pages/SummaryPage";
import { FinanceBoardPage } from "./pages/FinanceBoardPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Navigate to="/databoard" replace />} />
        <Route path="/databoard" element={<DataboardPage />} />
        <Route path="/finance" element={<SummaryPage />} />
        <Route path="/finance/:unit" element={<FinanceBoardPage tab="overview" />} />
        <Route path="/finance/:unit/details" element={<FinanceBoardPage tab="details" />} />
        <Route path="*" element={<Navigate to="/databoard" replace />} />
      </Route>
    </Routes>
  );
}
