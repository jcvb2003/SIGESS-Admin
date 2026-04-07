# Supabase Edge Functions - SIGESS Admin

### ⚠️ Regra Crítica para Deploy

Ao realizar o deploy da função `client-proxy`, você **SEMPRE** deve adicionar a flag `--no-verify-jwt`.

**Por que isso é necessário?**
A função `client-proxy` lida com chamadas de clientes (Admin Panel web) e a autenticação de segurança (via Supabase Admin Role) já é tratada estritamente dentro da própria lógica da função (ela se certifica dos headers de autorização internamente e bypassa as barreiras nativas cruzadas dos Tenants).
Se você omitir essa flag, o servidor do Supabase na nuvem vai rejeitar a chamada no primeiro gateway com o erro **401 Unauthorized** antes mesmo do nosso código proxy rodar!

#### 👉 Comando de Deploy Correto para Proxy:
```bash
npx supabase functions deploy client-proxy --no-verify-jwt
```
> Omitir esta flag quebrará a guia de Migrations no front-end em produção!
