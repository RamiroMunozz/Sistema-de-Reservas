import React, { useState } from "react";
import type { User } from "../types/index";
import { AuthContext } from "./authContextDef";

function getInitialAuthState(): { token: string | null; user: User | null } {
  try {
    const storedToken = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");

    if (storedToken && storedUser) {
      return {
        token: storedToken,
        user: JSON.parse(storedUser) as User,
      };
    }
  } catch (error) {
    console.error("Error al restaurar la sesión:", error);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  }

  return { token: null, user: null };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [authState, setAuthState] = useState<{
    token: string | null;
    user: User | null;
  }>(getInitialAuthState);

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem("token", newToken);
    localStorage.setItem("user", JSON.stringify(newUser));
    setAuthState({ token: newToken, user: newUser });
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setAuthState({ token: null, user: null });
  };

  return (
    <AuthContext.Provider
      value={{
        user: authState.user,
        token: authState.token,
        isAuthenticated: !!authState.token,
        loading: false,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
