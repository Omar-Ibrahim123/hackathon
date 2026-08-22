import { Navigate, Outlet, Route, Routes } from "react-router-dom";

import AppShell from "./components/AppShell";
import RouteFocus from "./components/RouteFocus";
import HistoryPage from "./pages/HistoryPage";
import HomePage from "./pages/HomePage";
import NotFoundPage from "./pages/NotFoundPage";
import ProgressPage from "./pages/ProgressPage";
import TripDetailsPage from "./pages/TripDetailsPage";
import WelcomePage from "./pages/WelcomePage";
import { hasCompletedWelcome } from "./welcome/welcomePreference";

function WelcomeGate() {
  return hasCompletedWelcome() ? <Outlet /> : <Navigate to="/welcome" replace />;
}

export default function App() {
  return (
    <>
      <RouteFocus />
      <Routes>
        <Route path="/welcome" element={<WelcomePage />} />
        <Route element={<WelcomeGate />}>
          <Route element={<AppShell />}>
            <Route index element={<HomePage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="history/:id" element={<TripDetailsPage />} />
            <Route path="progress" element={<ProgressPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </>
  );
}
