-- Bot de Telegram (spec: specs/003-telegram.md).
-- * telegram_chats: vínculo chat↔app (conductor por user_id, solicitante por
--   request_id). Solo la toca service_role, como push_subscriptions.
-- * telegram_sessions: estado del asistente por chat (borrador + historial).
-- * telegram_link_tokens: tokens de un solo uso para "Conectar Telegram".
-- * package_requests.paid_notified_at: guarda del aviso "pagado" (espejo de
--   notified_at).
-- * decide_package_request se divide: el núcleo pasa a apply_request_decision
--   (verifica dueño del viaje), el RPC público queda como wrapper con auth.uid()
--   y decide_package_request_bot autoriza por chat vinculado para el conductor.

CREATE TABLE public.telegram_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id bigint NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid REFERENCES public.package_requests(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT telegram_chats_one_target CHECK (num_nonnulls(user_id, request_id) = 1)
);
-- Un chat se vincula una sola vez a cada conductor y a cada solicitud. UNIQUE
-- simple: Postgres trata NULL como distinto, así las filas del otro tipo no
-- chocan entre sí, y ON CONFLICT (upsert) sí puede inferir estos índices (un
-- índice parcial con WHERE no lo inferiría PostgREST).
CREATE UNIQUE INDEX telegram_chats_user_key ON public.telegram_chats (chat_id, user_id);
CREATE UNIQUE INDEX telegram_chats_request_key ON public.telegram_chats (chat_id, request_id);
GRANT ALL ON public.telegram_chats TO service_role;
ALTER TABLE public.telegram_chats ENABLE ROW LEVEL SECURITY;
-- El conductor lee solo su vínculo (para mostrar "Conectado" en el panel); las
-- filas de solicitante llevan user_id NULL y no se exponen.
GRANT SELECT ON public.telegram_chats TO authenticated;
CREATE POLICY "driver reads own telegram chat" ON public.telegram_chats
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.telegram_sessions (
  chat_id bigint PRIMARY KEY,
  flow jsonb NOT NULL DEFAULT '{}'::jsonb,
  history jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.telegram_sessions TO service_role;
ALTER TABLE public.telegram_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.telegram_link_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '15 minutes',
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.telegram_link_tokens ENABLE ROW LEVEL SECURITY;
GRANT INSERT, SELECT ON public.telegram_link_tokens TO authenticated;
CREATE POLICY "own telegram link tokens" ON public.telegram_link_tokens FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT ALL ON public.telegram_link_tokens TO service_role;

ALTER TABLE public.package_requests ADD COLUMN paid_notified_at timestamptz;

-- Núcleo compartido de la decisión: mismo criterio para la web (auth.uid()) y
-- para el bot (chat de Telegram vinculado). Sin GRANT: solo lo llaman las RPCs.
CREATE FUNCTION public.apply_request_decision(p_owner uuid, p_id uuid, p_accept boolean, p_amount numeric DEFAULT NULL) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid; r public.package_requests;
BEGIN
 SELECT trip_id INTO target FROM public.package_requests WHERE id=p_id;
 PERFORM 1 FROM public.trips WHERE id=target AND user_id=p_owner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'No autorizado'; END IF;
 SELECT * INTO r FROM public.package_requests WHERE id=p_id FOR UPDATE;
 IF r.status <> 'pending' THEN RAISE EXCEPTION 'Esta solicitud ya fue revisada'; END IF;
 IF public.trip_window_closed(target) THEN
  UPDATE public.package_requests SET status='expired' WHERE id=p_id;
  RAISE EXCEPTION 'Este viaje ya salió; la solicitud venció';
 END IF;
 IF p_accept THEN
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 1000000 THEN RAISE EXCEPTION 'Indica un monto válido en dólares'; END IF;
  UPDATE public.package_requests SET status='awaiting_payment', amount_usd=p_amount, total_usd=p_amount*1.25, decided_at=now(), payment_expires_at=now()+interval '24 hours' WHERE id=p_id;
 ELSE
  UPDATE public.package_requests SET status='rejected', decided_at=now() WHERE id=p_id;
 END IF;
 RETURN CASE WHEN p_accept THEN 'awaiting_payment' ELSE 'rejected' END;
END $$;
REVOKE ALL ON FUNCTION public.apply_request_decision(uuid,uuid,boolean,numeric) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.decide_package_request(p_id uuid, p_accept boolean, p_amount numeric DEFAULT NULL) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autorizado'; END IF;
 RETURN public.apply_request_decision(auth.uid(), p_id, p_accept, p_amount);
END $$;
REVOKE ALL ON FUNCTION public.decide_package_request(uuid,boolean,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_package_request(uuid,boolean,numeric) TO authenticated;

-- El conductor decide desde el bot: se autoriza por el chat vinculado al dueño
-- del viaje, nunca por el id de la solicitud solo. Solo la llama service_role.
CREATE FUNCTION public.decide_package_request_bot(p_chat_id bigint, p_request uuid, p_accept boolean, p_amount numeric DEFAULT NULL) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner uuid;
BEGIN
 SELECT t.user_id INTO owner
  FROM public.telegram_chats c
  JOIN public.package_requests r ON r.id=p_request
  JOIN public.trips t ON t.id=r.trip_id
  WHERE c.chat_id=p_chat_id AND c.user_id=t.user_id
  LIMIT 1;
 IF owner IS NULL THEN RAISE EXCEPTION 'No autorizado'; END IF;
 RETURN public.apply_request_decision(owner, p_request, p_accept, p_amount);
END $$;
REVOKE ALL ON FUNCTION public.decide_package_request_bot(bigint,uuid,boolean,numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_package_request_bot(bigint,uuid,boolean,numeric) TO service_role;
