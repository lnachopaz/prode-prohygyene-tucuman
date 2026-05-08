import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type UserStatus = "pending" | "approved" | "rejected";

type AuthState = {
  session: Session | null;
  user: User | null;
  isAdmin: boolean;
  status: UserStatus | null;
  loading: boolean;
};

const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  isAdmin: false,
  status: null,
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [status, setStatus] = useState<UserStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (!s?.user) {
        setIsAdmin(false);
        setStatus(null);
        setLoading(false);
        return;
      }
      // Renovación automática del token: sesión sigue activa, no hay que re-verificar roles
      if (_event === "TOKEN_REFRESHED") return;
      setLoading(true);
      setTimeout(() => {
        loadAccess(s.user.id).finally(() => setLoading(false));
      }, 0);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function loadAccess(userId: string) {
    await Promise.all([checkAdmin(userId), checkStatus(userId)]);
  }

  async function checkAdmin(userId: string) {
    const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    setIsAdmin(!!data);
  }

  async function checkStatus(userId: string) {
    const { data } = await supabase.from("profiles").select("status").eq("id", userId).maybeSingle();
    if (data?.status) {
      setStatus(data.status as UserStatus);
      return;
    }
    const { data: ensured } = await supabase.rpc("ensure_user_profile");
    setStatus((ensured ?? "pending") as UserStatus);
  }

  return (
    <AuthContext.Provider value={{ session, user, isAdmin, status, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
