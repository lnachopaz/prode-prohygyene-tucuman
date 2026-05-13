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
import { Loader2, MailCheck, Eye, EyeOff, Check, X } from "lucide-react";
import { TrophyLogo } from "@/components/TrophyLogo";
import { PitchPattern } from "@/components/PitchPattern";

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
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [adminCode, setAdminCode] = useState("");

  // forgot password state
  const [forgotMode, setForgotMode] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);

  // recovery mode (usuario llegó desde el link del email)
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showNewPasswordConfirm, setShowNewPasswordConfirm] = useState(false);

  // visibility toggles
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showSignupPasswordConfirm, setShowSignupPasswordConfirm] = useState(false);

  // password rules (en tiempo real)
  const passwordRules = [
    { label: "Al menos 8 caracteres", test: (p: string) => p.length >= 8 },
    { label: "Una letra mayúscula", test: (p: string) => /[A-Z]/.test(p) },
    { label: "Una letra minúscula", test: (p: string) => /[a-z]/.test(p) },
    { label: "Un número", test: (p: string) => /\d/.test(p) },
  ];
  const passwordValid = passwordRules.every((r) => r.test(password));
  const passwordsMatch = password.length > 0 && password === passwordConfirm;

  // Detectar confirmación de email
  useEffect(() => {
    const hash = window.location.hash || "";
    const search = window.location.search || "";
    const isConfirmation =
      hash.includes("type=signup") ||
      search.includes("type=signup");
    if (isConfirmation) {
      toast.success("✅ Email confirmado. Tu cuenta queda pendiente de aprobación del admin.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Detectar recuperación de contraseña — espera a que Supabase establezca la sesión
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setRecoveryMode(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) return null;
  if (user && !recoveryMode) return <Navigate to="/" replace />;

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/auth`,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setResetSent(true);
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordRules.every((r) => r.test(newPassword))) return toast.error("La contraseña no cumple los requisitos");
    if (newPassword !== newPasswordConfirm) return toast.error("Las contraseñas no coinciden");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Contraseña actualizada. Podés iniciar sesión.");
    setRecoveryMode(false);
    navigate("/auth");
  }

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
    if (!passwordValid) return toast.error("La contraseña no cumple los requisitos");
    if (!passwordsMatch) return toast.error("Las contraseñas no coinciden");
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
    // Notificar al admin (no bloqueante)
    supabase.functions.invoke("send-gmail", {
      body: {
        to: "prodefutbolpag@gmail.com",
        subject: `Nuevo usuario quiere ingresar: ${name.trim()}`,
        html: `<p>Un nuevo usuario solicitó acceso al prode:</p>
<ul>
  <li><strong>Nombre:</strong> ${name.trim()}</li>
  <li><strong>Email:</strong> ${email}</li>
</ul>
<p>Ingresá al panel de admin para aprobarlo o rechazarlo.</p>`,
      },
    }).catch((e) => console.error("admin notify failed", e));
  }

  if (recoveryMode) {
    const newPasswordRules = [
      { label: "Al menos 8 caracteres", test: (p: string) => p.length >= 8 },
      { label: "Una letra mayúscula", test: (p: string) => /[A-Z]/.test(p) },
      { label: "Una letra minúscula", test: (p: string) => /[a-z]/.test(p) },
      { label: "Un número", test: (p: string) => /\d/.test(p) },
    ];
    const newPasswordValid = newPasswordRules.every((r) => r.test(newPassword));
    const newPasswordsMatch = newPassword.length > 0 && newPassword === newPasswordConfirm;
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/15 p-4">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center mb-8 gap-3">
            <TrophyLogo size="lg" showWordmark />
          </div>
          <Card className="shadow-lg border-t-4 border-t-gold">
            <CardHeader>
              <CardTitle className="font-display text-2xl tracking-wide">NUEVA CONTRASEÑA</CardTitle>
              <CardDescription>Ingresá tu nueva contraseña para restablecer el acceso.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">Nueva contraseña</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showNewPassword ? "text" : "password"}
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                    >
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <ul className="space-y-1 rounded-md border bg-muted/30 p-2 text-xs">
                    {newPasswordRules.map((rule) => {
                      const ok = rule.test(newPassword);
                      return (
                        <li key={rule.label} className={`flex items-center gap-2 ${ok ? "text-success" : "text-muted-foreground"}`}>
                          {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                          <span>{rule.label}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newPasswordConfirm">Repetir contraseña</Label>
                  <div className="relative">
                    <Input
                      id="newPasswordConfirm"
                      type={showNewPasswordConfirm ? "text" : "password"}
                      required
                      value={newPasswordConfirm}
                      onChange={(e) => setNewPasswordConfirm(e.target.value)}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPasswordConfirm((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                    >
                      {showNewPasswordConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {newPasswordConfirm.length > 0 && (
                    <p className={`flex items-center gap-2 text-xs ${newPasswordsMatch ? "text-success" : "text-destructive"}`}>
                      {newPasswordsMatch ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                      {newPasswordsMatch ? "Las contraseñas coinciden" : "Las contraseñas no coinciden"}
                    </p>
                  )}
                </div>
                <Button type="submit" className="w-full" disabled={busy || !newPasswordValid || !newPasswordsMatch}>
                  {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Guardar nueva contraseña
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (forgotMode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/15 p-4">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center mb-8 gap-3">
            <TrophyLogo size="lg" showWordmark />
          </div>
          <Card className="shadow-lg border-t-4 border-t-gold">
            <CardHeader>
              <CardTitle className="font-display text-2xl tracking-wide">RECUPERAR CONTRASEÑA</CardTitle>
              <CardDescription>Ingresá tu email y te enviaremos un enlace para restablecer tu contraseña.</CardDescription>
            </CardHeader>
            <CardContent>
              {resetSent ? (
                <div className="space-y-4">
                  <div className="flex flex-col items-center gap-3 py-4">
                    <MailCheck className="h-12 w-12 text-primary" />
                    <p className="text-center text-sm text-muted-foreground">
                      Te enviamos un email a <strong>{resetEmail}</strong> con el enlace para restablecer tu contraseña.
                    </p>
                  </div>
                  <Button variant="outline" className="w-full" onClick={() => { setForgotMode(false); setResetSent(false); setResetEmail(""); }}>
                    Volver al inicio de sesión
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="resetEmail">Email</Label>
                    <Input
                      id="resetEmail"
                      type="email"
                      required
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="tu@email.com"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Enviar enlace
                  </Button>
                  <Button variant="ghost" className="w-full" type="button" onClick={() => setForgotMode(false)}>
                    Volver
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (pendingVerificationEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/15 p-4">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center mb-8 gap-3">
            <TrophyLogo size="lg" showWordmark />
          </div>
          <Card className="shadow-lg border-t-4 border-t-gold">
            <CardHeader className="items-center text-center">
              <MailCheck className="h-12 w-12 text-primary mb-2" />
              <CardTitle className="font-display text-2xl tracking-wide">VERIFICÁ TU EMAIL</CardTitle>
              <CardDescription className="text-center">
                Te enviamos un correo a <strong>{pendingVerificationEmail}</strong>. Hacé clic en el enlace para verificar tu cuenta.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm text-muted-foreground">
                Después de verificar tu email, tu cuenta quedará pendiente de aprobación por un administrador.
              </div>
              <div className="flex justify-center">
                <Button variant="outline" onClick={() => setPendingVerificationEmail(null)}>
                  Volver
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Hero futbolero */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden">
        <PitchPattern className="absolute inset-0 w-full h-full" />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/80 via-primary/60 to-primary/90" />
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-gold via-gold/60 to-gold" />

        <div className="relative z-10 p-10">
          <TrophyLogo size="lg" showWordmark className="[&_span]:text-white" />
        </div>

        <div className="relative z-10 p-10 space-y-5 text-white">
          <h2 className="font-display text-5xl xl:text-6xl uppercase leading-[0.9] tracking-wide">
            Pronosticá.<br />Sumá.<br />
            <span className="text-gold">Levantá la copa.</span>
          </h2>
          <p className="font-heading uppercase tracking-[0.18em] text-sm text-white/85 pt-2">
            Mundial 2026 · Prohygiene Tucumán
          </p>
        </div>

        <div className="relative z-10 px-10 pb-6 text-[11px] uppercase tracking-[0.3em] text-white/60 font-heading">
          Mundial 2026 · Canadá · México · USA
        </div>
      </aside>

      {/* Panel de auth */}
      <section className="flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center mb-8 lg:hidden gap-3">
            <TrophyLogo size="md" showWordmark />
          </div>
          <div className="hidden lg:flex items-center gap-2 mb-4">
            <span className="font-heading uppercase tracking-[0.2em] text-xs text-muted-foreground">
              Acceso jugadores
            </span>
          </div>

        <Card className="shadow-lg border-t-4 border-t-gold">
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
                    <div className="relative">
                      <Input
                        id="loginPassword"
                        type={showLoginPassword ? "text" : "password"}
                        required
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPassword((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showLoginPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                        tabIndex={-1}
                      >
                        {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Entrar
                  </Button>
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => setForgotMode(true)}
                      className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
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
                    <div className="relative">
                      <Input
                        id="signupPassword"
                        type={showSignupPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSignupPassword((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showSignupPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                        tabIndex={-1}
                      >
                        {showSignupPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <ul className="space-y-1 rounded-md border bg-muted/30 p-2 text-xs">
                      {passwordRules.map((rule) => {
                        const ok = rule.test(password);
                        return (
                          <li
                            key={rule.label}
                            className={`flex items-center gap-2 ${ok ? "text-success" : "text-muted-foreground"}`}
                          >
                            {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                            <span>{rule.label}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signupPasswordConfirm">Repetir contraseña</Label>
                    <div className="relative">
                      <Input
                        id="signupPasswordConfirm"
                        type={showSignupPasswordConfirm ? "text" : "password"}
                        required
                        value={passwordConfirm}
                        onChange={(e) => setPasswordConfirm(e.target.value)}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSignupPasswordConfirm((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showSignupPasswordConfirm ? "Ocultar contraseña" : "Mostrar contraseña"}
                        tabIndex={-1}
                      >
                        {showSignupPasswordConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {passwordConfirm.length > 0 && (
                      <p
                        className={`flex items-center gap-2 text-xs ${
                          passwordsMatch ? "text-success" : "text-destructive"
                        }`}
                      >
                        {passwordsMatch ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                        {passwordsMatch ? "Las contraseñas coinciden" : "Las contraseñas no coinciden"}
                      </p>
                    )}
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
      </section>
    </div>
  );
}
