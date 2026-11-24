import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { UpdateProvider } from "./context/UpdateContext";
import { AppShell } from "./components/AppShell";
import { Logo } from "./components/Logo";
import { AuthPage } from "./pages/AuthPage";
import { HomePage } from "./pages/HomePage";
import { SpacePage } from "./pages/SpacePage";
import { CoursePage } from "./pages/CoursePage";
import { RecordingPage } from "./pages/RecordingPage";
import { LecturePage } from "./pages/LecturePage";
import { SettingsPage } from "./pages/SettingsPage";

function AppLoading() {
  return (
    <div className="app-loading">
      <Logo />
      <div className="app-loading-orb">
        <span />
        <span />
        <span />
      </div>
      <p>正在整理你的课堂…</p>
    </div>
  );
}

function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <AppLoading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

function FallbackRoute() {
  const { user, loading } = useAuth();
  if (loading) return <AppLoading />;
  return <Navigate to={user ? "/" : "/login"} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <UpdateProvider>
          <Routes>
            <Route path="/login" element={<AuthPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<AppShell />}>
                <Route index element={<HomePage />} />
                <Route path="/space" element={<SpacePage />} />
                <Route path="/space/:courseId" element={<CoursePage />} />
                <Route path="/lecture/:lectureId" element={<LecturePage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>
              <Route path="/record/:lectureId" element={<RecordingPage />} />
            </Route>
            <Route path="*" element={<FallbackRoute />} />
          </Routes>
        </UpdateProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
