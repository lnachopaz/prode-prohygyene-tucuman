import { Navigate } from "react-router-dom";
import { useAuth, signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Clock, XCircle, MailCheck } from "lucide-react";
import logo from "@/assets/prohygiene-logo.png";

export default function Pending() {
  const { user, status, isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (isAdmin || status === "approved") return <Navigate to="/" replace />;

  const rejected = status === "rejected";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <img src={logo} alt="ProHygiene" className="h-16 w-auto mb-4" />
        </div>
        <Card className="shadow-lg">
          <CardHeader className="items-center text-center">
            {rejected ? (
              <XCircle className="h-12 w-12 text-destructive mb-2" />
            ) : (
              <Clock className="h-12 w-12 text-primary mb-2" />
            )}
            <CardTitle>{rejected ? "Cuenta rechazada" : "Cuenta pendiente"}</CardTitle>
            <CardDescription className="text-center">
              {rejected
                ? "Tu solicitud de acceso fue rechazada por un administrador."
                : "Tu cuenta está pendiente de aprobación por un administrador. Te avisaremos cuando puedas ingresar."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!rejected && (
              <div className="flex items-start gap-2 rounded-md border border-success/30 bg-success/10 p-3 text-sm">
                <MailCheck className="h-5 w-5 text-success shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-success">Email verificado</p>
                  <p className="text-muted-foreground text-xs">Solo falta que un administrador apruebe tu cuenta.</p>
                </div>
              </div>
            )}
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => signOut()}>Cerrar sesión</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
