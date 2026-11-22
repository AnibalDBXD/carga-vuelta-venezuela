-- La empresa cobra al solicitante y luego liquida al conductor: el pago móvil
-- que ve el pagador es el de la plataforma (env PAGO_MOVIL_*), no por conductor.
DROP TABLE public.payment_methods;

-- Mismo flujo, pero ya no exige datos de pago del conductor.
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
  UPDATE public.package_requests SET status='awaiting_payment', amount_usd=p_amount, decided_at=now(), payment_expires_at=now()+interval '24 hours' WHERE id=p_id;
 ELSE
  UPDATE public.package_requests SET status='rejected', decided_at=now() WHERE id=p_id;
 END IF;
 RETURN CASE WHEN p_accept THEN 'awaiting_payment' ELSE 'rejected' END;
END $$;
REVOKE ALL ON FUNCTION public.decide_package_request(uuid,boolean,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_package_request(uuid,boolean,numeric) TO authenticated;

-- payment_method queda en NULL: el server fn lo rellena con la cuenta de la plataforma.
CREATE OR REPLACE FUNCTION public.payment_summary(p_request uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
 SELECT jsonb_build_object(
  'origin', t.origin, 'destination', t.destination, 'departure_date', t.departure_date,
  'vehicle_kind', v.kind, 'package', r.package, 'sender_name', r.sender_name,
  'amount_usd', r.amount_usd, 'status', r.status, 'has_proof', r.proof_path IS NOT NULL,
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
