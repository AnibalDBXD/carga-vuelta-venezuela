-- Fase 2 MCP (spec specs/003-telegram.md):
-- * mcp_tokens: claves de acceso del conductor para conectar agentes
--   externos al servidor MCP (/api/mcp). El id ES el bearer token.
-- * decide_package_request_mcp: paralelo a decide_package_request_bot —
--   autoriza por user_id resuelto del token (el servidor lo valida con
--   service_role), nunca por el id de la solicitud solo.

CREATE TABLE public.mcp_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mcp_tokens ENABLE ROW LEVEL SECURITY;
-- El conductor gestiona sus claves desde el panel (misma política que los
-- link tokens); revocar es un UPDATE a revoked_at — las filas no se borran.
GRANT INSERT, SELECT, UPDATE ON public.mcp_tokens TO authenticated;
CREATE POLICY "own mcp tokens" ON public.mcp_tokens FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT ALL ON public.mcp_tokens TO service_role;

-- El conductor decide vía un agente MCP: el servidor ya resolvió el token a
-- un user_id; aquí solo se verifica que ese usuario sea dueño del viaje.
CREATE FUNCTION public.decide_package_request_mcp(p_user uuid, p_request uuid, p_accept boolean, p_amount numeric DEFAULT NULL) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner uuid;
BEGIN
  SELECT t.user_id INTO owner
  FROM public.package_requests r
  JOIN public.trips t ON t.id = r.trip_id
  WHERE r.id = p_request
  LIMIT 1;
  IF owner IS NULL OR owner <> p_user THEN RAISE EXCEPTION 'No autorizado'; END IF;
  RETURN public.apply_request_decision(owner, p_request, p_accept, p_amount);
END $$;
REVOKE ALL ON FUNCTION public.decide_package_request_mcp(uuid,uuid,boolean,numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_package_request_mcp(uuid,uuid,boolean,numeric) TO service_role;
