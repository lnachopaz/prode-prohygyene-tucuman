import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, Check, X, KeyRound } from "lucide-react";
import logo from "@/assets/prohygiene-logo.png";
import { passwordRules, isPasswordValid } from "@/lib/passwordRules";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    // Supabase pone el token en el hash al hacer click en el link de recovery.
    // El SDK lo procesa automáticamente y dispara onAuthStateChange con event=PASSWORD_RECOVERY.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (session && window.location.hash.includes("type=recovery"))) {
        setHasRecoverySession(true);
      }
    });

    // También chequeamos sesión actual (por si el evento ya pasó).
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
            ) : !hasRecoverySession ? (
              <div className="space-y-4 text-sm">
                <p className="text-muted-foreground">
                  Este enlace no es válido o ya expiró. Volvé a pedir un email de recuperación desde el inicio de sesión.
                </p>
                <Button className="w-full" onClick={() => navigate("/auth", { replace: true })}>
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
