// =====================================================================
// Pluggy (Open Finance) → posições no mesmo formato do relatório da B3
// Puro: recebe fetch por parâmetro (testável no Node, roda no Deno).
// Docs: https://docs.pluggy.ai/pt/docs/products/investments
// =====================================================================
const API = 'https://api.pluggy.ai';

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
const TICKER = /^[A-Z]{4}\d{1,2}[A-Z]?$/;

// ---------------------------------------------------------------------
// chamadas
// ---------------------------------------------------------------------
async function pedir(fetchFn, url, opcoes, contexto) {
  const r = await fetchFn(url, opcoes);
  if (!r.ok) {
    let txt = '';
    try { txt = await r.text(); } catch { /* sem corpo */ }
    throw new Error(`${contexto}: HTTP ${r.status} ${txt.slice(0, 160)}`.trim());
  }
  return r.json();
}
export async function autenticar(fetchFn, clientId, clientSecret) {
  const j = await pedir(fetchFn, `${API}/auth`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret }),
  }, 'Pluggy recusou o Client ID/Secret');
  if (!j.apiKey) throw new Error('Pluggy não devolveu apiKey');
  return j.apiKey;
}
const comChave = (k) => ({ headers: { 'X-API-KEY': k } });
export const buscarItem = (fetchFn, k, id) =>
  pedir(fetchFn, `${API}/items/${encodeURIComponent(id)}`, comChave(k), `Conexão ${id}`);
export async function buscarInvestimentos(fetchFn, k, itemId) {
  const out = [];
  for (let page = 1; page <= 20; page++) {
    const j = await pedir(fetchFn, `${API}/investments?itemId=${encodeURIComponent(itemId)}&pageSize=500&page=${page}`,
      comChave(k), `Investimentos de ${itemId}`);
    out.push(...(j.results || []));
    if (!j.totalPages || page >= j.totalPages) break;
  }
  return out;
}

// ---------------------------------------------------------------------
// conversão
// ---------------------------------------------------------------------
// ticker: vem em "code" para ações/FIIs/ETFs; se não, tenta achar no nome
export function tickerDe(inv) {
  const c = norm(inv.code);
  if (TICKER.test(c)) return c;
  const m = norm(inv.name).match(/\b([A-Z]{4}\d{1,2})\b/);
  return m ? m[1] : null;
}

// Título público com nome no padrão do Tesouro Direto (o motor casa por família + ano).
// Open Finance pode mandar "NTN-B 2045", "Tesouro IPCA+ 2045" etc.
export function nomeTesouro(inv) {
  const n = norm(inv.name);
  const ano = String(inv.dueDate || '').slice(0, 4) || (n.match(/20\d{2}/g) || []).pop() || '';
  let fam;
  if (/RENDA ?\+|RENDA MAIS|APOSENTADORIA/.test(n)) fam = 'RENDA+ APOSENTADORIA EXTRA';
  else if (/EDUCA/.test(n)) fam = 'EDUCA+';
  else if (/NTN.?B|IPCA/.test(n)) fam = /PRINCIPAL/.test(n) || (/TESOURO IPCA/.test(n) && !/SEMESTRA/.test(n)) ? 'IPCA+' : 'IPCA+ COM JUROS SEMESTRAIS';
  else if (/NTN.?F/.test(n) || (/PREFIXADO/.test(n) && /SEMESTRA/.test(n))) fam = 'PREFIXADO COM JUROS SEMESTRAIS';
  else if (/\bLTN\b|PREFIXADO/.test(n)) fam = 'PREFIXADO';
  else if (/\bLFT\b|SELIC/.test(n)) fam = 'SELIC';
  else return inv.name || 'TESOURO';
  return `TESOURO ${fam} ${ano}`.trim();
}

const CATEGORIA = {
  STOCK: 'Ações', BDR: 'BDR', REAL_ESTATE_FUND: 'Fundo Imobiliário (FII)', ETF: 'ETF', TREASURY: 'Tesouro Direto',
  FIXED_INCOME_FUND: 'Fundo de Renda Fixa', STOCK_FUND: 'Fundo de Ações', MULTIMARKET_FUND: 'Fundo Multimercado',
  EXCHANGE_FUND: 'Fundo Cambial', FIP_FUND: 'FIP', INVESTMENT_FUND: 'Fundo de Investimento',
};
export function categoriaDe(inv) {
  if (CATEGORIA[inv.subtype]) return CATEGORIA[inv.subtype];
  if (inv.type === 'FIXED_INCOME') return `Renda Fixa ${inv.subtype || ''}`.trim();
  if (inv.type === 'EQUITY') return 'Ações';
  if (inv.type === 'ETF') return 'ETF';
  if (inv.type === 'MUTUAL_FUND') return 'Fundo de Investimento';
  return inv.type || 'Outros';
}

export function paraPosicao(inv, inst) {
  const qtd = Number(inv.quantity) || 0;
  // valor bruto (= "Valor Total" da B3); cai para o líquido se o bruto não vier
  const valor = Number(inv.amount ?? inv.balance ?? 0) || 0;
  const ehTesouro = inv.subtype === 'TREASURY' || /TESOURO|NTN|\bLTN\b|\bLFT\b/.test(norm(inv.name));
  const tk = ehTesouro ? null : tickerDe(inv);
  return {
    ativo: ehTesouro ? nomeTesouro(inv) : (tk || String(inv.name || inv.code || '?').trim()),
    descricao: String(inv.name || ''),
    categoria: categoriaDe(inv),
    inst,
    preco: Number(inv.value) || (qtd ? valor / qtd : 0),
    qtd, valor,
    aba: 'Open Finance',
  };
}

// ---------------------------------------------------------------------
// orquestração: itens = [{ id, nome }]
// ---------------------------------------------------------------------
const STATUS_OK = new Set(['UPDATED', 'UPDATING']);
export async function sincronizar({ fetchFn, clientId, clientSecret, itens }) {
  const chave = await autenticar(fetchFn, clientId, clientSecret);
  const posicoes = []; const status = []; const avisos = [];
  let data = null;
  for (const it of itens) {
    const nome = String(it.nome || 'XP').trim() || 'XP';
    try {
      const item = await buscarItem(fetchFn, chave, it.id);
      const st = {
        id: it.id, nome, status: item.status || '', erro: item.error?.message || null,
        atualizadoEm: item.lastUpdatedAt || null, consentimentoAte: item.consentExpiresAt || null,
      };
      status.push(st);
      if (!STATUS_OK.has(item.status)) {
        avisos.push(`${nome}: conexão com status ${item.status}${st.erro ? ` (${st.erro})` : ''} — reconecte em meu.pluggy.ai.`);
      }
      const invs = (await buscarInvestimentos(fetchFn, chave, it.id))
        .filter((i) => i.status !== 'RETIRADA_TOTAL' && (Number(i.amount ?? i.balance) || 0) !== 0);
      invs.forEach((i) => {
        posicoes.push(paraPosicao(i, nome));
        const d = String(i.date || '').slice(0, 10);
        if (d && (!data || d > data)) data = d;
      });
    } catch (e) {
      status.push({ id: it.id, nome, status: 'ERRO', erro: e.message });
      avisos.push(`${nome}: ${e.message}`);
    }
  }
  return { posicoes, data, status, avisos };
}
