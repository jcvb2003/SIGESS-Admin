BEGIN;

REVOKE EXECUTE ON FUNCTION public.confirmar_upload_foto(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.confirmar_upload_foto(uuid, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.confirmar_upload_foto(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.confirmar_upload_foto(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.process_data_import(text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_data_import(text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_data_import(text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_data_import(text, jsonb) TO service_role;

COMMIT;
