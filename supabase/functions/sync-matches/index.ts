// Sync deshabilitado: el fixture del Mundial 2026 está cargado manualmente
// con nombres en español y sedes correctas. Se mantiene este endpoint para
// no romper el botón existente del panel de Admin.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  return new Response(
    JSON.stringify({
      disabled: true,
      count: 0,
      message:
        "La sincronización automática está deshabilitada. El fixture del Mundial 2026 está cargado manualmente con sedes y nombres en español.",
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
