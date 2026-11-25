import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { Navbar } from "./components/Navbar";
import { LoginPage } from "./pages/LoginPage";
import { BookingsPage } from "./pages/BookingsPage";
import { ReservaInvitadoPage } from "./pages/ReservaInvitadoPage";
import { MyBookingsPage } from "./pages/MyBookingsPage";
import { AdminDashboard } from "./pages/AdminDashboard";
import { ProtectedRoute } from "./components/ProtectedRoute";

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
          <Navbar />
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<Navigate to="/principal" replace />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/reserva/:codigo" element={<ReservaInvitadoPage />} />
              <Route
                path="/mis-reservas"
                element={
                  <ProtectedRoute>
                    <MyBookingsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin"
                element={
                  <ProtectedRoute requiredRole="DUENO">
                    <AdminDashboard />
                  </ProtectedRoute>
                }
              />
              {/* Las rutas fijas tienen prioridad sobre el slug del negocio. */}
              <Route path="/:slug" element={<BookingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
