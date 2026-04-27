import { Navigate } from "react-router-dom";
import { useAuth } from "../context/auth";

export function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles: Array<"admin" | "network_operator" | "data_scientist">;
}) {
  const { token, role } = useAuth();

  if (!token || !role) return <Navigate to="/login" replace />;
  if (!allowedRoles.includes(role)) return <Navigate to="/" replace />;

  return <>{children}</>;
}
