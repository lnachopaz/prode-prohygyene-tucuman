import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, MailCheck } from "lucide-react";
import logo from "@/assets/prohygiene-logo.png";

export default function Auth() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);

  // login state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // signup state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [adminCode, setAdminCode] = useState("");

  // Detectar callback de confirmación de email (Supabase devuelve type=signup en hash o query)
  useEffect(() => {
    const hash = window.location.hash || "";
    const search = window.location.search || "";
    const isConfirmation =
      hash.includes("type=signup") ||
      hash.includes("access_token=") ||
      search.includes("type=signup");
    if (isConfirmation) {
      toast.success("✅ Email confirmado. Tu cuenta queda pendiente de aprobación del admin.");
      // limpiar la URL para no repetir el toast
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("¡Bienvenido!");
    navigate("/");
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Ingresá tu nombre");
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { display_name: name.trim(), admin_code: adminCode.trim() || null },
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setPendingVerificationEmail(email);
    toast.success("Cuenta creada. Revisá tu email para verificarla.");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <img src={logo} alt="ProHygiene" className="h-16 w-auto mb-4" />
          <h1 className="text-2xl font-bold text-center">Prode Mundial 2026</h1>
          <p className="text-sm text-muted-foreground text-center mt-1">
            Pronosticá los partidos y competí con tu grupo
          </p>
        </div>

        <Card className="shadow-lg">
          <Tabs defaultValue="login">
            <CardHeader>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Iniciar sesión</TabsTrigger>
                <TabsTrigger value="signup">Crear cuenta</TabsTrigger>
              </TabsList>
            </CardHeader>
            <CardContent>
              <TabsContent value="login" className="space-y-4 mt-0">
                <CardTitle className="text-lg">Volver a entrar</CardTitle>
                <CardDescription>Usá tu email y contraseña.</CardDescription>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="loginEmail">Email</Label>
                    <Input id="loginEmail" type="email" required value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="loginPassword">Contraseña</Label>
                    <Input id="loginPassword" type="password" required value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Entrar
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="space-y-4 mt-0">
                <CardTitle className="text-lg">Sumate al Prode</CardTitle>
                <CardDescription>Creá tu usuario en menos de un minuto.</CardDescription>
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nombre visible</Label>
                    <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Juan Pérez" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signupEmail">Email</Label>
                    <Input id="signupEmail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signupPassword">Contraseña</Label>
                    <Input id="signupPassword" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="adminCode">Código de admin (opcional)</Label>
                    <Input id="adminCode" value={adminCode} onChange={(e) => setAdminCode(e.target.value)} placeholder="Solo si tenés invitación" />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Crear cuenta
                  </Button>
                </form>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
