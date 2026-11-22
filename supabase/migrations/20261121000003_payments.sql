-- Cobro por pago móvil tras aceptar solicitudes (spec: specs/001-pago-movil.md).
-- Aceptar ya no añade el paquete al viaje: queda en awaiting_payment hasta que el
-- comprobante subido pasa por confirm_payment, que hace el append atómicamente.

ALTER TABLE public.package_requests
  ADD COLUMN email text NOT NULL DEFAULT '',
  ADD COLUMN amount_usd numeric,
  ADD COLUMN proof_path text,
  ADD COLUMN proof_submitted_at timestamptz,
  ADD COLUMN paid_at timestamptz,
  ADD COLUMN payment_expires_at timestamptz,
  ADD COLUMN notified_at timestamptz;

ALTER TABLE public.package_requests DROP CONSTRAINT package_requests_status_check;
ALTER TABLE public.package_requests ADD CONSTRAINT package_requests_status_check
  CHECK (status IN ('pending','awaiting_payment','payment_review','paid','rejected','expired'));

-- Datos de pago móvil del conductor: banco, teléfono, cédula/RIF y titular.
CREATE TABLE public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE DEFAULT auth.uid(),
  bank text NOT NULL,
  phone text NOT NULL,
  document text NOT NULL,
  holder text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_methods TO authenticated;
GRANT ALL ON public.payment_methods TO service_role;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own payment method" ON public.payment_methods FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Suscripciones Web Push del solicitante (anónimo): ligadas a la solicitud,
-- sin lectura pública; solo las escribe el RPC y las lee service_role.
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.package_requests(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Comprobantes de pago: bucket privado; el dueño del viaje lee los de sus solicitudes.
INSERT INTO storage.buckets (id, name, public) VALUES ('payment-proofs', 'payment-proofs', false);
CREATE POLICY "trip owner reads proofs" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'payment-proofs' AND EXISTS (
  SELECT 1 FROM public.package_requests r
  JOIN public.trips t ON t.id = r.trip_id
  WHERE r.id::text = (storage.foldername(objects.name))[1] AND t.user_id = auth.uid()
));

-- Helper compartido: ahora exige correo (llega el enlace de pago por email).
DROP FUNCTION public.insert_package_request(uuid, text, text, text, text, jsonb, text);
CREATE FUNCTION public.insert_package_request(p_trip uuid, p_sender text, p_phone text, p_pickup text, p_delivery text, p_package jsonb, p_notes text DEFAULT '', p_email text DEFAULT '') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE request_id uuid := gen_random_uuid(); field text;
BEGIN
 IF length(trim(p_sender)) NOT BETWEEN 2 AND 100 OR length(trim(p_phone)) NOT BETWEEN 7 AND 30 OR length(trim(p_pickup)) NOT BETWEEN 5 AND 500 OR length(trim(p_delivery)) NOT BETWEEN 5 AND 500 OR length(p_notes)>2000 THEN RAISE EXCEPTION 'Revisa el contacto y las direcciones'; END IF;
 IF length(p_email) > 254 OR trim(p_email) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN RAISE EXCEPTION 'Correo inválido'; END IF;
 IF jsonb_typeof(p_package) IS DISTINCT FROM 'object' OR length(trim(p_package->>'name')) NOT BETWEEN 2 AND 200 THEN RAISE EXCEPTION 'Descripción inválida'; END IF;
 FOREACH field IN ARRAY ARRAY['length','width','height','weight','qty'] LOOP
  IF jsonb_typeof(p_package->field) IS DISTINCT FROM 'number' OR (p_package->>field)::numeric <= 0 OR (p_package->>field)::numeric > 10000 THEN RAISE EXCEPTION 'Medidas o peso inválidos'; END IF;
 END LOOP;
 IF (p_package->>'qty')::numeric <> trunc((p_package->>'qty')::numeric) OR (p_package->>'qty')::numeric >100 OR jsonb_typeof(p_package->'fragile') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Cantidad o fragilidad inválida'; END IF;
 IF coalesce(p_package->>'deadline','') <> '' AND (p_package->>'deadline') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' THEN RAISE EXCEPTION 'Plazo inválido'; END IF;
 INSERT INTO public.package_requests(id,trip_id,sender_name,phone,email,pickup_address,delivery_address,package,notes) VALUES(request_id,p_trip,trim(p_sender),trim(p_phone),lower(trim(p_email)),trim(p_pickup),trim(p_delivery),jsonb_build_object('id',request_id,'name',trim(p_package->>'name'),'length',(p_package->>'length')::numeric,'width',(p_package->>'width')::numeric,'height',(p_package->>'height')::numeric,'weight',(p_package->>'weight')::numeric,'qty',(p_package->>'qty')::integer,'fragile',(p_package->>'fragile')::boolean,'deadline',coalesce(p_package->>'deadline',''),'recipient',trim(p_delivery),'pickup',trim(p_pickup)),p_notes);
 RETURN request_id;
END $$;
REVOKE ALL ON FUNCTION public.insert_package_request(uuid,text,text,text,text,jsonb,text,text) FROM PUBLIC, anon, authenticated;

DROP FUNCTION public.submit_package_request(uuid, text, text, text, text, jsonb, text);
CREATE FUNCTION public.submit_package_request(p_token uuid, p_sender text, p_phone text, p_pickup text, p_delivery text, p_package jsonb, p_notes text DEFAULT '', p_email text DEFAULT '') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid;
BEGIN
 SELECT trip_id INTO target FROM public.trip_shares WHERE id=p_token AND active=true FOR SHARE;
 IF target IS NULL THEN RAISE EXCEPTION 'El enlace no admite solicitudes'; END IF;
 RETURN public.insert_package_request(target,p_sender,p_phone,p_pickup,p_delivery,p_package,p_notes,p_email);
END $$;
REVOKE ALL ON FUNCTION public.submit_package_request(uuid,text,text,text,text,jsonb,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_package_request(uuid,text,text,text,text,jsonb,text,text) TO anon, authenticated, service_role;

DROP FUNCTION public.submit_offer_request(uuid, text, text, text, text, jsonb, text);
CREATE FUNCTION public.submit_offer_request(p_offer uuid, p_sender text, p_phone text, p_pickup text, p_delivery text, p_package jsonb, p_notes text DEFAULT '', p_email text DEFAULT '') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid;
BEGIN
 SELECT trip_id INTO target FROM public.return_offers WHERE id=p_offer AND active=true FOR SHARE;
 IF target IS NULL THEN RAISE EXCEPTION 'Este viaje no admite solicitudes'; END IF;
 RETURN public.insert_package_request(target,p_sender,p_phone,p_pickup,p_delivery,p_package,p_notes,p_email);
END $$;
REVOKE ALL ON FUNCTION public.submit_offer_request(uuid,text,text,text,text,jsonb,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_offer_request(uuid,text,text,text,text,jsonb,text,text) TO anon, authenticated, service_role;

-- Aceptar ahora deja la solicitud esperando pago (monto en USD); el paquete
-- entra a la carga solo cuando confirm_payment lo marca como pagado.
DROP FUNCTION public.decide_package_request(uuid, boolean);
CREATE FUNCTION public.decide_package_request(p_id uuid, p_accept boolean, p_amount numeric DEFAULT NULL) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid; r public.package_requests; owner_id uuid;
BEGIN
 SELECT trip_id INTO target FROM public.package_requests WHERE id=p_id;
 SELECT user_id INTO owner_id FROM public.trips WHERE id=target FOR UPDATE;
 IF auth.uid() IS NULL OR owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'No autorizado'; END IF;
 SELECT * INTO r FROM public.package_requests WHERE id=p_id FOR UPDATE;
 IF r.status <> 'pending' THEN RAISE EXCEPTION 'Esta solicitud ya fue revisada'; END IF;
 IF p_accept THEN
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 1000000 THEN RAISE EXCEPTION 'Indica un monto válido en dólares'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payment_methods WHERE user_id=owner_id) THEN RAISE EXCEPTION 'Configura tus datos de pago móvil antes de aceptar'; END IF;
  UPDATE public.package_requests SET status='awaiting_payment', amount_usd=p_amount, decided_at=now(), payment_expires_at=now()+interval '24 hours' WHERE id=p_id;
 ELSE
  UPDATE public.package_requests SET status='rejected', decided_at=now() WHERE id=p_id;
 END IF;
 RETURN CASE WHEN p_accept THEN 'awaiting_payment' ELSE 'rejected' END;
END $$;
REVOKE ALL ON FUNCTION public.decide_package_request(uuid,boolean,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_package_request(uuid,boolean,numeric) TO authenticated;

-- Resumen público de la solicitud para la página de pago (id = capability).
CREATE FUNCTION public.payment_summary(p_request uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
 SELECT jsonb_build_object(
  'origin', t.origin, 'destination', t.destination, 'departure_date', t.departure_date,
  'vehicle_kind', v.kind, 'package', r.package, 'sender_name', r.sender_name,
  'amount_usd', r.amount_usd, 'status', r.status, 'has_proof', r.proof_path IS NOT NULL,
  'payment_expires_at', r.payment_expires_at,
  'payment_method', CASE WHEN r.status IN ('awaiting_payment','payment_review','paid')
    THEN (SELECT jsonb_build_object('bank',pm.bank,'phone',pm.phone,'document',pm.document,'holder',pm.holder) FROM public.payment_methods pm WHERE pm.user_id=t.user_id)
    ELSE NULL END
 ) INTO result
 FROM public.package_requests r
 JOIN public.trips t ON t.id=r.trip_id
 LEFT JOIN public.vehicles v ON v.id=t.vehicle_id
 WHERE r.id=p_request;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.payment_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.payment_summary(uuid) TO anon, authenticated, service_role;

-- El solicitante se suscribe a push justo después de enviar su solicitud.
CREATE FUNCTION public.attach_push_subscription(p_request uuid, p_endpoint text, p_p256dh text, p_auth text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.package_requests WHERE id=p_request) THEN RAISE EXCEPTION 'Solicitud no encontrada'; END IF;
 IF length(p_endpoint) NOT BETWEEN 10 AND 500 OR p_endpoint NOT LIKE 'https://%' THEN RAISE EXCEPTION 'Suscripción inválida'; END IF;
 IF length(p_p256dh) NOT BETWEEN 10 AND 200 OR length(p_auth) NOT BETWEEN 10 AND 200 THEN RAISE EXCEPTION 'Suscripción inválida'; END IF;
 INSERT INTO public.push_subscriptions(request_id,endpoint,p256dh,auth) VALUES(p_request,p_endpoint,p_p256dh,p_auth)
 ON CONFLICT (endpoint) DO UPDATE SET request_id=EXCLUDED.request_id, p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth;
END $$;
REVOKE ALL ON FUNCTION public.attach_push_subscription(uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attach_push_subscription(uuid,text,text,text) TO anon, authenticated, service_role;

-- El comprobante ya quedó en storage (vía signed URL); aquí solo se marca.
CREATE FUNCTION public.submit_payment_proof(p_request uuid, p_path text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.package_requests;
BEGIN
 SELECT * INTO r FROM public.package_requests WHERE id=p_request FOR UPDATE;
 IF r.id IS NULL THEN RAISE EXCEPTION 'Solicitud no encontrada'; END IF;
 IF r.status='awaiting_payment' AND r.payment_expires_at < now() THEN
  UPDATE public.package_requests SET status='expired' WHERE id=p_request;
  RAISE EXCEPTION 'El plazo para pagar venció';
 END IF;
 IF r.status <> 'awaiting_payment' THEN RAISE EXCEPTION 'Esta solicitud no espera pago'; END IF;
 IF p_path IS NULL OR length(p_path) > 300 OR p_path NOT LIKE p_request::text || '/%' THEN RAISE EXCEPTION 'Comprobante inválido'; END IF;
 UPDATE public.package_requests SET status='payment_review', proof_path=p_path, proof_submitted_at=now() WHERE id=p_request;
END $$;
REVOKE ALL ON FUNCTION public.submit_payment_proof(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_payment_proof(uuid,text) TO anon, authenticated, service_role;

-- Verificación simulada: ~15 s tras subir el comprobante confirma el pago y
-- añade el paquete al viaje bajo locks (anti-duplicado, igual que antes).
CREATE FUNCTION public.confirm_payment(p_request uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.package_requests;
BEGIN
 SELECT * INTO r FROM public.package_requests WHERE id=p_request FOR UPDATE;
 IF r.id IS NULL THEN RETURN 'not_found'; END IF;
 IF r.status='paid' THEN RETURN 'paid'; END IF;
 IF r.status='awaiting_payment' AND r.payment_expires_at < now() THEN
  UPDATE public.package_requests SET status='expired' WHERE id=p_request;
  RETURN 'expired';
 END IF;
 IF r.status='payment_review' AND r.proof_submitted_at IS NOT NULL AND now() - r.proof_submitted_at >= interval '15 seconds' THEN
  PERFORM 1 FROM public.trips WHERE id=r.trip_id FOR UPDATE;
  UPDATE public.package_requests SET status='paid', paid_at=now() WHERE id=p_request;
  UPDATE public.trips SET packages=packages || jsonb_build_array(r.package) WHERE id=r.trip_id;
  RETURN 'paid';
 END IF;
 RETURN r.status;
END $$;
REVOKE ALL ON FUNCTION public.confirm_payment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_payment(uuid) TO anon, authenticated, service_role;
