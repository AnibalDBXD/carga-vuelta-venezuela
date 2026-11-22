-- Seguimiento del viaje para el solicitante, en su página de pago /pagos/<id>.
-- Solo se rastrea a nivel de viaje (el camión), no por carga — son los únicos
-- datos reales que el conductor reporta:
-- * trips.departed_at: el conductor marca la salida real con el botón "Salí"
--   (la hora estimada sigue siendo departure_date + departure_time); si no lo
--   marca, completar el viaje lo rellena.
-- * depart_trip: RPC del dueño del viaje, idempotente.
-- * payment_summary devuelve salida programada/real y completed_at para que el
--   cliente vea "por salir → en camino → llegó" con horas claramente estimadas.

ALTER TABLE public.trips ADD COLUMN departed_at timestamptz;

-- El conductor marca que salió. Idempotente: si ya marcó devuelve lo existente.
CREATE FUNCTION public.depart_trip(p_trip uuid) RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.trips;
BEGIN
 SELECT * INTO t FROM public.trips WHERE id=p_trip FOR UPDATE;
 IF t.id IS NULL OR auth.uid() IS NULL OR t.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'No autorizado'; END IF;
 IF t.completed_at IS NOT NULL THEN RAISE EXCEPTION 'El viaje ya está completado'; END IF;
 IF t.departed_at IS NOT NULL THEN RETURN t.departed_at; END IF;
 UPDATE public.trips SET departed_at=now() WHERE id=p_trip RETURNING departed_at INTO t.departed_at;
 RETURN t.departed_at;
END $$;
REVOKE ALL ON FUNCTION public.depart_trip(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.depart_trip(uuid) TO authenticated;

-- Mismo resumen + salida programada/real y llegada del viaje.
CREATE OR REPLACE FUNCTION public.payment_summary(p_request uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb; v_trip uuid;
BEGIN
 SELECT r.trip_id INTO v_trip FROM public.package_requests r WHERE r.id=p_request;
 IF v_trip IS NOT NULL AND public.trip_window_closed(v_trip) THEN
  UPDATE public.package_requests SET status='expired' WHERE id=p_request AND status='pending';
 END IF;
 SELECT jsonb_build_object(
  'origin', t.origin, 'destination', t.destination, 'departure_date', t.departure_date,
  'departure_time', t.departure_time, 'departed_at', t.departed_at, 'completed_at', t.completed_at,
  'vehicle_kind', v.kind, 'package', r.package, 'sender_name', r.sender_name,
  'amount_usd', r.amount_usd, 'total_usd', r.total_usd, 'status', r.status,
  'has_proof', r.proof_path IS NOT NULL, 'paid_at', r.paid_at,
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
