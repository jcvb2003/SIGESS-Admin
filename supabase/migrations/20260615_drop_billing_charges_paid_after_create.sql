-- O constraint billing_charges_paid_after_create (paid_at > created_at) é incompatível
-- com discovery retroativo de cobranças: a linha é inserida depois que o pagamento ocorreu
-- no provider. A invariante real ("nunca fabricar paid_at") é garantida pela aplicação.
ALTER TABLE public.billing_charges DROP CONSTRAINT IF EXISTS billing_charges_paid_after_create;
