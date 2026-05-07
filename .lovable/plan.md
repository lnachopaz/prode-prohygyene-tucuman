## Plan: recuperación / cambio de contraseña

### 1. Pestaña "Iniciar sesión" — link "¿Olvidaste tu contraseña?"

En `src/pages/Auth.tsx`, debajo del campo de contraseña del login, agregar un link que abre un diálogo (`Dialog` de shadcn) con:

- Input de email (precargado con `loginEmail` si ya escribió algo).
- Botón "Enviar enlace de recuperación".
- Llama a:
  ```ts
  supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  })
  ```
- Toast de confirmación: "Te enviamos un email con un enlace para restablecer tu contraseña."

### 2. Nueva página `/reset-password`

Crear `src/pages/ResetPassword.tsx` (ruta pública, fuera de `ProtectedRoute`):

- Detecta el callback de Supabase (`type=recovery` en hash). Supabase ya deja una sesión temporal lista para `updateUser`.
- Form con: contraseña nueva + repetir contraseña (mismas reglas que signup: 8+ chars, mayúscula, minúscula, número; toggles de visibilidad; check de coincidencia).
- Botón "Guardar nueva contraseña" → `supabase.auth.updateUser({ password })`.
- Al éxito: toast + `signOut()` + `navigate("/auth")` para que entre con la nueva.
- Si entra sin token de recuperación válido → muestra mensaje y link para volver a `/auth`.

Registrar la ruta en `src/App.tsx`:
```tsx
<Route path="/reset-password" element={<ResetPassword />} />
```

### 3. Cambio de contraseña desde Perfil (estando logueado)

En `src/pages/Profile.tsx`, agregar una sección "Cambiar contraseña" con:

- Input contraseña nueva + repetir (mismas reglas).
- Botón "Actualizar contraseña" → `supabase.auth.updateUser({ password })`.
- Toast de éxito; opcionalmente cierra sesión para forzar re-login.

### Detalles técnicos

- El email de recuperación lo manda Supabase con su template por defecto (no se requiere configurar dominio de email custom para que funcione).
- `redirectTo` apunta a `window.location.origin + "/reset-password"`, que funciona tanto en preview como en el dominio publicado.
- Se reutilizan las reglas de password ya definidas en `Auth.tsx` (extraer a un pequeño helper `src/lib/passwordRules.ts` si querés, o duplicar — recomiendo extraer para no repetir).

### Archivos a tocar

- `src/pages/Auth.tsx` — link + dialog "olvidé mi contraseña".
- `src/pages/ResetPassword.tsx` — **nuevo**.
- `src/App.tsx` — registrar ruta pública `/reset-password`.
- `src/pages/Profile.tsx` — sección "Cambiar contraseña".
- (opcional) `src/lib/passwordRules.ts` — reglas reutilizables.

### Pregunta abierta

¿Querés también la sección "Cambiar contraseña" dentro de Perfil (punto 3), o solo el flujo de recuperación por email desde el login?
