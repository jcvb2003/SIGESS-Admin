ALTER TABLE projetos ADD COLUMN runtime_db_url text;
COMMENT ON COLUMN projetos.runtime_db_url IS 'Conexão direta porta 5432. Formato: postgresql://postgres:{pw}@db.{ref}.supabase.co:5432/postgres. Não use pooler 6543.';
