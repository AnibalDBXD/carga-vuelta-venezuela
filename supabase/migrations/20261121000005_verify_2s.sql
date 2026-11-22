-- Demo: baja la verificación simulada de ~15 s a ~2 s tras subir el comprobante.
CREATE OR REPLACE FUNCTION public.confirm_payment(p_request uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.package_requests;
BEGIN
 SELECT * INTO r FROM public.package_requests WHERE id=p_request FOR UPDATE;
 IF r.id IS NULL THEN RETURN 'not_found'; END IF;
 IF r.status='paid' THEN RETURN 'paid'; END IF;
 IF r.status='awaiting_payment' AND r.payment_expires_at < now() THEN
  UPDATE public.package_requests SET status='expired' WHERE id=p_request;
  RETURN 'expired';
 END IF;
 IF r.status='payment_review' AND r.proof_submitted_at IS NOT NULL AND now() - r.proof_submitted_at >= interval '2 seconds' THEN
  PERFORM 1 FROM public.trips WHERE id=r.trip_id FOR UPDATE;
  UPDATE public.package_requests SET status='paid', paid_at=now() WHERE id=p_request;
  UPDATE public.trips SET packages=packages || jsonb_build_array(r.package) WHERE id=r.trip_id;
  RETURN 'paid';
 END IF;
 RETURN r.status;
END $$;
