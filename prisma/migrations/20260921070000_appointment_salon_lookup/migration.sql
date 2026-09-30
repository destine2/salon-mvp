-- ---------------------------------------------------------------------------
-- Fourth escape hatch: several payment-callback routes are keyed only by an
-- appointmentId (Paystack's `reference`), with no session and no salonId
-- anywhere in the request -- checkout verify, and the two deposit routes.
-- Same SECURITY DEFINER pattern as the three functions in
-- 20260921063143_row_level_security: narrow, single-purpose, ids only.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION find_salon_id_by_appointment_id(p_appointment_id text)
RETURNS TABLE(id text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT "salonId" FROM "Appointment" WHERE id = p_appointment_id;
$$;
GRANT EXECUTE ON FUNCTION find_salon_id_by_appointment_id(text) TO app_runtime;
