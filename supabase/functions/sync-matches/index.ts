// Esta función está deshabilitada.
// El fixture del Mundial 2026 se carga ahora directamente desde la base
// de datos a partir de los datos oficiales de FIFA.com (parseados una sola vez).
// Si en el futuro hay cambios oficiales (sedes, horarios, equipos clasificados
// en eliminatorias), actualizar la tabla `matches` directamente vía migración
// o desde el panel de admin.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  return new Response(
    JSON.stringify({
      disabled: true,
      message:
        "Sincronización deshabilitada. El fixture oficial del Mundial 2026 ya está cargado en la base de datos desde fifa.com.",
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
