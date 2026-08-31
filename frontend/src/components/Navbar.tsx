import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { Calendar, Shield, LogOut, LogIn } from "lucide-react";

export const Navbar: React.FC = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const isAdmin = user?.role?.toUpperCase() === "ADMIN";

  return (
    <nav className="bg-slate-900 border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link
            to="/"
            className="flex items-center gap-2 text-emerald-400 font-bold text-xl"
          >
            <Calendar className="w-6 h-6" />
            <span>ReservaCanchas</span>
          </Link>

          {/* Enlaces de Navegación */}
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="text-slate-300 hover:text-white px-3 py-2 rounded-lg text-sm font-medium transition"
            >
              Turnos Disponibles
            </Link>

            {isAuthenticated && (
              <Link
                to="/mis-reservas"
                className="text-slate-300 hover:text-white px-3 py-2 rounded-lg text-sm font-medium transition"
              >
                Mis Reservas
              </Link>
            )}

            {isAdmin && (
              <Link
                to="/admin"
                className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 px-3 py-2 rounded-lg text-sm font-semibold transition"
              >
                <Shield className="w-4 h-4" />
                <span>Panel Canchero</span>
              </Link>
            )}

            {/* Usuario / Sesión */}
            {isAuthenticated ? (
              <div className="flex items-center gap-3 pl-4 border-l border-slate-800">
                <span className="text-sm font-medium text-slate-300">
                  {user?.name}
                </span>
                <button
                  onClick={handleLogout}
                  title="Cerrar sesión"
                  className="text-slate-400 hover:text-red-400 p-1.5 rounded-lg border border-slate-800 hover:border-red-500/30 transition"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-4 py-2 rounded-lg text-sm font-bold transition"
              >
                <LogIn className="w-4 h-4" />
                <span>Iniciar Sesión</span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};
