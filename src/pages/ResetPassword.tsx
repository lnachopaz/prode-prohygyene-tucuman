import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, Check, X, KeyRound, AlertTriangle } from "lucide-react";
import logo from "@/assets/prohygiene-logo.png";
import { passwordRules, isPasswordValid } from "@/lib/passwordRules";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Reenviar email
  const [resendEmail, setResendEmail] = useState("");
  const [resending, setResending] = useState(false);

  useEffect(() => {
    // Si Supabase devolvió un error en el hash (link expirado o ya usado), capturarlo.
    const hash = window.location.hash || "";
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const errCode = params.get("error_code") || params.get("error");
    const errDesc = params.get("error_description");
    if (errCode) {
      const friendly =
        errCode === "otp_expired"
          ? "Este enlace expiró o ya fue usado. Pedí uno nuevo."
          : (errDesc ? decodeURIComponent(errDesc.replace(/\+/g, " ")) : "El enlace no es válido.");
      setLinkError(friendly);
      setReady(true);
      return;
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (session && window.location.hash.includes("type=recovery"))) {
        setHasRecoverySession(true);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      const hashOk = window.location.hash.includes("type=recovery") || window.location.hash.includes("access_token");
      if (data.session && hashOk) setHasRecoverySession(true);
      setReady(true);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const valid = isPasswordValid(password);
  const matches = password.length > 0 && password === confirm;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return toast.error("La contraseña no cumple los requisitos");
    if (!matches) return toast.error("Las contraseñas no coinciden");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setBusy(false);
      return toast.error(error.message);
    }
    await supabase.auth.signOut();
    setBusy(false);
    toast.success("Contraseña actualizada. Iniciá sesión con la nueva.");
    navigate("/auth", { replace: true });
  }

  async function handleResend(e: React.FormEvent) {
    e.preventDefault();
    const email = resendEmail.trim();
    if (!email) return toast.error("Ingresá tu email");
    setResending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResending(false);
    if (error) return toast.error(error.message);
    toast.success("Te enviamos un email nuevo. Abrilo desde el mismo dispositivo y navegador.");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-white rounded-lg p-3 mb-4 shadow-sm">
            <img src={logo} alt="ProHygiene" className="h-10 md:h-12 w-auto object-contain" />
          </div>
        </div>
        <Card className="shadow-lg">
          <CardHeader className="items-center text-center">
            <KeyRound className="h-10 w-10 text-primary mb-2" />
            <CardTitle>Restablecer contraseña</CardTitle>
            <CardDescription>Elegí una contraseña nueva para tu cuenta.</CardDescription>
          </CardHeader>
          <CardContent>
            {!ready ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : linkError || !hasRecoverySession ? (
              <div className="space-y-4">
                <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                  <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <p className="font-medium">{linkError ?? "El enlace no es válido o ya expiró."}</p>
                    <p className="text-xs text-muted-foreground">
                      Tip: abrí el último mail recibido y hacelo desde el mismo navegador donde lo pediste. Algunos clientes de email (Gmail/Outlook) escanean el link y lo consumen antes que vos.
                    </p>
                  </div>
                </div>
                <form onSubmit={handleResend} className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="resendEmail">Reenviar email de recuperación</Label>
                    <Input
                      id="resendEmail"
                      type="email"
                      required
                      placeholder="tu@email.com"
                      value={resendEmail}
                      onChange={(e) => setResendEmail(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={resending}>
                    {resending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Enviar nuevo enlace
                  </Button>
                </form>
                <Button variant="outline" className="w-full" onClick={() => navigate("/auth", { replace: true })}>
                  Volver al inicio
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newPwd">Contraseña nueva</Label>
                  <div className="relative">
                    <Input
                      id="newPwd"
                      type={showPwd ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                      aria-label={showPwd ? "Ocultar" : "Mostrar"}
                    >
                      {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
                  <Label htmlFor="confirmPwd">Repetir contraseña</Label>
                  <div className="relative">
                    <Input
                      id="confirmPwd"
                      type={showConfirm ? "text" : "password"}
                      required
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                      aria-label={showConfirm ? "Ocultar" : "Mostrar"}
                    >
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {confirm.length > 0 && (
                    <p
                      className={`flex items-center gap-2 text-xs ${
                        matches ? "text-success" : "text-destructive"
                      }`}
                    >
                      {matches ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                      {matches ? "Las contraseñas coinciden" : "Las contraseñas no coinciden"}
                    </p>
                  )}
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Guardar nueva contraseña
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
