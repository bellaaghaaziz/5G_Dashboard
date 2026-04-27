import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useMemo, useState } from "react";
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
    const [state, setState] = useState({
        token: localStorage.getItem("accessToken"),
        role: localStorage.getItem("userRole") ?? null,
        email: localStorage.getItem("userEmail"),
    });
    const value = useMemo(() => ({
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
    }), [state]);
    return _jsx(AuthContext.Provider, { value: value, children: children });
}
export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx)
        throw new Error("useAuth must be used inside AuthProvider");
    return ctx;
}
