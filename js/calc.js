// =====================================================================
// NOSSOS GASTOS — regras de cálculo (sem acesso a banco / tela)
// =====================================================================

export const PESSOAS = ['FELIPE', 'MARIANA'];
export const NOME = { FELIPE: 'Felipe', MARIANA: 'Mariana' };
export const outro = (p) => (p === 'FELIPE' ? 'MARIANA' : 'FELIPE');

export const TIPOS_CASAL = [
  'MERCADO', 'DELIVERY', 'RESTAURANTE', 'GASOLINA', 'LAZER', 'VIAGEM',
  'FARMÁCIA', 'ASSINATURAS', 'CASA', 'PET', 'PRESENTES', 'SAÚDE', 'OUTROS',
];
export const TIPOS_GASTO_PESSOAL = [
  'ROUPAS', 'SAÚDE', 'ACADEMIA', 'CARRO', 'EDUCAÇÃO', 'BELEZA', 'LAZER',
  'TRANSPORTE', 'CELULAR', 'INVESTIMENTO', 'OUTROS',
];
export const TIPOS_GANHO = ['SALÁRIO', 'FREELA', 'EXTRA', 'RENDIMENTO', 'REEMBOLSO', 'OUTROS'];

export const CONTAS_MORADIA = [
  { id: 'ALUGUEL',    nome: 'Aluguel',    unidade: null,  fixa: true },
  { id: 'CONDOMINIO', nome: 'Condomínio', unidade: null,  fixa: true },
  { id: 'INTERNET',   nome: 'Internet',   unidade: null,  fixa: true },
  { id: 'AGUA',       nome: 'Água',       unidade: 'm³',  fixa: false },
  { id: 'ENERGIA',    nome: 'Energia',    unidade: 'kWh', fixa: false },
  { id: 'GAS',        nome: 'Gás',        unidade: 'm³',  fixa: false },
];

// ---------- dinheiro ----------
export const r2 = (x) => Math.round((Number(x) + Number.EPSILON) * 100) / 100;
const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const brl = (x) => fmtBRL.format(r2(x || 0));
export const num = (x, d = 1) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: d }).format(Number(x) || 0);

// ---------- meses (sempre 'AAAA-MM-01') ----------
export function mesAtual(hoje = new Date()) {
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;
}
export function somaMes(mes, n) {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
export function difMeses(de, ate) {
  const [a1, m1] = de.split('-').map(Number);
  const [a2, m2] = ate.split('-').map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
}
const NOMES_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export function nomeMes(mes, curto = false) {
  const [a, m] = mes.split('-').map(Number);
  const n = NOMES_MES[m - 1];
  return curto ? `${n.slice(0, 3)}/${String(a).slice(2)}` : `${n} de ${a}`;
}
export const cap = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
export const mesParaInput = (mes) => (mes ? mes.slice(0, 7) : '');
export function inputParaMes(v) {
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-01`;
  m = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}-01`;
  return null;
}
export function listaMeses(fim, qtd) {
  const out = [];
  for (let i = qtd - 1; i >= 0; i--) out.push(somaMes(fim, -i));
  return out;
}

// ---------- valor digitado: aceita conta (ex.: 671,61-25,16-5) ----------
export function avaliarValor(texto) {
  const bruto = String(texto ?? '').trim().replace(/^=/, '');
  if (!bruto) return { ok: false, erro: 'Informe o valor' };
  if (!/^[\d\s.,+\-*/()]+$/.test(bruto)) return { ok: false, erro: 'Use só números e + - * / ( )' };
  const tokens = bruto.match(/\d[\d.,]*|[+\-*/()]/g) || [];
  let i = 0;
  const numero = (t) => {
    const s = t.replace(/,/g, '.');
    if ((s.match(/\./g) || []).length > 1) throw new Error('Não use separador de milhar');
    return parseFloat(s);
  };
  const expr = () => {
    let v = termo();
    while (tokens[i] === '+' || tokens[i] === '-') {
      const op = tokens[i++]; const d = termo();
      v = op === '+' ? v + d : v - d;
    }
    return v;
  };
  const termo = () => {
    let v = fator();
    while (tokens[i] === '*' || tokens[i] === '/') {
      const op = tokens[i++]; const d = fator();
      if (op === '/' && d === 0) throw new Error('Divisão por zero');
      v = op === '*' ? v * d : v / d;
    }
    return v;
  };
  const fator = () => {
    const t = tokens[i++];
    if (t === '-') return -fator();
    if (t === '+') return fator();
    if (t === '(') { const v = expr(); if (tokens[i++] !== ')') throw new Error('Parêntese sem fechar'); return v; }
    if (t && /^\d/.test(t)) return numero(t);
    throw new Error('Conta incompleta');
  };
  try {
    const v = expr();
    if (i !== tokens.length || !Number.isFinite(v)) throw new Error('Conta inválida');
    const valor = r2(v);
    const ehConta = /[+\-*/()]/.test(bruto.replace(/^-/, ''));
    return { ok: true, valor, expressao: ehConta ? bruto : null };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
}

// ---------- parceladas ----------
export function parcelaAtiva(p, mes) {
  return p.mes_inicio <= mes && (!p.mes_fim || mes <= p.mes_fim);
}
export function infoParcela(p, mes) {
  const atual = difMeses(p.mes_inicio, mes) + 1;
  const total = p.mes_fim ? difMeses(p.mes_inicio, p.mes_fim) + 1 : null;
  return { atual, total, recorrente: !p.mes_fim };
}

// ---------- junta tudo que entra no acerto do mês ----------
// origem: COMPARTILHADO (50/50) | PARA_OUTRO (integral) | PARCELADA (50/50 ou integral)
export function itensDoMes(lancamentos, parceladas, mes) {
  const itens = lancamentos
    .filter((l) => l.mes === mes)
    .map((l) => ({
      origem: l.categoria,
      tipo: l.tipo,
      descricao: l.descricao,
      valor: Number(l.valor),
      pagador: l.pagador,
      divisao: l.categoria === 'COMPARTILHADO' ? '50/50' : 'INTEGRAL',
      ref: l,
    }));
  for (const p of parceladas) {
    if (!parcelaAtiva(p, mes)) continue;
    itens.push({
      origem: 'PARCELADA',
      tipo: p.tipo,
      descricao: p.descricao,
      valor: Number(p.valor),
      pagador: p.pagador,
      divisao: p.divisao,
      ref: p,
    });
  }
  return itens;
}

// Quanto quem NÃO pagou deve para quem pagou
export const parteDoOutro = (it) => (it.divisao === '50/50' ? it.valor / 2 : it.valor);

// Custo real de uma pessoa num item
export function custoDe(it, pessoa) {
  if (it.divisao === '50/50') return it.valor / 2;
  return it.pagador === pessoa ? 0 : it.valor;
}

// Resultado do acerto: créditos de cada um e a transferência final
export function acerto(itens) {
  const receber = { FELIPE: 0, MARIANA: 0 };   // quanto cada um tem a receber
  const pagou = { FELIPE: 0, MARIANA: 0 };
  for (const it of itens) {
    receber[it.pagador] += parteDoOutro(it);
    pagou[it.pagador] += it.valor;
  }
  const saldo = r2(receber.FELIPE - receber.MARIANA); // >0 Mariana paga Felipe
  return {
    receber: { FELIPE: r2(receber.FELIPE), MARIANA: r2(receber.MARIANA) },
    pagou: { FELIPE: r2(pagou.FELIPE), MARIANA: r2(pagou.MARIANA) },
    total: r2(pagou.FELIPE + pagou.MARIANA),
    transferencia: transferenciaDe(saldo),
  };
}
export function transferenciaDe(saldo) {
  const s = r2(saldo);
  if (s === 0) return { de: null, para: null, valor: 0, saldo: 0 };
  return s > 0
    ? { de: 'MARIANA', para: 'FELIPE', valor: s, saldo: s }
    : { de: 'FELIPE', para: 'MARIANA', valor: -s, saldo: s };
}

export function resumoPorOrigem(itens) {
  const base = () => ({ total: 0, FELIPE: 0, MARIANA: 0, qtd: 0 });
  const out = { COMPARTILHADO: base(), PARA_OUTRO: base(), PARCELADA: base() };
  for (const it of itens) {
    const o = out[it.origem];
    o.total += it.valor; o[it.pagador] += it.valor; o.qtd++;
  }
  for (const k in out) for (const c of ['total', 'FELIPE', 'MARIANA']) out[k][c] = r2(out[k][c]);
  return out;
}

export function porTipo(itens, campoValor = (it) => it.valor) {
  const mapa = new Map();
  for (const it of itens) mapa.set(it.tipo, (mapa.get(it.tipo) || 0) + campoValor(it));
  const total = [...mapa.values()].reduce((a, b) => a + b, 0);
  return [...mapa.entries()]
    .map(([tipo, valor]) => ({ tipo, valor: r2(valor), pct: total ? valor / total : 0 }))
    .filter((x) => x.valor > 0)
    .sort((a, b) => b.valor - a.valor);
}

// ---------- moradia (tudo 50/50) ----------
export function moradiaDoMes(moradia, mes) {
  return moradia.filter((m) => m.mes === mes);
}
export function acertoMoradia(linhas) {
  const itens = linhas.map((m) => ({
    origem: 'MORADIA', tipo: m.conta, valor: Number(m.valor), pagador: m.pagador, divisao: '50/50',
  }));
  return acerto(itens);
}

// ---------- visão da pessoa (área pessoal) ----------
export function custoPessoalDoCasal(itens, linhasMoradia, pessoa) {
  const casal = r2(itens.reduce((a, it) => a + custoDe(it, pessoa), 0));
  const moradia = r2(linhasMoradia.reduce((a, m) => a + Number(m.valor) / 2, 0));
  return { casal, moradia };
}

// ---------- histórico: total do mês = 50/50 + para o outro + parcelas ----------
export function totalGastosMes(lancamentos, parceladas, legado, mes) {
  // mês da planilha sem lançamentos no site: vale o total da planilha (já inclui as parcelas)
  const l = legado.find((h) => h.mes === mes);
  const temLanc = lancamentos.some((x) => x.mes === mes);
  if (l && !temLanc) return { total: r2(Number(l.total)), fonte: 'planilha', itens: [] };
  const itens = itensDoMes(lancamentos, parceladas, mes);
  if (itens.length) return { total: r2(itens.reduce((a, it) => a + it.valor, 0)), fonte: 'site', itens };
  return { total: 0, fonte: 'vazio', itens: [] };
}
