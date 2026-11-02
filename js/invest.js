// =====================================================================
// INVESTIMENTOS — motor de cálculo (sem tela e sem banco de dados)
// Lê o relatório de posição da B3, compara com a carteira-alvo (Finclass)
// e devolve, por ativo, quanto comprar ou vender.
// Portado do rebalanceador-carteira.html, com as correções marcadas "FIX".
// =====================================================================

export const NOME_CLASSE = {
  ACOES: 'Ações', FIIS: 'Fundos Imobiliários', CAIXA: 'Caixa / Renda Fixa',
  ALTERNATIVOS: 'Alternativos', OUTROS: 'Não classificados',
};
export const ORDEM_CLASSE = ['ACOES', 'FIIS', 'CAIXA', 'ALTERNATIVOS', 'OUTROS'];

// Opções de cálculo guardadas por pessoa. tol é em pontos percentuais (0,5 = 0,5 p.p.).
export const CFG_PADRAO = {
  baseModo: 'meta',   // meta = % valem sobre o patrimônio-alvo | atual = sobre o que já tem
  patMeta: 15000,     // "valor investido" da carteira Finclass
  aporte: 0,
  modo: 'full',       // full = comprar e vender | aporte = só compras
  tol: 0.5,
  janela: 5,          // anos de tolerância para casar vencimentos do Tesouro
  agrupar: 'auto',    // auto | nunca
  raizAcao: true,     // KLBN11 ≈ KLBN4
  renda: false,       // Renda+ conta como Tesouro IPCA+
};

// ---------------------------------------------------------------------
// Carteira-alvo embutida (ponto de partida; o app guarda a sua cópia editável).
// Colunas: classe, ativo, nome, perc, grupo, equivalência, alias, tipoRef, valRef
// FIX: BBSE3 e BRBI11 estavam trocados em relação à Finclass (print de 02/11/2026:
// BB Seguridade 1,50% "em revisão" = R$ 225; BR Partners 2,00% = R$ 300 sobre R$ 15.000).
// As demais linhas NÃO foram conferidas — confira na aba Investimentos.
// ---------------------------------------------------------------------
export const ALVO_PADRAO = [
  ['ACOES', 'BBSE3', 'BB SEGURIDADE', .015, 'BBSE', 'NAO', '', 'EM_REVISAO', null],
  ['ACOES', 'BRBI11', 'BR PARTNERS', .02, 'BRBI', 'NAO', '', 'PRECO_MAX', 17.87],
  ['ACOES', 'FESA4', 'FERBASA', .015, 'FESA', 'NAO', 'FESA3', 'PRECO_MAX', 9.5],
  ['ACOES', 'GMAT3', 'GRUPO MATEUS', .015, 'GMAT', 'NAO', '', 'PRECO_MAX', 6.92],
  ['ACOES', 'KEPL3', 'KEPLER WEBER', .035, 'KEPL', 'NAO', '', 'PRECO_MAX', 9.55],
  ['ACOES', 'KLBN4', 'KLABIN', .035, 'KLBN', 'NAO', 'KLBN11|KLBN3', 'PRECO_MAX', 5.03],
  ['ACOES', 'SLCE3', 'SLC AGRICOLA', .035, 'SLCE', 'NAO', '', 'PRECO_MAX', 23.28],
  ['ACOES', 'WIZC3', 'WIZ CO.', .03, 'WIZC', 'NAO', '', 'PRECO_MAX', 10.5],
  ['FIIS', 'BRCR11', 'BTG CORPORATE OFFICE FUND', .015, 'BRCR11', 'NAO', '', 'PRECO_MAX', 85],
  ['FIIS', 'BTCI11', 'BTG CREDITO IMOBILIARIO', .0225, 'BTCI11', 'NAO', '', 'PRECO_MAX', 10],
  ['FIIS', 'BTHF11', 'BTG PACTUAL RE HEDGE FUND', .015, 'BTHF11', 'NAO', '', 'PRECO_MAX', 9.65],
  ['FIIS', 'CPTS11', 'CAPITANIA SECURITIES II', .03, 'CPTS11', 'NAO', '', 'PRECO_MAX', 8.9],
  ['FIIS', 'HGLG11', 'PATRIA LOGISTICA', .015, 'HGLG11', 'NAO', 'PATL11', 'EM_REVISAO', null],
  ['FIIS', 'JSRE11', 'JS REAL ESTATE MULTIGESTAO', .0125, 'JSRE11', 'NAO', '', 'PRECO_MAX', 92],
  ['FIIS', 'LVBI11', 'VBI LOGISTICO', .01, 'LVBI11', 'NAO', '', 'EM_REVISAO', null],
  ['FIIS', 'MCRE11', 'MAUA CAPITAL REAL ESTATE', .03, 'MCRE11', 'NAO', '', 'PRECO_MAX', 10.1],
  ['FIIS', 'PSEC11', 'PATRIA SECURITIES', .03, 'PSEC11', 'NAO', '', 'PRECO_MAX', 81],
  ['FIIS', 'PVBI11', 'VBI PRIME PROPERTIES', .0325, 'PVBI11', 'NAO', '', 'PRECO_MAX', 110],
  ['FIIS', 'RBVA11', 'RIO BRAVO RENDA VAREJO', .0125, 'RBVA11', 'NAO', '', 'PRECO_MAX', 10.45],
  ['FIIS', 'RBRX11', 'PATRIA PLUS MULTIESTRATEGIA', .025, 'RBRX11', 'NAO', '', 'PRECO_MAX', 9.35],
  ['FIIS', 'TRXF11', 'TRX REAL ESTATE', .0225, 'TRXF11', 'NAO', '', 'PRECO_MAX', 101],
  ['FIIS', 'VILG11', 'VINCI LOGISTICA', .025, 'VILG11', 'NAO', '', 'PRECO_MAX', 111],
  ['FIIS', 'VISC11', 'VINCI SHOPPING CENTERS', .0325, 'VISC11', 'NAO', '', 'PRECO_MAX', 121],
  ['FIIS', 'XPCI11', 'XP CREDITO IMOBILIARIO', .0375, 'XPCI11', 'NAO', '', 'PRECO_MAX', 95],
  ['FIIS', 'XPML11', 'XP MALLS', .0325, 'XPML11', 'NAO', '', 'PRECO_MAX', 115],
  ['CAIXA', 'CDII11', 'SPARTA INFRA', .05, 'FI-INFRA', 'SIM', '', 'P_VP', 1.03],
  ['CAIXA', 'CPTI11', 'CAPITANIA INFRA', .05, 'FI-INFRA', 'SIM', '', 'P_VP', 1.05],
  ['CAIXA', 'KDIF11', 'KINEA INFRA RENDA FIXA', .05, 'FI-INFRA', 'SIM', '', 'P_VP', 1.05],
  ['CAIXA', 'TESOURO IPCA+ 2037 COM JUROS SEMESTRAIS', 'TESOURO IPCA+ 2037 JS', .05, 'TD-IPCA', 'SIM', '', 'TAXA', .065],
  ['CAIXA', 'TESOURO IPCA+ 2045 COM JUROS SEMESTRAIS', 'TESOURO IPCA+ 2045 JS', .05, 'TD-IPCA', 'SIM', '', 'TAXA', .065],
  ['CAIXA', 'TESOURO IPCA+ 2060 COM JUROS SEMESTRAIS', 'TESOURO IPCA+ 2060 JS', .025, 'TD-IPCA', 'SIM', '', 'TAXA', .065],
  ['CAIXA', 'TESOURO PREFIXADO 2037 COM JUROS SEMESTRAIS', 'TESOURO PREFIXADO 2037 JS', .025, 'TD-PRE', 'SIM', '', 'TAXA', .10],
  ['ALTERNATIVOS', 'GOLD11', 'OURO (exterior: IAU)', .02, 'OURO', 'SIM', 'IAU', 'MERCADO', null],
  ['ALTERNATIVOS', 'WRLD11', 'GLOBAL (exterior: VT)', .08, 'GLOBAL', 'SIM', 'VT|WRLD39', 'MERCADO', null],
].map((a) => ({
  classe: a[0], ativo: a[1], nome: a[2], perc: a[3], grupo: a[4], equiv: a[5],
  alias: a[6], tipoRef: a[7], valRef: a[8], obs: '',
}));

// ---------------------------------------------------------------------
// utilidades
// ---------------------------------------------------------------------
export const norm = (s) => (s == null ? '' : String(s)).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
const E = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brl = (v) => fmtBRL.format(v || 0);
const pct = (v) => `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

// aceita 1234.56, "1.234,56", "R$ 1.234,56", "2,00%", "-" e "1.000" (milhar sem vírgula)
export function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (v == null) return 0;
  let s = String(v).replace(/[R$\s% ]/g, '');
  if (s === '' || s === '-') return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // FIX: "1.000" é mil, não 1
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

// título público: família, ano de vencimento, juros semestrais
export function parseTD(txt) {
  const s = norm(txt).replace(/[-_]/g, ' ');
  if (!s.includes('TESOURO')) return null;
  const anos = s.match(/20\d{2}/g);
  const ano = anos ? parseInt(anos[anos.length - 1], 10) : null;
  let fam = 'OUTRO';
  if (/RENDA|APOSENTADORIA/.test(s)) fam = 'RENDA+';
  else if (/EDUCA/.test(s)) fam = 'EDUCA+';
  else if (/IPCA/.test(s)) fam = 'IPCA+';
  else if (/PREFIXADO|PRE FIXADO/.test(s)) fam = 'PREFIXADO';
  else if (/SELIC/.test(s)) fam = 'SELIC';
  return { fam, ano, js: /SEMESTRA/.test(s) };
}
// KLBN11 -> KLBN, BBSE3 -> BBSE
export function raiz(t) { const m = norm(t).match(/^([A-Z]{4})\d{1,2}$/); return m ? m[1] : null; }

// "BBSE3 - BB SEGURIDADE PARTICIPACOES SA" -> "BBSE3". Títulos públicos passam inteiros.
export function extrairTicker(txt) {
  const s = String(txt).trim();
  const m = s.match(/^([A-Z]{4}\d{1,2}[A-Z]?)\s*[-–—]\s+/i);
  return m ? m[1].toUpperCase() : s;
}

// ---------------------------------------------------------------------
// classe do ativo que ficou fora do alvo (para o % da classe não distorcer)
// FIX: \b evita que "PARTICIPACOES" case com "ACOES".
// ---------------------------------------------------------------------
const MAPA_CATEGORIA = [
  [/\bACAO\b|\bACOES\b|\bSTOCKS?\b/, 'ACOES'],
  [/\bFII\b|\bFIIS\b|IMOBILI|\bIMOB\b/, 'FIIS'],
  [/TESOURO|RENDA FIXA|\bCDB\b|\bLCI\b|\bLCA\b|\bCRI\b|\bCRA\b|DEBENTURE|INFRA|FUNDO DE RENDA/, 'CAIXA'],
  [/\bETF\b|\bBDR\b|CRIPTO|CRYPTO|\bOURO\b|EXTERIOR/, 'ALTERNATIVOS'],
  [/MULTIMERCADO|CAMBIAL|PREVIDENCIA|\bCOE\b|\bFIP\b/, 'OUTROS'], // fundos que não são FII
  [/FUNDO/, 'FIIS'],
];
export function classeDaCategoria(...campos) {
  const s = norm(campos.filter(Boolean).join(' '));
  for (const [re, k] of MAPA_CATEGORIA) if (re.test(s)) return k;
  return 'OUTROS';
}

// ---------------------------------------------------------------------
// leitura das planilhas (recebe o objeto XLSX do SheetJS)
// ---------------------------------------------------------------------
function acharCol(hdr, testes) {
  for (const t of testes) {
    const i = hdr.findIndex((h) => t(norm(h)));
    if (i >= 0) return i;
  }
  return -1;
}
// Status Invest usa ATIVO; a B3 usa PRODUTO.
const HDR_ATIVO = [(h) => h === 'ATIVO', (h) => h.includes('CODIGO DE NEGOCIACAO'), (h) => h === 'TICKER',
  (h) => h === 'PRODUTO', (h) => h === 'CODIGO', (h) => h.includes('PRODUTO'),
  (h) => h.includes('ESPECIFICACAO'), (h) => h.includes('ATIVO')];
const linhaVazia = (r) => r.filter((c) => c != null && String(c).trim() !== '').length;

// --- carteira atual: percorre todas as abas do export ---
export function lerPosicoes(wb, XLSX) {
  const posicoes = [];
  const avisos = [];
  let data = null;
  wb.SheetNames.forEach((nome) => {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, blankrows: false, defval: null });
    // o cabeçalho nem sempre é a primeira linha (a B3 põe título e filtros antes)
    const iHdr = rows.findIndex((r) => Array.isArray(r) && acharCol(r, HDR_ATIVO) >= 0 && linhaVazia(r) >= 2);
    if (iHdr < 0) return;
    if (!data) { // "Exibindo: 30/10/2026"
      for (let i = 0; i < iHdr && !data; i++) {
        for (const c of rows[i] || []) {
          const m = String(c ?? '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
          if (m) { data = `${m[3]}-${m[2]}-${m[1]}`; break; }
        }
      }
    }
    const hdr = rows[iHdr];
    const cAtivo = acharCol(hdr, HDR_ATIVO);
    const cCat = acharCol(hdr, [(h) => h.includes('CATEGORIA'), (h) => h.includes('CLASSE')]);
    const cInst = acharCol(hdr, [(h) => h === 'INSTITUICAO', (h) => h.includes('INSTITUICAO'), (h) => h.includes('CORRETORA')]);
    const cPat = acharCol(hdr, [(h) => h.includes('PATRIM'), (h) => h.includes('VALOR') && h.includes('ATUAL'),
      (h) => h.includes('VALOR BRUTO'), (h) => h.includes('SALDO'), (h) => h.includes('POSICAO'), (h) => h.includes('TOTAL')]);
    const cPre = acharCol(hdr, [(h) => h.includes('PRECO') && h.includes('ATUAL'),
      (h) => h.includes('PRECO') && h.includes('FECHAMENTO'), (h) => h.includes('COTACAO'),
      (h) => h.includes('VALOR UNITARIO'), (h) => h.includes('PRECO') && !h.includes('MEDIO')]);
    const cQtd = acharCol(hdr, [(h) => h === 'QUANTIDADE', (h) => h.includes('QUANTIDADE DISPONIVEL'), (h) => h.includes('QUANT')]);
    const cDesc = acharCol(hdr, [(h) => h === 'PRODUTO', (h) => h.includes('PRODUTO'), (h) => h.includes('ESPECIFICACAO')]);
    if (cPat < 0 && cPre < 0) avisos.push(`Sem coluna de patrimônio nem de preço na aba ${E(nome)}.`);
    for (let i = iHdr + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r[cAtivo] == null || String(r[cAtivo]).trim() === '') continue;
      const bruto = String(r[cAtivo]).trim();
      if (norm(bruto) === 'TOTAL' || norm(bruto).startsWith('TOTAL')) continue;
      let preco = cPre >= 0 ? num(r[cPre]) : 0;
      const qtd = cQtd >= 0 ? num(r[cQtd]) : 0;
      const valor = cPat >= 0 ? num(r[cPat]) : qtd * preco;
      if (!preco && qtd && valor) preco = valor / qtd; // Tesouro Direto na B3 vem sem preço
      posicoes.push({
        ativo: extrairTicker(bruto),
        descricao: cDesc >= 0 && r[cDesc] ? String(r[cDesc]) : bruto,
        categoria: cCat >= 0 ? String(r[cCat] || nome) : nome,
        inst: cInst >= 0 && r[cInst] ? String(r[cInst]).trim() : '',
        preco, qtd, valor, aba: nome,
      });
    }
  });
  return { posicoes, avisos, data };
}

// --- carteira alvo (aba ALVO + aba CONFIG opcional) ---
export function lerAlvo(wb, XLSX) {
  const nomeAba = wb.SheetNames.find((n) => norm(n) === 'ALVO') || wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[nomeAba], { header: 1, blankrows: false, defval: null });
  const iHdr = rows.findIndex((r) => r.some((c) => norm(c) === 'PERC_ALVO') || r.some((c) => norm(c) === 'ATIVO'));
  if (iHdr < 0) throw new Error('Aba ALVO sem cabeçalho reconhecível (esperado ATIVO e PERC_ALVO).');
  const hdr = rows[iHdr].map(norm);
  const col = (n) => hdr.indexOf(n);
  const c = {
    classe: col('CLASSE'), ativo: col('ATIVO'), nome: col('NOME'), perc: col('PERC_ALVO'),
    grupo: col('GRUPO_EQUIV'), equiv: col('EQUIVALENCIA'), alias: col('ALIAS'),
    tipoRef: col('TIPO_REFERENCIA'), valRef: col('VALOR_REFERENCIA'), obs: col('OBS'),
  };
  if (c.ativo < 0 || c.perc < 0) throw new Error('Faltam as colunas ATIVO e/ou PERC_ALVO na aba ALVO.');
  const itens = [];
  for (let i = iHdr + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const ativo = r[c.ativo];
    const classe = c.classe >= 0 ? r[c.classe] : null;
    if (!ativo || !classe) continue; // ignora TOTAL e blocos de conferência
    const p = num(r[c.perc]);
    if (!p) continue;
    itens.push({
      classe: norm(classe), ativo: String(ativo).trim(),
      nome: c.nome >= 0 && r[c.nome] ? String(r[c.nome]) : String(ativo), perc: p,
      grupo: c.grupo >= 0 && r[c.grupo] ? String(r[c.grupo]).trim() : String(ativo).trim(),
      equiv: c.equiv >= 0 ? norm(r[c.equiv]) : 'NAO',
      alias: c.alias >= 0 && r[c.alias] ? String(r[c.alias]) : '',
      tipoRef: c.tipoRef >= 0 ? norm(r[c.tipoRef]) : '',
      valRef: c.valRef >= 0 ? num(r[c.valRef]) : 0,
      obs: c.obs >= 0 && r[c.obs] ? String(r[c.obs]) : '',
    });
  }
  if (!itens.length) throw new Error('Nenhuma linha válida encontrada na aba ALVO.');
  if (itens.reduce((a, b) => a + b.perc, 0) > 1.5) itens.forEach((i) => { i.perc /= 100; }); // digitado como 2 em vez de 2%
  const config = {};
  const abaCfg = wb.SheetNames.find((n) => norm(n) === 'CONFIG');
  if (abaCfg) {
    XLSX.utils.sheet_to_json(wb.Sheets[abaCfg], { header: 1, blankrows: false, defval: null })
      .forEach((r) => { if (r && r[0] != null) config[norm(r[0])] = r[1]; });
  }
  return { itens, config };
}

// ---------------------------------------------------------------------
// instituições (filtro por corretora)
// ---------------------------------------------------------------------
export const SEM_INST = '(sem instituição)';
export const instituicoes = (pos) => [...new Set(pos.map((p) => p.inst || ''))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
// padrão: tudo que for XP; se não houver nenhuma, tudo
export function instPadrao(lista) {
  const xp = lista.filter((i) => /\bXP\b/.test(norm(i)));
  return xp.length ? xp : lista;
}
// sel = null (nunca escolheu) ou lista; ignora nomes que não existem mais no arquivo
export function instEfetiva(lista, sel) {
  if (!sel) return instPadrao(lista);
  const ok = sel.filter((i) => lista.includes(i));
  return ok.length || sel.length === 0 ? ok : instPadrao(lista);
}
export const filtrarPorInst = (pos, sel) => pos.filter((p) => sel.includes(p.inst || ''));

// ---------------------------------------------------------------------
// motor de casamento e cálculo
// ---------------------------------------------------------------------
export function calcular(posicoes, alvo, cfg) {
  const avisos = [];

  // índices de busca
  const porTicker = new Map(); const porRaiz = new Map(); const famTD = new Map();
  alvo.forEach((a) => {
    porTicker.set(norm(a.ativo), a);
    (a.alias || '').split('|').map((s) => norm(s)).filter(Boolean).forEach((al) => porTicker.set(al, a));
    const r = raiz(a.ativo); if (r && !porRaiz.has(r)) porRaiz.set(r, a);
    const td = parseTD(a.ativo); if (td && !famTD.has(td.fam)) famTD.set(td.fam, a.grupo);
  });

  // cada posição vai para um grupo do alvo
  const posPorGrupo = new Map(); const fora = [];
  posicoes.forEach((p) => {
    const chave = norm(p.ativo); const td = parseTD(p.ativo);
    let destino = null; const notas = [];
    let ref = null; let trocaClasse = false; let exato = false;

    if (td) { // título público
      let fam = td.fam;
      if (fam === 'RENDA+' && cfg.renda && famTD.has('IPCA+')) { fam = 'IPCA+'; notas.push('RENDA+ tratado como IPCA+ por opção marcada'); }
      if (famTD.has(fam)) {
        destino = famTD.get(fam);
        const irmaos = alvo.filter((a) => a.grupo === destino)
          .map((a) => ({ a, td: parseTD(a.ativo) })).filter((x) => x.td && x.td.ano);
        if (td.ano && irmaos.length) {
          irmaos.sort((x, y) => Math.abs(x.td.ano - td.ano) - Math.abs(y.td.ano - td.ano));
          ref = irmaos[0].a;
          const d = Math.abs(irmaos[0].td.ano - td.ano);
          if (d === 0) { exato = true; notas.push('vencimento idêntico ao alvo'); }
          else if (d <= cfg.janela) notas.push(`equivalente a ${ref.nome} — mesmo indexador, ${d} ano(s) de diferença no vencimento`);
          else notas.push(`mesmo indexador, mas ${d} anos distante do alvo mais próximo (${ref.nome})`);
        }
      }
    }
    if (!destino && porTicker.has(chave)) { // ticker ou alias
      ref = porTicker.get(chave); destino = ref.grupo;
      if (norm(ref.ativo) === chave) exato = true;
      else { trocaClasse = true; notas.push(`casado com ${ref.ativo} pela lista de equivalências (ALIAS)`); }
    }
    if (!destino && cfg.raizAcao) { // classes da mesma empresa
      const r = raiz(p.ativo);
      if (r && porRaiz.has(r)) {
        ref = porRaiz.get(r); destino = ref.grupo; trocaClasse = true;
        notas.push(`classe diferente do alvo ${ref.ativo} — mesma empresa, direitos distintos`);
      }
    }
    const item = { ...p, notas, ref, trocaClasse, exato };
    if (destino) {
      if (!posPorGrupo.has(destino)) posPorGrupo.set(destino, []);
      posPorGrupo.get(destino).push(item);
    } else fora.push(item);
  });

  // base de cálculo
  const patrimonio = posicoes.reduce((a, b) => a + b.valor, 0);
  const base = cfg.baseModo === 'meta' ? Math.max(0, cfg.patMeta) : patrimonio + cfg.aporte;

  // linhas: cada ativo do alvo vira uma linha; só agrupa quando há posição sem par exato
  const grupos = [];
  function montarLinha(chave, alvos, pos) {
    const percAlvo = alvos.reduce((a, b) => a + b.perc, 0);
    const atual = pos.reduce((a, b) => a + b.valor, 0);
    const preco = (() => {
      // FIX: prefere a cotação do papel exato (KLBN4), não a do equivalente (KLBN11 é unit)
      const comPreco = pos.find((p) => p.preco > 0 && p.exato) || pos.find((p) => p.preco > 0);
      if (comPreco) return { v: comPreco.preco, fonte: 'cotação do export' };
      const a = alvos.find((x) => x.tipoRef === 'PRECO_MAX' && x.valRef > 0);
      if (a) return { v: a.valRef, fonte: 'preço máximo de compra do alvo' };
      return null;
    })();
    const um = alvos.length === 1;
    grupos.push({
      chave, classe: alvos[0].classe,
      rotulo: um ? (alvos[0].ativo.length <= 16 ? alvos[0].ativo : alvos[0].nome) : chave,
      nome: um ? (alvos[0].ativo.length <= 16 ? alvos[0].nome : alvos[0].ativo) : alvos.map((a) => a.nome).join(' · '),
      equiv: alvos.length > 1,
      inclui: pos.filter((p) => !p.exato).map((p) => p.ativo),
      alvos, pos, percAlvo, atual, alvoRS: percAlvo * base, preco,
      obs: alvos.map((a) => a.obs).filter(Boolean).join(' '),
    });
  }
  [...new Set(alvo.map((a) => a.grupo))].forEach((g) => {
    const alvos = alvo.filter((a) => a.grupo === g);
    const pos = posPorGrupo.get(g) || [];
    const precisaAgrupar = alvos.length > 1 && cfg.agrupar !== 'nunca' && pos.some((p) => !p.exato);
    if (alvos.length > 1 && !precisaAgrupar) {
      alvos.forEach((a) => montarLinha(`${g}::${a.ativo}`, [a], pos.filter((p) => p.ref === a)));
      const orfas = pos.filter((p) => !p.ref);
      if (orfas.length) montarLinha(g, alvos, orfas);
    } else montarLinha(g, alvos, pos);
  });
  // posições sem alvo → sair da carteira, mas contando na classe correta
  fora.forEach((p) => grupos.push({
    chave: `__OUT__${p.ativo}`, classe: classeDaCategoria(p.categoria, p.descricao),
    rotulo: p.ativo, nome: p.categoria || '', equiv: false, inclui: [], alvos: [], pos: [p], percAlvo: 0,
    atual: p.valor, alvoRS: 0, preco: p.preco > 0 ? { v: p.preco, fonte: 'cotação do export' } : null,
    obs: '', foraDoAlvo: true,
  }));

  // diferença e ação
  grupos.forEach((g) => {
    g.percAtual = base ? g.atual / base : 0;
    g.desvio = g.percAtual - g.percAlvo; // + = acima do alvo
    g.dif = g.alvoRS - g.atual; // + = comprar
    // FIX: papel fora do alvo nunca fica "em linha" só porque é pequeno (banda morta não vale para ele)
    const semAlvo = g.foraDoAlvo && g.atual > 0.01;
    g.acao = !semAlvo && Math.abs(g.desvio) <= cfg.tol ? 'ok' : (g.dif > 0 ? 'buy' : 'sell');
    if (g.acao === 'ok') g.dif = 0;
    g.difBruta = g.dif;
  });

  // modo "só aporte": nada é vendido; o aporte vai primeiro para as CLASSES abaixo do alvo
  if (cfg.modo === 'aporte') {
    grupos.forEach((g) => { if (g.dif < 0) { g.dif = 0; g.acao = 'ok'; g.congelado = true; } });
    const cls = {};
    grupos.forEach((g) => {
      const k = g.classe; if (!cls[k]) cls[k] = { at: 0, al: 0, gs: [] };
      cls[k].at += g.atual; cls[k].al += g.percAlvo * base; cls[k].gs.push(g);
    });
    const lista = Object.values(cls);
    lista.forEach((c) => { c.def = Math.max(0, c.al - c.at); });
    const somaDef = lista.reduce((a, b) => a + b.def, 0);
    if (somaDef > 0) {
      const fatorCls = Math.min(1, cfg.aporte / somaDef);
      let alocado = 0;
      lista.forEach((c) => {
        const cota = c.def * fatorCls;
        const soma = c.gs.reduce((a, b) => a + Math.max(0, b.dif), 0);
        const f = soma > 0 ? Math.min(1, cota / soma) : 0;
        c.gs.forEach((g) => {
          g.dif = Math.max(0, g.dif) * f;
          if (g.dif < 0.01) { g.dif = 0; g.acao = 'ok'; } else alocado += g.dif;
        });
      });
      const sobra = cfg.aporte - alocado;
      if (sobra > 1) avisos.push(`Do aporte de <b>${brl(cfg.aporte)}</b>, <b>${brl(sobra)}</b> não tem destino: as classes deficitárias já foram completadas ou os ativos que faltam estão dentro da banda morta.`);
    } else if (cfg.aporte > 0) {
      avisos.push('Nenhuma classe está abaixo do alvo — no modo <b>Só aporte</b> o dinheiro não tem destino. Use o modo Rebalancear para ver as trocas necessárias.');
    }
  }

  // quantidades estimadas
  function estimarQtd(valor, preco, posArr, alvosArr, liquidar) {
    if (liquidar) { // saída total: usa a posição real
      const q = posArr.reduce((a, b) => a + (b.qtd || 0), 0);
      if (q) return q % 1 ? Math.abs(q).toFixed(2) : String(Math.abs(q));
    }
    if (!preco || !valor) return null;
    const frac = posArr.some((p) => p.qtd && p.qtd % 1 !== 0) || alvosArr.some((a) => a.tipoRef === 'TAXA');
    if (frac) return Math.abs(valor / preco.v).toFixed(2);
    // compra arredonda para baixo (não estourar o valor); venda arredonda ao inteiro mais próximo
    const n = valor > 0 ? Math.floor(valor / preco.v) : Math.round(Math.abs(valor) / preco.v);
    return n > 0 ? String(n) : null;
  }
  grupos.forEach((g) => {
    const liquidar = g.alvoRS === 0 && g.dif < 0;
    g.trocaClasse = !g.foraDoAlvo && g.pos.length > 0 && g.pos.every((p) => p.trocaClasse);
    g.qtd = (g.alvos.length > 1 || g.trocaClasse) ? null : estimarQtd(g.dif, g.preco, g.pos, g.alvos, liquidar);
    g.precoUnit = g.preco && !g.trocaClasse ? g.preco.v : null;

    // composição interna dos grupos equivalentes
    g.detalhe = [];
    if (g.equiv && g.alvos.length > 1) {
      g.alvos.forEach((a) => {
        const meus = g.pos.filter((p) => p.ref === a);
        const at = meus.reduce((x, y) => x + y.valor, 0);
        const comPx = meus.find((p) => p.preco > 0);
        const px = comPx ? { v: comPx.preco } : (a.tipoRef === 'PRECO_MAX' && a.valRef > 0 ? { v: a.valRef } : null);
        g.detalhe.push({
          rotulo: a.nome || a.ativo, atual: at, alvo: a.perc * base, dif: a.perc * base - at, px, pos: meus,
          nota: meus.map((m) => m.ativo).filter((t) => norm(t) !== norm(a.ativo)).join(', '), alvoRef: a,
        });
      });
      g.pos.filter((p) => !p.ref).forEach((p) => g.detalhe.push({
        rotulo: p.ativo, atual: p.valor, alvo: 0, dif: 0, px: null, pos: [p], nota: 'sem alvo individual neste grupo', alvoRef: null,
      }));
      if (cfg.modo === 'aporte') { // nada é vendido: compras internas escalonadas ao que o grupo recebeu
        g.detalhe.forEach((d) => { if (d.dif < 0) d.dif = 0; });
        const s = g.detalhe.reduce((a, b) => a + b.dif, 0);
        const f = s > 0 ? g.dif / s : 0;
        g.detalhe.forEach((d) => { d.dif *= f; });
      }
      g.detalhe.forEach((d) => {
        d.acao = Math.abs(d.dif) <= base * cfg.tol ? 'ok' : (d.dif > 0 ? 'buy' : 'sell');
        if (d.acao === 'ok') d.dif = 0;
        d.qtd = d.dif ? estimarQtd(d.dif, d.px, d.pos, d.alvoRef ? [d.alvoRef] : [], false) : null;
      });
    }
  });

  // avisos
  if (cfg.baseModo === 'meta' && cfg.modo !== 'aporte') {
    const falta = base - patrimonio;
    if (falta > 1) avisos.push(`Plano de <b>${brl(base)}</b> contra <b>${brl(patrimonio)}</b> investidos: executar tudo exige aporte líquido de <b>${brl(falta)}</b>.`);
    else if (falta < -1) avisos.push(`Você já tem <b>${brl(patrimonio)}</b>, acima do plano de <b>${brl(base)}</b>. As ordens abaixo devolvem <b>${brl(-falta)}</b> ao caixa.`);
  }
  const soma = alvo.reduce((a, b) => a + b.perc, 0);
  if (Math.abs(soma - 1) > 0.0005) avisos.push(`A soma dos percentuais da carteira-alvo é <b>${pct(soma)}</b>, não 100%. Os valores-alvo saem proporcionalmente errados.`);
  posicoes.filter((p) => p.valor < 0).forEach((p) => avisos.push(`<b>${E(p.ativo)}</b> tem patrimônio negativo (${brl(p.valor)}) no export — provável resíduo de incorporação ou erro de lançamento. Confira na corretora.`));
  grupos.filter((g) => g.dif && !g.preco).forEach((g) => avisos.push(`<b>${E(g.rotulo)}</b>: sem cotação no export e sem preço de referência no alvo — o valor em reais está calculado, mas a quantidade não.`));
  grupos.forEach((g) => {
    const pmax = g.alvos.find((a) => a.tipoRef === 'PRECO_MAX' && a.valRef > 0);
    const cot = g.pos.find((p) => p.preco > 0 && p.exato);
    if (pmax && cot && !g.trocaClasse && cot.preco > pmax.valRef && g.dif > 0) {
      avisos.push(`<b>${E(g.rotulo)}</b> cotado a ${brl(cot.preco)}, acima do preço máximo de compra do alvo (${brl(pmax.valRef)}).`);
    }
    if (g.alvos.some((a) => a.tipoRef === 'EM_REVISAO') && g.dif > 0) {
      avisos.push(`<b>${E(g.rotulo)}</b> está <b>em revisão</b> na Finclass — sem preço máximo de compra definido.`);
    }
  });
  grupos.filter((g) => g.trocaClasse && g.dif).forEach((g) => avisos.push(`<b>${E(g.rotulo)}</b>: você tem ${E(g.pos.map((p) => p.ativo).join(', '))}, o alvo pede ${E(g.alvos.map((a) => a.ativo).join(', '))}. Cotações não comparáveis — o valor em reais vale, a quantidade não foi estimada.`));
  grupos.forEach((g) => g.pos.forEach((p) => p.notas.forEach((n) => {
    if (/equival|classe diferente|ALIAS|RENDA/.test(n)) avisos.push(`<b>${E(p.ativo)}</b> → ${E(g.rotulo)}: ${E(n)}.`);
  })));

  return { grupos, patrimonio, base, avisos: [...new Set(avisos)] };
}

// ---------------------------------------------------------------------
// plano em CSV (separador ; e BOM para abrir direto no Excel)
// ---------------------------------------------------------------------
export function paraCsv(res) {
  const v = (x) => x.toFixed(2).replace('.', ',');
  const l = [['CLASSE', 'ATIVO', 'VALOR_ATUAL', 'PERC_ATUAL', 'VALOR_ALVO', 'PERC_ALVO', 'DESVIO_PP', 'ACAO', 'VALOR_ORDEM', 'QTD_ESTIMADA']];
  res.grupos.filter((g) => g.dif || g.atual).forEach((g) => l.push([
    NOME_CLASSE[g.classe] || g.classe, g.rotulo, v(g.atual), v(g.percAtual * 100), v(g.alvoRS), v(g.percAlvo * 100),
    v(g.desvio * 100), g.acao === 'buy' ? 'COMPRAR' : g.acao === 'sell' ? 'VENDER' : 'MANTER', v(Math.abs(g.dif)), g.qtd || '',
  ]));
  return `﻿${l.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n')}`;
}
