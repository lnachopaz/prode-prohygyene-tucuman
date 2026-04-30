import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Loader2 } from "lucide-react";

export function ProtectedRoute({ children, requireAdmin = false }: { children: React.ReactNode; requireAdmin?: boolean }) {
  const { user, isAdmin, status, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  // Si el usuario no es admin y su perfil no está explícitamente aprobado
  // (incluye status === null por falta de perfil o demora del trigger),
  // redirigir a la pantalla de "pendiente". Solo "approved" da acceso.
  if (!isAdmin && status !== "approved") return <Navigate to="/pending" replace />;
  if (requireAdmin && !isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}
