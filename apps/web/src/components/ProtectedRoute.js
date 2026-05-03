import { jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/auth";
export function ProtectedRoute({ children, allowedRoles, }) {
    const { token, role } = useAuth();
    if (!token || !role)
        return _jsx(Navigate, { to: "/login", replace: true });
    if (!allowedRoles.includes(role))
        return _jsx(Navigate, { to: "/app/home", replace: true });
    return _jsx(_Fragment, { children: children });
}
