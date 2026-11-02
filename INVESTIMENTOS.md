# Aba Investimentos — implantação

## 1. Tabela (uma vez)
Supabase → SQL Editor → cole `sql/03_investimentos.sql` → Run.

## 2. Open Finance via Meu Pluggy (posição automática)
1. Crie a conta em **dashboard.pluggy.ai** → *Applications* → nova aplicação. Anote **Client ID** e **Client Secret**.
2. **Enquanto o período de teste estiver ativo**, entre em **meu.pluggy.ai** e conecte a **XP** (o consentimento é aprovado no app da XP).
3. No meu.pluggy.ai, menu ⋮ → **Copiar Item ID**.
4. Supabase → *Edge Functions* → *Secrets* — **um par por pessoa** (o Meu Pluggy só lê o CPF do dono da conta Pluggy):
   - `PLUGGY_CLIENT_ID_FELIPE` / `PLUGGY_CLIENT_SECRET_FELIPE`
   - `PLUGGY_CLIENT_ID_MARIANA` / `PLUGGY_CLIENT_SECRET_MARIANA`
   - Cada um repete os passos 1–3 com o próprio CPF e cola o próprio Item ID na própria aba Invest.
5. Deploy da função (escolha um):
   - **CLI**: `supabase login` → `supabase link --project-ref bhtbncmnihzcmsxpcuxc` → `supabase functions deploy sync-investimentos`
   - **Painel**: *Edge Functions* → *Deploy a new function* → *Via Editor* → nome `sync-investimentos` →
     cole `index.ts` e adicione o arquivo `pluggy.js` (mesma pasta). Deixe **Verify JWT** ligado.
6. No app: aba **Invest.** → *Conexão automática (Open Finance)* → cole o Item ID → **Conectar**.

A partir daí, a posição se atualiza sozinha ao abrir a aba (se a última sincronização tiver mais de 6 h)
e pelo botão **Atualizar agora**. O Excel da B3 continua funcionando como plano B.

### Segurança
- O Client Secret fica só nos segredos do Supabase — nunca no site.
- A função usa o login de quem chama (RLS): cada pessoa só lê e grava a própria carteira.
- O Item ID sozinho não dá acesso a nada sem o Client Secret.
- Separação Felipe × Mariana: a função escolhe o par de segredos pelo login de quem chamou,
  e a tabela `invest_carteira` tem RLS por pessoa — um não lê nem sincroniza a carteira do outro.

### Manutenção
| Sintoma | Causa | O que fazer |
|---|---|---|
| "Faltam os segredos PLUGGY_…_PESSOA" | Segredos dessa pessoa não cadastrados | Passo 4 |
| Status `LOGIN_ERROR` / `OUTDATED` | Consentimento vencido (12 meses) ou revogado | Reconectar a XP no meu.pluggy.ai |
| "Pluggy recusou o Client ID/Secret" | Credencial errada ou regerada | Atualizar os segredos |
| Ativo aparece "fora do alvo" com nome estranho | Pluggy mandou o nome sem ticker | Conferir `code` do ativo; incluir o nome no ALIAS do alvo |

## 3. Carteira-alvo pela Finclass (quando quiser)
A Finclass não tem API. O app lê a carteira por um **favorito do navegador**, que usa o login que já está aberto
(nenhuma senha passa pelo app).

1. Aba **Invest.** → *Carteira-alvo (Finclass)* → arraste o botão **◈ Enviar para o Nossos Gastos** para a barra de favoritos do Chrome.
2. Abra a página **Carteira** da Finclass e espere carregar.
3. Clique no favorito. O app abre com a lista do que mudou (entrou, saiu, % e preço máximo) → **Aplicar**.

O favorito lê `walletOutputRecommendedV2` da própria página (a carteira recomendada e a data em que a Finclass a revisou).
Se a Finclass mudar o site e o favorito parar de funcionar, a carteira-alvo continua editável à mão.

## 4. Arquivos
| Arquivo | Função |
|---|---|
| `js/invest.js` | Motor: leitura do Excel, casamento com o alvo, cálculo de compra/venda |
| `js/invest-ui.js` | Tela da aba + salvar no Supabase + chamar a sincronização |
| `supabase/functions/sync-investimentos/pluggy.js` | Conversão Pluggy → mesmo formato do Excel da B3 |
| `supabase/functions/sync-investimentos/index.ts` | Edge Function (login, segredos, gravação) |
| `sql/03_investimentos.sql` | Tabela `invest_carteira` + RLS |
