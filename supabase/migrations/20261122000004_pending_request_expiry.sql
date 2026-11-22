-- Las solicitudes pendientes no pueden quedar abiertas para siempre: si el
-- viaje ya salió (misma ventana que submit_offer_request) o se completó, el
-- solicitante debe ver 'expired' y buscar otro camión, no "Pendiente".
-- * trip_window_closed: helper interno con el criterio de cierre (viaje
--   completado, ventana de la oferta vencida o —si el viaje nunca tuvo oferta—
--   su propia fecha/hora de salida en America/Caracas).
-- * payment_summary pasa de STABLE a VOLATILE: al consultar una solicitud
--   'pending' de un viaje ya cerrado la marca 'expired' antes de responder.
-- * decide_package_request aplica el mismo chequeo: el conductor no puede
--   aceptar ni rechazar carga de un viaje que ya salió; la solicitud vence.

CREATE OR REPLACE FUNCTION public.trip_window_closed(p_trip uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT COALESCE(
  (SELECT t.completed_at IS NOT NULL
   OR EXISTS (
    SELECT 1 FROM public.return_offers o
    WHERE o.trip_id = t.id
     AND (o.available_date + COALESCE(o.available_time, TIME '23:59:59')) AT TIME ZONE 'America/Caracas' <= now()
   )
   OR (
    NOT EXISTS (SELECT 1 FROM public.return_offers o WHERE o.trip_id = t.id)
    AND (t.departure_date + COALESCE(t.departure_time, TIME '23:59:59')) AT TIME ZONE 'America/Caracas' <= now()
   )
   FROM public.trips t WHERE t.id = p_trip),
  false);
$$;
REVOKE ALL ON FUNCTION public.trip_window_closed(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.payment_summary(p_request uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb; v_trip uuid;
BEGIN
 SELECT r.trip_id INTO v_trip FROM public.package_requests r WHERE r.id=p_request;
 IF v_trip IS NOT NULL AND public.trip_window_closed(v_trip) THEN
  UPDATE public.package_requests SET status='expired' WHERE id=p_request AND status='pending';
 END IF;
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

CREATE OR REPLACE FUNCTION public.decide_package_request(p_id uuid, p_accept boolean, p_amount numeric DEFAULT NULL) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid; r public.package_requests; owner_id uuid;
BEGIN
 SELECT trip_id INTO target FROM public.package_requests WHERE id=p_id;
 SELECT user_id INTO owner_id FROM public.trips WHERE id=target FOR UPDATE;
 IF auth.uid() IS NULL OR owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'No autorizado'; END IF;
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
REVOKE ALL ON FUNCTION public.decide_package_request(uuid,boolean,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_package_request(uuid,boolean,numeric) TO authenticated;
