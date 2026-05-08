export { useAuth, AuthProvider, type UserStatus } from "./AuthProvider";

import { supabase } from "@/integrations/supabase/client";
export async function signOut() {
  await supabase.auth.signOut();
}
