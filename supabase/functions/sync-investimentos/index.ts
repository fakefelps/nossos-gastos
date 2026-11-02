// =====================================================================
// Edge Function: sync-investimentos
// Busca os investimentos da pessoa logada no Meu Pluggy (Open Finance)
// e grava em invest_carteira.dados.posicoes — mesmo formato do Excel da B3.
//
// Segredos (Supabase > Edge Functions > Secrets), um par por pessoa:
//   PLUGGY_CLIENT_ID_FELIPE,  PLUGGY_CLIENT_SECRET_FELIPE
//   PLUGGY_CLIENT_ID_MARIANA, PLUGGY_CLIENT_SECRET_MARIANA
//   (sem sufixo = valor padrão para quem não tiver o seu)
// Os IDs das conexões (item IDs do meu.pluggy.ai) ficam na própria aba Invest.
//
// Usa o login de quem chamou (RLS): cada um só sincroniza a própria carteira.
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';
import { sincronizar } from './pluggy.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const auth = req.headers.get('Authorization');
    if (!auth) return resposta({ erro: 'Sem login.' }, 401);

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: u, error: eu } = await sb.auth.getUser(auth.replace(/^Bearer\s+/i, ''));
    if (eu || !u?.user) return resposta({ erro: 'Login inválido ou expirado.' }, 401);

    const { data: perfil } = await sb.from('perfis').select('pessoa').eq('id', u.user.id).maybeSingle();
    if (!perfil) return resposta({ erro: 'Login sem perfil (Felipe/Mariana).' }, 403);

    const { data: linha, error: el } = await sb.from('invest_carteira').select('dados').eq('pessoa', perfil.pessoa).maybeSingle();
    if (el) return resposta({ erro: `Tabela invest_carteira: ${el.message}` }, 500);
    const dados = (linha?.dados ?? {}) as Record<string, unknown>;
    const itens = ((dados.pluggyItens as { id: string; nome?: string }[]) || []).filter((i) => i?.id);
    if (!itens.length) return resposta({ erro: 'Nenhuma conexão Pluggy cadastrada na aba Invest.' }, 400);

    // O Meu Pluggy só dá acesso aos dados do próprio CPF: cada pessoa tem a sua conta Pluggy.
    // Procura PLUGGY_CLIENT_ID_FELIPE / _MARIANA; se não houver, usa PLUGGY_CLIENT_ID.
    const pessoa = String(perfil.pessoa).toUpperCase();
    const clientId = Deno.env.get(`PLUGGY_CLIENT_ID_${pessoa}`) || Deno.env.get('PLUGGY_CLIENT_ID');
    const clientSecret = Deno.env.get(`PLUGGY_CLIENT_SECRET_${pessoa}`) || Deno.env.get('PLUGGY_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      return resposta({ erro: `Faltam os segredos PLUGGY_CLIENT_ID_${pessoa} / PLUGGY_CLIENT_SECRET_${pessoa} no Supabase.` }, 500);
    }

    const r = await sincronizar({ fetchFn: fetch, clientId, clientSecret, itens });
    // se nada veio e houve erro, mantém a posição anterior em vez de zerar a carteira
    if (!r.posicoes.length && r.avisos.length) return resposta({ erro: r.avisos.join(' '), status: r.status }, 502);

    const novo = {
      ...dados,
      posicoes: r.posicoes,
      data: r.data,
      arquivo: 'Open Finance (Pluggy)',
      fonte: 'pluggy',
      sincronizadoEm: new Date().toISOString(),
      pluggyStatus: r.status,
    };
    const { error: eg } = await sb.from('invest_carteira').upsert(
      { pessoa: perfil.pessoa, dados: novo, atualizado_em: new Date().toISOString() },
      { onConflict: 'pessoa' },
    );
    if (eg) return resposta({ erro: `Não gravou: ${eg.message}` }, 500);

    return resposta({ ok: true, n: r.posicoes.length, data: r.data, status: r.status, avisos: r.avisos });
  } catch (e) {
    return resposta({ erro: (e as Error).message }, 500);
  }
});
