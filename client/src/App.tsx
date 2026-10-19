import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { BoardPage } from './pages/BoardPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { RegisterPage } from './pages/RegisterPage';
import { GuestRoute, ProtectedRoute } from './routes/guards';
import { RealtimeProvider } from './realtime/RealtimeProvider';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RealtimeProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/projects" replace />} />

            <Route element={<GuestRoute />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
            </Route>

            <Route element={<ProtectedRoute />}>
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/projects/:projectId" element={<BoardPage />} />
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </RealtimeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}