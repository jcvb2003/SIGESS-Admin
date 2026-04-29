# Supabase Edge Functions - SIGESS Admin

### ⚠️ Regra Crítica para Deploy

Ao realizar o deploy da função `client-proxy`, você **SEMPRE** deve adicionar a flag `--no-verify-jwt`.

**Por que isso é necessário?**
A função `client-proxy` lida com chamadas de clientes (Admin Panel web) e a autenticação de segurança (via Supabase Admin Role) já é tratada estritamente dentro da própria lógica da função.

#### 👉 Comando de Deploy Correto para Proxy:
```bash
npx supabase functions deploy client-proxy --no-verify-jwt
```

### 🔒 Permissões de Banco de Dados (Tenants)

Para que a sincronização de limites e outras operações administrativas funcionem, a `service_role` de cada inquilino deve ter permissões explícitas nas tabelas de configuração. 

Se você encontrar erros **500 (Permission Denied)** no proxy, execute o seguinte SQL no editor SQL do projeto do inquilino:

```sql
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;
-- Garante que RLS não bloqueie a service_role em tabelas específicas
ALTER TABLE public.configuracao_entidade DISABLE ROW LEVEL SECURITY; 
```

> Omitir esta configuração quebrará a sincronização de assinaturas e a guia de Migrations!
