-- Un solo flujo público: los enlaces compartidos (trip_shares) ahora resuelven
-- la oferta de la bolsa del viaje y redirigen a /bolsa/<offer_id>.
-- shared_trip devuelve offer_id para que la ruta /recogidas/$token redirija.
CREATE OR REPLACE FUNCTION public.shared_trip(p_token uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
 SELECT jsonb_build_object(
   'origin',t.origin,'destination',t.destination,'departure_date',t.departure_date,
   'vehicle_kind',v.kind,'active',s.active,
   'offer_id',(SELECT ro.id FROM public.return_offers ro WHERE ro.trip_id=t.id AND ro.active ORDER BY ro.created_at DESC LIMIT 1)
 ) INTO result
 FROM public.trip_shares s JOIN public.trips t ON t.id=s.trip_id LEFT JOIN public.vehicles v ON v.id=t.vehicle_id WHERE s.id=p_token;
 RETURN result;
END $$;

-- Las solicitudes ya solo entran por la oferta (submit_offer_request).
DROP FUNCTION public.submit_package_request(uuid, text, text, text, text, jsonb, text, text);
