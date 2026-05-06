import { createContext, useContext, useMemo, useState } from "react";

type Role = "admin" | "network_operator" | "data_scientist" | "ml_engineer";

type AuthState = {
  token: string | null;
  role: Role | null;
  email: string | null;
};

type AuthContextType = AuthState & {
  setAuth: (token: string, role: Role, email: string) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: localStorage.getItem("accessToken"),
    role: (localStorage.getItem("userRole") as Role | null) ?? null,
    email: localStorage.getItem("userEmail"),
  });

  const value = useMemo<AuthContextType>(
    () => ({
      ...state,
      setAuth: (token, role, email) => {
        localStorage.setItem("accessToken", token);
        localStorage.setItem("userRole", role);
        localStorage.setItem("userEmail", email);
        setState({ token, role, email });
      },
      logout: () => {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("userRole");
        localStorage.removeItem("userEmail");
        setState({ token: null, role: null, email: null });
      },
    }),
    [state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
