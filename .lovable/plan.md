# Aprobación de registro por admin

Los nuevos usuarios podrán registrarse pero quedarán **pendientes** hasta que un admin los apruebe. Mientras estén pendientes, no podrán entrar a la app (verán una pantalla de "Esperando aprobación").

## Flujo del usuario

1. Usuario completa el formulario de registro (igual que ahora).
2. Se crea su cuenta pero con estado `pending`.
3. Al iniciar sesión, en lugar de la app, ve un mensaje: **"Tu cuenta está pendiente de aprobación por un administrador"** con un botón para cerrar sesión.
4. Cuando el admin lo aprueba, en su próximo login (o refresh) ya entra normalmente.
5. Si el admin lo rechaza, ve mensaje de cuenta rechazada.

**Excepción**: si el usuario se registra con un código de admin válido, queda **aprobado automáticamente** (los admins no requieren aprobación).

## Flujo del admin

En **Panel admin → Usuarios** se agrega:
- Nueva sección **"Pendientes de aprobación"** arriba, con cada usuario mostrando nombre, email, fecha de registro, y botones **Aprobar** / **Rechazar**.
- La lista existente de usuarios sigue mostrando los aprobados.
- Badge con número de pendientes en el tab "Usuarios" para que el admin lo vea.

## Cambios técnicos

### Base de datos (migración)
- Agregar columna `status` a `profiles` con enum `user_status` (`pending`, `approved`, `rejected`), default `pending`.
- Actualizar `handle_new_user()` para que asigne `approved` si el código admin es válido, sino `pending`.
- Marcar como `approved` a todos los usuarios existentes (para no romper cuentas actuales).
- Nueva función security-definer `is_approved(_user_id uuid)` para chequear estado.
- Política RLS en `profiles`: admins pueden actualizar `status` (ya existe `profiles_admin_update_any`, sirve).
- Política nueva en `predictions`: solo usuarios aprobados pueden insertar/actualizar (refuerzo server-side).

### Frontend
- **`src/lib/auth.ts`**: agregar `status` al hook `useAuth` (consulta `profiles.status` tras login).
- **`src/components/ProtectedRoute.tsx`**: si `status !== 'approved'` y no es admin, redirigir a nueva pantalla `/pending`.
- **Nueva página `src/pages/Pending.tsx`**: muestra mensaje según estado (pending / rejected) + botón cerrar sesión.
- **`src/App.tsx`**: agregar ruta `/pending`.
- **`src/pages/Admin.tsx` → `UsersAdmin`**: agregar sección de pendientes con botones Aprobar/Rechazar (update a `profiles.status`), y badge con conteo en el TabsTrigger.

## Sobre "no puedo entrar como admin"

Mencionaste antes que no podías entrar como admin. Si seguís con ese problema después de este cambio, avisame con el email de la cuenta admin para revisarlo aparte (probablemente el usuario admin no tiene rol `admin` en `user_roles`, lo puedo verificar con una consulta).
