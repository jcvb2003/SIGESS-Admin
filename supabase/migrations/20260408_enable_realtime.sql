-- Habilitação de Realtime para o fluxo de fotos
-- Permite que o computador receba notificações de UPDATE no token

-- 1. Configurar Identidade de Réplica (garante que todos os dados sejam enviados no evento)
ALTER TABLE public.foto_upload_tokens REPLICA IDENTITY FULL;

-- 2. Adicionar a tabela à publicação do Supabase
-- Usamos um bloco DO para ser resiliente a erros caso a publicação não exista ou a tabela já esteja nela
DO $$
BEGIN
    -- Verifica se a publicação padrão do Supabase existe
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        -- Tenta adicionar a tabela. Se já estiver lá, o Postgres lançará um aviso/erro ignorável aqui
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.foto_upload_tokens;
        EXCEPTION
            WHEN duplicate_object THEN
                RAISE NOTICE 'Tabela já está na publicação supabase_realtime';
            WHEN OTHERS THEN
                RAISE NOTICE 'Erro ao adicionar tabela à publicação: %', SQLERRM;
        END;
    ELSE
        RAISE NOTICE 'Publicação supabase_realtime não encontrada. O Realtime pode não estar ativado neste projeto.';
    END IF;
END $$;
