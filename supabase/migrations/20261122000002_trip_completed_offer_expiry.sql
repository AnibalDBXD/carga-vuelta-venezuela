-- Viaje completado, comisión de plataforma y salida de la bolsa a la hora de salida.
-- * trips.completed_at: el conductor marca el viaje terminado. Al completarlo la
--   UI desactiva sus ofertas y submit_offer_request las rechaza siempre.
-- * package_requests.total_usd: lo que paga el solicitante = amount_usd * 1.25
--   (25% de comisión de la plataforma). Se congela al aceptar para que el cobro
--   no cambie si la comisión se ajusta después; filas viejas quedan en NULL y el
--   server fn aplica el mismo ×1.25 como fallback.
-- * submit_offer_request: la oferta deja de admitir solicitudes al llegar la
--   hora estimada de salida (available_date + available_time en America/Caracas),
--   no solo al cambiar el día. Sin hora, vence al final del día como antes.

ALTER TABLE public.trips ADD COLUMN completed_at timestamptz;
ALTER TABLE public.package_requests ADD COLUMN total_usd numeric;

-- Igual que antes, pero al aceptar congela total_usd = amount_usd * 1.25.
CREATE OR REPLACE FUNCTION public.decide_package_request(p_id uuid, p_accept boolean, p_amount numeric DEFAULT NULL) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid; r public.package_requests; owner_id uuid;
BEGIN
 SELECT trip_id INTO target FROM public.package_requests WHERE id=p_id;
 SELECT user_id INTO owner_id FROM public.trips WHERE id=target FOR UPDATE;
 IF auth.uid() IS NULL OR owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'No autorizado'; END IF;
 SELECT * INTO r FROM public.package_requests WHERE id=p_id FOR UPDATE;
 IF r.status <> 'pending' THEN RAISE EXCEPTION 'Esta solicitud ya fue revisada'; END IF;
 IF p_accept THEN
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 1000000 THEN RAISE EXCEPTION 'Indica un monto válido en dólares'; END IF;
  UPDATE public.package_requests SET status='awaiting_payment', amount_usd=p_amount, total_usd=p_amount*1.25, decided_at=now(), payment_expires_at=now()+interval '24 hours' WHERE id=p_id;
 ELSE
  UPDATE public.package_requests SET status='rejected', decided_at=now() WHERE id=p_id;
 END IF;
 RETURN CASE WHEN p_accept THEN 'awaiting_payment' ELSE 'rejected' END;
END $$;
REVOKE ALL ON FUNCTION public.decide_package_request(uuid,boolean,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_package_request(uuid,boolean,numeric) TO authenticated;

-- Mismo resumen + total_usd (lo que paga el cliente). payment_method sigue en
-- NULL: el server fn lo rellena con la cuenta de la plataforma.
CREATE OR REPLACE FUNCTION public.payment_summary(p_request uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
 SELECT jsonb_build_object(
  'origin', t.origin, 'destination', t.destination, 'departure_date', t.departure_date,
  'vehicle_kind', v.kind, 'package', r.package, 'sender_name', r.sender_name,
  'amount_usd', r.amount_usd, 'total_usd', r.total_usd, 'status', r.status,
  'has_proof', r.proof_path IS NOT NULL,
  'payment_expires_at', r.payment_expires_at, 'payment_method', NULL
 ) INTO result
 FROM public.package_requests r
 JOIN public.trips t ON t.id=r.trip_id
 LEFT JOIN public.vehicles v ON v.id=t.vehicle_id
 WHERE r.id=p_request;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.payment_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.payment_summary(uuid) TO anon, authenticated, service_role;

-- Además de activa y fecha válida, la oferta deja de admitir solicitudes al
-- llegar la hora estimada de salida (hora de Venezuela) o si el viaje se marcó
-- como completado.
CREATE OR REPLACE FUNCTION public.submit_offer_request(p_offer uuid, p_sender text, p_phone text, p_pickup text, p_delivery text, p_package jsonb, p_notes text DEFAULT '', p_email text DEFAULT '') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid;
BEGIN
 SELECT o.trip_id INTO target FROM public.return_offers o
 JOIN public.trips t ON t.id=o.trip_id
 WHERE o.id=p_offer AND o.active=true AND t.completed_at IS NULL
  AND ((o.available_date + COALESCE(o.available_time, TIME '23:59:59')) AT TIME ZONE 'America/Caracas') > now()
 FOR SHARE OF o;
 IF target IS NULL THEN RAISE EXCEPTION 'Este viaje no admite solicitudes'; END IF;
 RETURN public.insert_package_request(target,p_sender,p_phone,p_pickup,p_delivery,p_package,p_notes,p_email);
END $$;
REVOKE ALL ON FUNCTION public.submit_offer_request(uuid,text,text,text,text,jsonb,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_offer_request(uuid,text,text,text,text,jsonb,text,text) TO anon, authenticated, service_role;
