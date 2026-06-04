# Painel Administrativo - SIGESS

Este projeto é um Painel Administrativo moderno, robusto e escalável, desenvolvido para gerenciar clientes, licenças e documentos. Ele utiliza uma arquitetura baseada em funcionalidades (features) para garantir manutenibilidade e facilidade de expansão.

## 🚀 Tecnologias Utilizadas

### Core
- **Vite + React (v18)**: Framework de alta performance para o frontend.
- **TypeScript**: Tipagem estática para maior segurança e produtividade.
- **Supabase**: Backend-as-a-Service para banco de dados, autenticação e Edge Functions.

### Estilização & UI
- **Tailwind CSS**: Estilização baseada em utilitários.
- **Shadcn UI (Radix UI)**: Componentes de interface acessíveis e altamente customizáveis.
- **Lucide React**: Biblioteca de ícones.

### Gerenciamento de Dados & Formulários
- **TanStack Query (React Query)**: Gerenciamento de estado assíncrono, cache e sincronização de dados.
- **React Hook Form + Zod**: Manipulação de formulários e validação de esquemas de dados.

---

## 📋 Lista de Funcionalidades

- **Módulo de Autenticação**: Sistema completo de Login e Registro integrado ao Supabase Auth.
- **Dashboard**: Painel de controle com visão geral, estatísticas e indicadores de desempenho.
- **Gestão de Clientes**: CRUD completo de clientes, incluindo perfis detalhados e histórico.
- **Gestão de Licenças**: Controle granular de licenças de software ou serviços por cliente.
- **Gestão de Documentos**: Upload, visualização e organização de documentos vinculados a clientes.
- **Configurações do Sistema**: Personalização de perfil e preferências globais da aplicação.

---

## 📂 Estrutura do Projeto (src)

A organização do código segue o padrão de **Feature-based Architecture**:

- `src/features/`: Contém os módulos principais da aplicação (auth, clients, licenses, etc.). Cada pasta de funcionalidade encapsula seus próprios componentes, hooks, tipos e páginas.
- `src/components/`:
  - `ui/`: Componentes atômicos da Shadcn UI.
  - `shared/`: Componentes reutilizáveis por múltiplas funcionalidades.
  - `layout/`: Componentes de estrutura (Sidebar, Header, Main Layout).
- `src/app/`: Configurações globais, roteamento (`router.tsx`) e gerenciamento de provedores (`providers.tsx`).
- `src/lib/`: Instância do cliente Supabase e funções utilitárias globais.
- `src/hooks/`: Hooks de React customizados e reutilizáveis.
- `src/services/`: Abstração de chamadas de API e lógica de integração.
- `supabase/`: Localização das **Edge Functions** e configurações de infraestrutura.

---

## 🛠️ Como Executar Localmente

### Pré-requisitos
- Node.js instalado.
- Gerenciador de pacotes (npm, bun ou pnpm).

### Instalação

1. Clone o repositório:
```bash
git clone <URL_DO_REPOSITORIO>
cd painel-admin
```

2. Instale as dependências:
```bash
npm install
# ou
bun install
```

3. Configure as variáveis de ambiente:
Crie um arquivo `.env` na raiz com as credenciais do Supabase:
```env
VITE_SUPABASE_URL=sua_url_aqui
VITE_SUPABASE_ANON_KEY=sua_chave_anon_aqui
```

4. Inicie o servidor de desenvolvimento:
```bash
npm run dev
```

---

## 💡 Melhores Práticas de Desenvolvimento

Para evitar a duplicação de código e manter a consistência:
1. **DRY (Don't Repeat Yourself)**: Se um componente é usado em mais de uma feature, mova-o para `src/components/shared`.
2. **Separação de Preocupações**: Mantenha a lógica complexa de dados em hooks customizados dentro de cada pasta de funcionalidade.
3. **Consistência TypeScript**: Sempre defina interfaces ou tipos para as propriedades dos componentes e retornos de API em `src/types` ou dentro do módulo correspondente.

---

## Governança de Usuários em Runtime Tenants

### Distinção obrigatória entre `tenant_role` e `operator_type`

O projeto usa dois eixos diferentes para representar usuários de um tenant runtime:

- `tenant_role`: papel estrutural de governança.
- `operator_type`: papel operacional de negócio.

Esses campos **não são intercambiáveis**.

#### `tenant_role`

Valores suportados:

- `owner`
- `member`

Uso correto:

- `owner` representa supergovernança do tenant e é consumido por regras como `is_tenant_owner(...)`.
- `member` representa um usuário comum vinculado ao tenant, cujo comportamento operacional depende de `operator_type`.

#### `operator_type`

Valores suportados hoje:

- `presidente`
- `auxiliar`

Uso correto:

- `presidente` representa o papel operacional administrativo em tenants sem polos.
- `auxiliar` representa operador comum.
- `operator_type` só deve ser usado quando `tenant_role = 'member'`.

### Regra prática para projetos isolated single

Em projetos `isolated single`:

- o papel operacional esperado é `presidente`
- não existe gestor de polo
- não se deve promover alguém para `owner` apenas para "fazer funcionar"

Se um usuário historicamente era presidente, ele deve continuar:

- `tenant_role = 'member'`
- `operator_type = 'presidente'`

### Regra de migração

Durante migrações de projetos legados para a arquitetura nova:

1. restaurar primeiro a matriz funcional real de usuários
2. validar acesso e permissões com essa matriz
3. só criar `owner` se houver decisão arquitetural explícita para aquele tenant

Nunca assumir:

- "tem acesso total, então deve ser owner"
- "se a policy cita owner, precisa existir owner"

Antes de alterar papéis, montar uma matriz explícita por tenant com:

- email
- `tenant_role`
- `operator_type`
- escopo de unidade, se existir
- permissão esperada no produto

### Erro que deve ser evitado

O erro clássico é confundir:

- papel técnico/arquitetural (`owner`)
- com papel operacional do negócio (`presidente`)

Essa troca pode deixar o projeto funcionando "por acaso", mas altera a semântica do tenant e dificulta as próximas migrações.
