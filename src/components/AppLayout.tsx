import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Trophy, ListChecks, Shield, LogOut, Moon, Sun, User as UserIcon, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/prohygiene-logo.png";
import { useAuth, signOut } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export default function AppLayout() {
  const { isAdmin, user } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate("/auth");
  }

  const navItem = (active: boolean) =>
    cn(
      "inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
      active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted",
    );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card sticky top-0 z-40">
        <div className="container flex h-20 items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-white rounded-md p-1.5 shadow-sm">
              <img src={logo} alt="ProHygiene" className="h-7 md:h-8 w-auto object-contain" />
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-1">
            <NavLink to="/" end className={({ isActive }) => navItem(isActive)}>
              <LayoutDashboard className="h-4 w-4" /> Resumen
            </NavLink>
            <NavLink to="/predictions" className={({ isActive }) => navItem(isActive)}>
              <ListChecks className="h-4 w-4" /> Pronósticos
            </NavLink>
            <NavLink to="/ranking" className={({ isActive }) => navItem(isActive)}>
              <Trophy className="h-4 w-4" /> Ranking
            </NavLink>
            <NavLink to="/profile" className={({ isActive }) => navItem(isActive)}>
              <UserIcon className="h-4 w-4" /> Perfil
            </NavLink>
            {isAdmin && (
              <NavLink to="/admin" className={({ isActive }) => navItem(isActive)}>
                <Shield className="h-4 w-4" /> Admin
              </NavLink>
            )}
          </nav>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Cambiar tema">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            {user && (
              <Button variant="ghost" size="icon" onClick={handleSignOut} aria-label="Cerrar sesión">
                <LogOut className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Mobile nav */}
        <nav className="md:hidden border-t flex justify-around py-2">
          <NavLink to="/" end className={({ isActive }) => navItem(isActive)}>
            <LayoutDashboard className="h-4 w-4" />
          </NavLink>
          <NavLink to="/predictions" className={({ isActive }) => navItem(isActive)}>
            <ListChecks className="h-4 w-4" />
          </NavLink>
          <NavLink to="/ranking" className={({ isActive }) => navItem(isActive)}>
            <Trophy className="h-4 w-4" />
          </NavLink>
          <NavLink to="/profile" className={({ isActive }) => navItem(isActive)}>
            <UserIcon className="h-4 w-4" />
          </NavLink>
          {isAdmin && (
            <NavLink to="/admin" className={({ isActive }) => navItem(isActive)}>
              <Shield className="h-4 w-4" />
            </NavLink>
          )}
        </nav>
      </header>

      <main className="flex-1 container py-6">
        <Outlet />
      </main>

      <footer className="border-t py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} ProHygiene · Prode Mundial 2026
      </footer>
    </div>
  );
}
