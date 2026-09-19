// =====================================================================
// NOSSOS GASTOS — aplicação (tela + Supabase)
// =====================================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import * as C from './calc.js?v=3';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ABAS = ['acerto', 'lancar', 'moradia', 'historico', 'eu'];
const S = {
  user: null,
  perfil: null,
  mes: C.mesAtual(),
  aba: 'acerto',
  d: { lancamentos: [], parceladas: [], moradia: [], legado: [], pessoais: [] },
  edit: { lanc: null, parc: null },
  f: { cat: 'COMPARTILHADO', pagador: 'FELIPE', div: '50/50', fim: 'REC', nat: 'GASTO', grafMor: 'ENERGIA', periodo: '12', morMes: null },
  charts: [],
  ultimaCarga: 0,
};

// ---------------------------------------------------------------------
// utilidades
// ---------------------------------------------------------------------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const normTipo = (t) => String(t || '').trim().toLocaleUpperCase('pt-BR');
const nomeConta = (id) => C.CONTAS_MORADIA.find((c) => c.id === id)?.nome || id;

let toastTimer;
function toast(msg, erro = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('erro', erro);
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), erro ? 4500 : 2200);
}
function carregando(on, texto = 'Carregando…') {
  const el = $('#carregando');
  el.textContent = texto;
  el.hidden = !on;
}
function falha(e, contexto) {
  console.error(contexto, e);
  const msg = e?.message || String(e);
  toast(`${contexto}: ${msg}`, true);
}

const PALETA = ['#3E8E5E', '#C98406', '#1F6F8B', '#B8426F', '#6B5CA5', '#2E9C9C', '#8C6D1F',
  '#9E3D5C', '#5A7D2B', '#4C5FD5', '#A36A9E', '#7A5230', '#8A8FA3', '#D0672F'];
const COR_FIXA = {
  MERCADO: '#3E8E5E', DELIVERY: '#C98406', RESTAURANTE: '#D0672F', GASOLINA: '#7A5230', LAZER: '#6B5CA5',
  VIAGEM: '#2E9C9C', 'FARMÁCIA': '#9E3D5C', ASSINATURAS: '#4C5FD5', CASA: '#8C6D1F', PET: '#5A7D2B',
  PRESENTES: '#A36A9E', 'SAÚDE': '#B8426F', OUTROS: '#8A8FA3',
  ALUGUEL: '#1F6F8B', CONDOMINIO: '#6B5CA5', INTERNET: '#2E9C9C', AGUA: '#4C5FD5', ENERGIA: '#C98406', GAS: '#D0672F',
  'CASAL (DIA A DIA)': '#1F6F8B', 'ACERTO DO CASAL': '#1F6F8B', 'CONDOMÍNIO': '#6B5CA5', 'CONTAS DA MORADIA': '#C98406', MORADIA: '#6B5CA5', 'PLANILHA (SEM DETALHE)': '#B9C2BF',
};
function corTipo(t) {
  if (COR_FIXA[t]) return COR_FIXA[t];
  let h = 0;
  for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETA[h % PALETA.length];
}
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

// ---------------------------------------------------------------------
// banco
// ---------------------------------------------------------------------
async function buscarTudo(tabela, ordem = 'id') {
  const out = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb.from(tabela).select('*').order(ordem).range(de, de + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}
async function carregarTudo() {
  const [lancamentos, parceladas, moradia, legado, pessoais] = await Promise.all([
    buscarTudo('lancamentos'), buscarTudo('parceladas'), buscarTudo('moradia'),
    buscarTudo('historico_legado', 'mes'), buscarTudo('pessoais'),
  ]);
  S.d = { lancamentos, parceladas, moradia, legado, pessoais };
  S.ultimaCarga = Date.now();
}
async function recarregar(tabela) {
  const mapa = { lancamentos: 'lancamentos', parceladas: 'parceladas', moradia: 'moradia', pessoais: 'pessoais' };
  S.d[mapa[tabela]] = await buscarTudo(tabela);
  S.ultimaCarga = Date.now();
}

// ---------------------------------------------------------------------
// login
// ---------------------------------------------------------------------
async function iniciar() {
  if (SUPABASE_URL.includes('SEU-PROJETO')) {
    carregando(true, 'Configure js/config.js com a URL e a chave do Supabase.');
    return;
  }
  const { data } = await sb.auth.getSession();
  if (data.session) await entrarNoApp(data.session.user);
  else mostrarLogin();

  sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') mostrarLogin(); });
}
function mostrarLogin() {
  S.user = null; S.perfil = null;
  carregando(false);
  $('#tela-app').hidden = true;
  $('#tela-login').hidden = false;
}
$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const btn = $('button[type=submit]', e.target);
  btn.disabled = true;
  $('#login-erro').textContent = '';
  const { data, error } = await sb.auth.signInWithPassword({ email: fd.get('email').trim(), password: fd.get('senha') });
  btn.disabled = false;
  if (error) {
    $('#login-erro').textContent = error.message.includes('Invalid login') ? 'E-mail ou senha incorretos.' : error.message;
    return;
  }
  await entrarNoApp(data.user);
});
$('#btn-sair').addEventListener('click', async () => { await sb.auth.signOut(); });

async function entrarNoApp(user) {
  carregando(true);
  S.user = user;
  const { data: perfil, error } = await sb.from('perfis').select('*').eq('id', user.id).maybeSingle();
  if (error || !perfil) {
    carregando(false);
    $('#tela-login').hidden = false;
    $('#login-erro').textContent = 'Este login ainda não está ligado ao Felipe ou à Mariana. Rode o arquivo 02_vincular_usuarios.sql no Supabase.';
    await sb.auth.signOut();
    return;
  }
  S.perfil = perfil;
  S.f.pagador = perfil.pessoa;
  try { await carregarTudo(); } catch (e) { falha(e, 'Erro ao carregar'); }
  $('#tela-login').hidden = true;
  $('#tela-app').hidden = false;
  const chip = $('#usuario-nome');
  chip.textContent = perfil.nome;
  chip.className = `chip-pessoa p-${perfil.pessoa}`;
  const h = location.hash.replace('#', '');
  if (ABAS.includes(h)) S.aba = h;
  else if (h === 'parceladas') S.aba = 'lancar';
  carregando(false);
  render();
}

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !S.perfil) return;
  if (Date.now() - S.ultimaCarga < 30000) return;
  try { await carregarTudo(); render(); } catch (e) { /* silencioso */ }
});

// ---------------------------------------------------------------------
// render geral
// ---------------------------------------------------------------------
function render() {
  S.charts.forEach((c) => c.destroy());
  S.charts = [];
  $('#mes-nome').textContent = C.cap(C.nomeMes(S.mes));
  $$('.abas button').forEach((b) => b.setAttribute('aria-current', b.dataset.aba === S.aba ? 'page' : 'false'));
  const v = $('#view');
  const fn = { acerto: vAcerto, lancar: vLancar, moradia: vMoradia, historico: vHistorico, eu: vEu }[S.aba];
  v.innerHTML = fn();
  atualizarDependentes(v);
  const pos = { acerto: gAcerto, moradia: gMoradia, historico: gHistorico, eu: gEu }[S.aba];
  if (pos && window.Chart) { configurarChart(); pos(); }
  if (S.aba === 'lancar') previaParc($('[data-form=lanc]'));
}

function irPara(aba) {
  S.aba = aba;
  history.replaceState(null, '', `#${aba}`);
  render();
  window.scrollTo({ top: 0 });
}

// ---------- blocos reutilizáveis ----------
const seg = (k, opcoes) => `
  <div class="segmentado" data-grupo="${k}">
    ${opcoes.map(([v, t]) => `<button type="button" data-acao="set" data-k="${k}" data-v="${esc(v)}" aria-pressed="${S.f[k] === v}">${esc(t)}</button>`).join('')}
  </div>`;
const pagadorBtns = (k, mini = false) => `
  <div class="pagador${mini ? ' mini' : ''}" data-grupo="${k}">
    ${C.PESSOAS.map((p) => `<button type="button" data-acao="set" data-k="${k}" data-v="${p}" data-p="${p}" aria-pressed="${S.f[k] === p}">${C.NOME[p]}</button>`).join('')}
  </div>`;
const chips = (alvo, lista, quando = '') => `
  <div class="chips" ${quando ? `data-quando="${quando}"` : ''}>
    ${lista.map((t) => `<button type="button" data-acao="chip" data-alvo="${alvo}" data-v="${esc(t)}">${esc(t.charAt(0) + t.slice(1).toLowerCase())}</button>`).join('')}
  </div>`;
function datalist(id, base, usados) {
  const todos = [...new Set([...base, ...usados.map(normTipo)])].filter(Boolean);
  return `<datalist id="${id}">${todos.map((t) => `<option value="${esc(t)}">`).join('')}</datalist>`;
}
const campoValor = (nome, valorInicial = '', dica = 'pode digitar a conta: 671,61-25,16') => `
  <label><span>Valor <span class="campo-dica">${dica}</span></span>
    <input type="text" name="${nome}" data-previa required autocomplete="off" placeholder="0,00" value="${esc(valorInicial)}">
  </label>
  <p class="previa"></p>`;
const valorParaCampo = (reg) => (reg.expressao ? reg.expressao : String(reg.valor).replace('.', ','));

function atualizarDependentes(raiz = document) {
  $$('[data-quando]', raiz).forEach((el) => {
    const [k, v] = el.dataset.quando.split('=');
    el.hidden = String(S.f[k]) !== v;
  });
}

// =====================================================================
// ABA: ACERTO (moradia NÃO entra: cada um paga a sua metade)
// =====================================================================
function dadosDoMes(mes = S.mes) {
  const itens = C.itensDoMes(S.d.lancamentos, S.d.parceladas, mes);
  const mor = C.moradiaDoMes(S.d.moradia, mes);
  const a = C.acerto(itens);
  const geral = a.transferencia;
  return { itens, mor, a, geral };
}
const frase = (t) => (t.valor === 0 ? 'ninguém deve nada' : `${C.NOME[t.de]} passa ${C.brl(t.valor)} para ${C.NOME[t.para]}`);
const ORIGEM_TXT = { COMPARTILHADO: '50/50', PARA_OUTRO: 'comprou para o outro', PARCELADA: 'parcela' };

function vAcerto() {
  const { itens, a, geral } = dadosDoMes();
  const ro = C.resumoPorOrigem(itens);
  // quanto cada um deve ao outro antes de compensar
  const marDeve = a.receber.FELIPE;   // parte da Mariana no que o Felipe pagou
  const felDeve = a.receber.MARIANA;  // parte do Felipe no que a Mariana pagou

  let heroi;
  if (!itens.length) {
    heroi = `<p class="heroi-zerado">Nada lançado em ${C.nomeMes(S.mes)}.</p>
      <button class="btn btn-cheio" data-acao="aba" data-v="lancar">Lançar o primeiro gasto</button>`;
  } else if (geral.valor === 0) {
    heroi = '<p class="heroi-zerado">Tudo empatado, ninguém deve nada.</p>';
  } else {
    heroi = `<div class="acerto-frase" style="--cor-de: var(--${geral.de.toLowerCase()}); --cor-para: var(--${geral.para.toLowerCase()})">
        <span class="nome-grande de p-${geral.de}">${C.NOME[geral.de]}</span>
        <div class="seta" aria-hidden="true"></div>
        <strong class="valor-acerto">${C.brl(geral.valor)}</strong>
        <span class="nome-grande para p-${geral.para}">${C.NOME[geral.para]}</span>
      </div>
      <p class="heroi-legenda"><strong>No fechamento do mês, ${C.NOME[geral.de]} paga ${C.brl(geral.valor)} para ${C.NOME[geral.para]}.</strong></p>`;
  }

  const contaAcerto = itens.length ? `
    <div class="conta-acerto">
      <p class="rot">Como chegamos nesse valor</p>
      <div class="ln"><span>Mariana deve ao Felipe</span><span class="col-m">${C.brl(marDeve)}</span></div>
      <div class="ln"><span>Felipe deve à Mariana</span><span class="col-f">− ${C.brl(felDeve)}</span></div>
      <div class="ln res"><span>${geral.valor ? `${C.NOME[geral.de]} paga para ${C.NOME[geral.para]}` : 'Diferença'}</span><span>${C.brl(geral.valor)}</span></div>
    </div>` : '';

  const linha = (nome, o) => `<tr><td>${nome}</td><td class="n col-f">${C.brl(o.FELIPE)}</td><td class="n col-m">${C.brl(o.MARIANA)}</td><td class="n">${C.brl(o.total)}</td></tr>`;
  const tipos = C.porTipo(itens);
  const ordenados = [...itens].sort((x, y) => (x.pagador === y.pagador ? y.valor - x.valor : x.pagador < y.pagador ? -1 : 1));
  const linhaItem = (it) => {
    const dev = C.outro(it.pagador);
    return `<tr><td>${esc(it.descricao || it.tipo)}<span class="selo">${ORIGEM_TXT[it.origem]}</span></td>
      <td class="${it.pagador === 'FELIPE' ? 'col-f' : 'col-m'}">${C.NOME[it.pagador]}</td>
      <td class="n">${C.brl(it.valor)}</td>
      <td class="n ${dev === 'FELIPE' ? 'col-f' : 'col-m'}">${C.NOME[dev]} deve ${C.brl(C.parteDoOutro(it))}</td></tr>`;
  };

  return `
  <section class="heroi">
    <p class="heroi-rotulo">Acerto de ${C.nomeMes(S.mes)}</p>
    ${heroi}
    ${contaAcerto}
    <p class="nota nota-moradia">Moradia não entra no acerto: cada um paga a sua metade.</p>
  </section>

  ${itens.length ? `
  <section class="bloco">
    <details class="detalhe">
      <summary>Item a item: quem deve o quê</summary>
      <div class="tabela-wrap"><table>
        <thead><tr><th>Item</th><th>Pagou</th><th class="n">Valor</th><th class="n">Quem deve</th></tr></thead>
        <tbody>${ordenados.map(linhaItem).join('')}
          <tr class="total"><td colspan="3">Mariana deve ao Felipe</td><td class="n col-m">${C.brl(marDeve)}</td></tr>
          <tr class="total"><td colspan="3">Felipe deve à Mariana</td><td class="n col-f">${C.brl(felDeve)}</td></tr>
          <tr class="total"><td colspan="3">Resultado</td><td class="n">${frase(geral)}</td></tr>
        </tbody>
      </table></div>
    </details>
  </section>` : ''}

  <section class="bloco">
    <h2>Quem pagou o quê</h2>
    <div class="tabela-wrap"><table>
      <thead><tr><th></th><th class="n">Felipe pagou</th><th class="n">Mariana pagou</th><th class="n">Total</th></tr></thead>
      <tbody>
        ${linha('Divididos 50/50', ro.COMPARTILHADO)}
        ${linha('Compras para o outro', ro.PARA_OUTRO)}
        ${linha('Parceladas e fixas', ro.PARCELADA)}
        <tr class="total"><td>Total</td><td class="n col-f">${C.brl(a.pagou.FELIPE)}</td><td class="n col-m">${C.brl(a.pagou.MARIANA)}</td><td class="n">${C.brl(a.total)}</td></tr>
      </tbody>
    </table></div>
  </section>

  <section class="bloco">
    <div class="bloco-cab"><h2>Para onde foi o dinheiro</h2><span class="nota">gastos do mês, sem moradia</span></div>
    ${tipos.length ? `
    <div class="pizza-lado">
      <div class="grafico"><canvas id="g-tipos"></canvas></div>
      ${legendaTipos(tipos)}
    </div>` : '<p class="vazio">Sem gastos neste mês.</p>'}
  </section>`;
}
function legendaTipos(tipos) {
  return `<ul class="legenda-tipos">${tipos.map((t) => `
    <li><span class="bola" style="background:${corTipo(t.tipo)}"></span><span>${esc(t.tipo)}</span>
    <span>${C.brl(t.valor)}</span><span class="pct">${C.num(t.pct * 100, 1)}%</span></li>`).join('')}</ul>`;
}
function gAcerto() {
  const tipos = C.porTipo(dadosDoMes().itens);
  if (tipos.length) pizza('g-tipos', tipos);
}

// =====================================================================
// LANÇAR — um só formulário: 50/50, para o outro ou parcelado/fixo
// =====================================================================
function vLancar() {
  const edL = S.edit.lanc ? S.d.lancamentos.find((l) => l.id === S.edit.lanc) : null;
  const edP = S.edit.parc ? S.d.parceladas.find((p) => p.id === S.edit.parc) : null;
  const ed = edL || edP;
  const doMes = S.d.lancamentos.filter((l) => l.mes === S.mes);
  const ps = S.d.parceladas;
  const ativas = ps.filter((p) => C.parcelaAtiva(p, S.mes));
  const futuras = ps.filter((p) => p.mes_inicio > S.mes);
  const fim = ps.filter((p) => p.mes_fim && p.mes_fim < S.mes);
  const inicio = edP ? edP.mes_inicio : S.mes;

  const opcoes = edP ? [['PARCELA', 'Parcelado / fixo']]
    : edL ? [['COMPARTILHADO', 'Dividir 50/50'], ['PARA_OUTRO', 'Comprei p/ o outro']]
      : [['COMPARTILHADO', 'Dividir 50/50'], ['PARA_OUTRO', 'Comprei p/ o outro'], ['PARCELA', 'Parcelado / fixo']];

  const totais = (lista) => {
    const tot = { FELIPE: 0, MARIANA: 0 };
    lista.forEach((l) => { tot[l.pagador] += Number(l.valor); });
    return `<span class="grupo-tot"><span class="col-f">Felipe ${C.brl(tot.FELIPE)}</span> &nbsp; <span class="col-m">Mariana ${C.brl(tot.MARIANA)}</span></span>`;
  };
  const grupo = (cat, titulo) => {
    const lista = doMes.filter((l) => l.categoria === cat).sort((x, y) => (x.criado_em < y.criado_em ? 1 : -1));
    return `
    <div class="grupo">
      <div class="grupo-cab"><h3>${titulo}</h3>${totais(lista)}</div>
      ${lista.length ? `<ul class="lista">${lista.map(itemLanc).join('')}</ul>` : '<p class="vazio">Nenhum lançamento.</p>'}
    </div>`;
  };

  return `
  <div class="duas duas-form">
    <form class="bloco form" data-form="lanc">
      <h2>${ed ? 'Editar lançamento' : 'Novo lançamento'}</h2>
      <div><span class="rotulo">O que é</span>${seg('cat', opcoes)}</div>
      <p class="nota" data-quando="cat=COMPARTILHADO">Cada um paga metade. Vale só para este mês.</p>
      <p class="nota" data-quando="cat=PARA_OUTRO">Quem não pagou devolve o valor inteiro.</p>
      <p class="nota" data-quando="cat=PARCELA">Compra parcelada ou conta fixa: entra sozinha nos meses seguintes.</p>
      <label>Tipo
        <input type="text" name="tipo" id="lanc-tipo" list="dl-tipos" required autocomplete="off" value="${esc(ed?.tipo || '')}">
      </label>
      ${chips('lanc-tipo', C.TIPOS_CASAL)}
      ${datalist('dl-tipos', C.TIPOS_CASAL, [...S.d.lancamentos.map((l) => l.tipo), ...ps.map((p) => p.tipo)])}
      <label><span>Descrição <span class="campo-dica" data-quando="cat=COMPARTILHADO">opcional</span><span class="campo-dica" data-quando="cat=PARA_OUTRO">opcional</span></span>
        <input type="text" name="descricao" autocomplete="off" value="${esc(ed?.descricao || '')}">
      </label>
      ${campoValor('valor', edL ? valorParaCampo(edL) : edP ? String(edP.valor).replace('.', ',') : '', 'pode digitar a conta: 671,61-25,16')}
      <p class="nota" data-quando="cat=PARCELA">No parcelado, informe o valor de UMA parcela (pode digitar 1100/10).</p>
      <div><span class="rotulo">Quem pagou</span>${pagadorBtns('pagador')}</div>

      <div class="form" data-quando="cat=PARCELA">
        <div><span class="rotulo">Como fica</span>${seg('div', [['50/50', 'Dividir 50/50'], ['INTEGRAL', 'O outro paga tudo']])}</div>
        <label>Primeira parcela em <input type="month" name="inicio" value="${C.mesParaInput(inicio)}"></label>
        <div><span class="rotulo">Termina</span>${seg('fim', [['REC', 'Fixo todo mês'], ['QTD', 'Nº de parcelas'], ['MES', 'Em um mês']])}</div>
        <label data-quando="fim=QTD">Quantidade de parcelas <input type="number" name="qtd" min="1" max="360" step="1" value="${edP?.mes_fim ? C.difMeses(edP.mes_inicio, edP.mes_fim) + 1 : ''}"></label>
        <label data-quando="fim=MES">Última parcela em <input type="month" name="fim" value="${C.mesParaInput(edP?.mes_fim || '')}"></label>
        <p class="nota" id="parc-previa"></p>
      </div>

      <div class="acoes">
        <button type="submit" class="btn btn-cheio">${ed ? 'Salvar alteração' : 'Salvar'}</button>
        ${ed ? '<button type="button" class="btn" data-acao="cancelar-edicao">Cancelar</button>' : ''}
      </div>
    </form>

    <section class="bloco">
      <div class="bloco-cab"><h2>Lançados em ${C.nomeMes(S.mes)}</h2><span class="nota">${doMes.length + ativas.length} ${doMes.length + ativas.length === 1 ? 'item' : 'itens'}</span></div>
      ${grupo('COMPARTILHADO', 'Divididos 50/50')}
      ${grupo('PARA_OUTRO', 'Compras para o outro')}
      <div class="grupo">
        <div class="grupo-cab"><h3>Parceladas e fixas</h3>${totais(ativas)}</div>
        ${ativas.length ? `<ul class="lista">${ativas.map((p) => itemParc(p, true)).join('')}</ul>` : '<p class="vazio">Nenhuma parcela neste mês.</p>'}
      </div>
      ${futuras.length ? `<div class="grupo"><h3>Começam depois</h3><ul class="lista">${futuras.map((p) => itemParc(p)).join('')}</ul></div>` : ''}
      ${fim.length ? `<div class="grupo"><h3>Já terminaram</h3><ul class="lista">${fim.map((p) => itemParc(p)).join('')}</ul></div>` : ''}
    </section>
  </div>`;
}
function itemLanc(l) {
  return `<li>
    <span class="barra p-${l.pagador}"></span>
    <div><div class="titulo">${esc(l.descricao || l.tipo)}${l.descricao ? `<span class="selo">${esc(l.tipo)}</span>` : ''}</div>
      <div class="sub">${C.NOME[l.pagador]} pagou${l.expressao ? ` · ${esc(l.expressao)}` : ''}</div></div>
    <span class="valor">${C.brl(l.valor)}</span>
    <span class="ops">
      <button type="button" data-acao="editar-lanc" data-id="${l.id}" title="Editar" aria-label="Editar">✎</button>
      <button type="button" data-acao="excluir-lanc" data-id="${l.id}" title="Excluir" aria-label="Excluir">✕</button>
    </span>
  </li>`;
}
async function salvarLanc(form) {
  const fd = new FormData(form);
  const v = C.avaliarValor(fd.get('valor'));
  if (!v.ok) return toast(v.erro, true);
  if (v.valor <= 0) return toast('O valor precisa ser maior que zero', true);
  const reg = {
    categoria: S.f.cat,
    tipo: normTipo(fd.get('tipo')),
    descricao: fd.get('descricao').trim() || null,
    valor: v.valor,
    expressao: v.expressao,
    pagador: S.f.pagador,
  };
  if (!reg.tipo) return toast('Escolha o tipo', true);
  const q = S.edit.lanc
    ? sb.from('lancamentos').update(reg).eq('id', S.edit.lanc)
    : sb.from('lancamentos').insert({ ...reg, mes: S.mes });
  const { error } = await q;
  if (error) return falha(error, 'Não salvou');
  toast(S.edit.lanc ? 'Alteração salva' : 'Lançamento salvo');
  S.edit.lanc = null;
  await recarregar('lancamentos');
  render();
  $('#lanc-tipo')?.focus();
}
function itemParc(p, ativa = false) {
  const inf = C.infoParcela(p, S.mes);
  const selo = inf.recorrente
    ? '<span class="selo ouro">fixo</span>'
    : ativa ? `<span class="selo ouro">${inf.atual} de ${inf.total}</span>` : `<span class="selo">${inf.total}x</span>`;
  const quem = p.divisao === '50/50'
    ? `${C.NOME[p.pagador]} pagou, dividido 50/50`
    : `${C.NOME[p.pagador]} pagou, ${C.NOME[C.outro(p.pagador)]} devolve tudo`;
  const periodo = p.mes_fim ? `${C.nomeMes(p.mes_inicio, true)} a ${C.nomeMes(p.mes_fim, true)}` : `desde ${C.nomeMes(p.mes_inicio, true)}`;
  return `<li>
    <span class="barra p-${p.pagador}"></span>
    <div><div class="titulo">${esc(p.descricao)}${selo}</div>
      <div class="sub">${quem} · ${esc(p.tipo)} · ${periodo}</div></div>
    <span class="valor">${C.brl(p.valor)}</span>
    <span class="ops">
      ${ativa && (!p.mes_fim || p.mes_fim > S.mes) ? `<button type="button" data-acao="encerrar-parc" data-id="${p.id}" class="op-txt" title="Última parcela neste mês">Parar</button>` : ''}
      <button type="button" data-acao="editar-parc" data-id="${p.id}" title="Editar" aria-label="Editar">✎</button>
      <button type="button" data-acao="excluir-parc" data-id="${p.id}" title="Excluir" aria-label="Excluir">✕</button>
    </span>
  </li>`;
}
function calcularFimParc(form) {
  const inicio = C.inputParaMes(form.elements.inicio.value);
  if (!inicio) return { erro: 'Informe o mês da primeira parcela' };
  if (S.f.fim === 'REC') return { inicio, fim: null };
  if (S.f.fim === 'QTD') {
    const n = parseInt(form.elements.qtd.value, 10);
    if (!n || n < 1) return { erro: 'Informe a quantidade de parcelas' };
    return { inicio, fim: C.somaMes(inicio, n - 1) };
  }
  const fim = C.inputParaMes(form.elements.fim.value);
  if (!fim) return { erro: 'Informe o mês da última parcela' };
  if (fim < inicio) return { erro: 'A última parcela é antes da primeira' };
  return { inicio, fim };
}
function previaParc(form) {
  const el = $('#parc-previa');
  if (!el) return;
  const r = calcularFimParc(form);
  if (r.erro) { el.textContent = ''; return; }
  el.textContent = r.fim
    ? `Última parcela em ${C.nomeMes(r.fim)} (${C.difMeses(r.inicio, r.fim) + 1} parcelas).`
    : `Repete todo mês a partir de ${C.nomeMes(r.inicio)}, até vocês encerrarem.`;
}
async function salvarParc(form) {
  const fd = new FormData(form);
  const v = C.avaliarValor(fd.get('valor'));
  if (!v.ok) return toast(v.erro, true);
  if (v.valor <= 0) return toast('O valor precisa ser maior que zero', true);
  const per = calcularFimParc(form);
  if (per.erro) return toast(per.erro, true);
  if (!fd.get('descricao').trim()) return toast('No parcelado, informe a descrição', true);
  const reg = {
    descricao: fd.get('descricao').trim(),
    tipo: normTipo(fd.get('tipo')),
    valor: v.valor,
    pagador: S.f.pagador,
    divisao: S.f.div,
    mes_inicio: per.inicio,
    mes_fim: per.fim,
  };
  const q = S.edit.parc
    ? sb.from('parceladas').update(reg).eq('id', S.edit.parc)
    : sb.from('parceladas').insert(reg);
  const { error } = await q;
  if (error) return falha(error, 'Não salvou');
  toast(S.edit.parc ? 'Alteração salva' : 'Parcelado salvo');
  if (S.edit.parc) S.f.cat = 'COMPARTILHADO';
  S.edit.parc = null;
  S.f.fim = 'REC';
  await recarregar('parceladas');
  render();
}

// =====================================================================
// ABA: MORADIA
// =====================================================================
function vMoradia() {
  const doMes = C.moradiaDoMes(S.d.moradia, S.mes);
  const totMor = C.r2(doMes.reduce((a, m) => a + Number(m.valor), 0));
  const linhas = C.CONTAS_MORADIA.map((c) => {
    const r = doMes.find((m) => m.conta === c.id);
    const unit = r && c.unidade && Number(r.consumo) > 0 ? `${C.brl(r.valor / r.consumo)} por ${c.unidade}` : '';
    return `
    <div class="conta">
      <div class="conta-nome">${c.nome}${r?.padrao ? '<small>valor padrão</small>' : ''}${unit ? `<small>${unit}</small>` : ''}</div>
      <label>Valor
        <input type="text" name="v_${c.id}" data-previa autocomplete="off" placeholder="R$" value="${r ? valorParaCampo(r) : ''}">
      </label>
      ${c.unidade ? `<label>Consumo <span class="com-unidade"><input type="text" inputmode="decimal" name="c_${c.id}" autocomplete="off" value="${r?.consumo != null ? String(Number(r.consumo)).replace('.', ',') : ''}"><span>${c.unidade}</span></span></label>` : '<span></span>'}
    </div>`;
  }).join('');

  return `
  <section class="numeros">
    <div class="numero"><dt>Moradia em ${C.nomeMes(S.mes, true)}</dt><dd>${C.brl(totMor)}</dd></div>
    <div class="numero destaque"><dt>Parte de cada um</dt><dd>${C.brl(totMor / 2)}</dd></div>
  </section>

  <form class="bloco form" data-form="moradia">
    <div class="bloco-cab"><h2>Contas de ${C.nomeMes(S.mes)}</h2></div>
    <div class="moradia-grade">${linhas}</div>
    <p class="nota">Tudo aqui é dividido 50/50 e não entra no acerto: cada um paga a sua metade. Os valores padrão já entram sozinhos todo mês; é só trocar o valor e salvar quando a conta vier diferente. Deixe em branco para voltar ao valor padrão.</p>
    <div class="acoes"><button type="submit" class="btn btn-cheio">Salvar moradia</button></div>
  </form>

  <section class="bloco">
    <div class="bloco-cab"><h2>Moradia nos últimos 12 meses</h2></div>
    <div class="grafico"><canvas id="g-mor-valor"></canvas></div>
  </section>

  <section class="bloco">
    <div class="bloco-cab"><h2>Consumo</h2>
      <div style="min-width:260px">${seg('grafMor', [['AGUA', 'Água'], ['ENERGIA', 'Energia'], ['GAS', 'Gás']])}</div></div>
    <div class="grafico"><canvas id="g-mor-consumo"></canvas></div>
  </section>`;
}
function gMoradia() {
  const meses = C.listaMeses(S.mes, 12);
  const labels = meses.map((m) => C.nomeMes(m, true));
  barrasEmpilhadas('g-mor-valor', labels, C.CONTAS_MORADIA.map((c) => ({
    label: c.nome,
    data: meses.map((m) => Number(C.moradiaDoMes(S.d.moradia, m).find((x) => x.conta === c.id)?.valor || 0)),
    backgroundColor: corTipo(c.id),
  })));
  desenharConsumo();
}
function desenharConsumo() {
  const conta = C.CONTAS_MORADIA.find((c) => c.id === S.f.grafMor);
  const meses = C.listaMeses(S.mes, 12);
  const reg = meses.map((m) => C.moradiaDoMes(S.d.moradia, m).find((x) => x.conta === conta.id));
  const el = document.getElementById('g-mor-consumo');
  if (!el) return;
  const antigo = Chart.getChart(el);
  if (antigo) { antigo.destroy(); S.charts = S.charts.filter((c) => c !== antigo); }
  const cor = corTipo(conta.id);
  S.charts.push(new Chart(el, {
    data: {
      labels: meses.map((m) => C.nomeMes(m, true)),
      datasets: [
        { type: 'bar', label: `Consumo (${conta.unidade})`, data: reg.map((r) => (r?.consumo != null ? Number(r.consumo) : null)), backgroundColor: cor + '99', borderRadius: 4, yAxisID: 'y' },
        { type: 'line', label: 'Valor (R$)', data: reg.map((r) => (r ? Number(r.valor) : null)), borderColor: cssVar('--tinta'), backgroundColor: cssVar('--tinta'), tension: .3, spanGaps: true, yAxisID: 'y1' },
      ],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: conta.unidade }, grid: { color: cssVar('--linha') } },
        y1: { beginAtZero: true, position: 'right', grid: { display: false }, ticks: { callback: (v) => C.brl(v) } },
        x: { grid: { display: false } },
      },
      plugins: { tooltip: { callbacks: { label: (c) => (c.dataset.yAxisID === 'y1' ? `Valor: ${C.brl(c.raw)}` : `Consumo: ${C.num(c.raw, 2)} ${conta.unidade}`) } } },
    },
  }));
}
function repetirFixos() {
  const ant = C.somaMes(S.mes, -1);
  let n = 0;
  C.CONTAS_MORADIA.filter((c) => c.fixa).forEach((c) => {
    const r = S.d.moradia.find((m) => m.mes === ant && m.conta === c.id);
    const inp = $(`[name=v_${c.id}]`);
    if (r && inp && !inp.value.trim()) {
      inp.value = String(r.valor).replace('.', ',');
      n++;
    }
  });
  toast(n ? 'Preenchido. Confira e clique em Salvar moradia.' : `Nada para repetir de ${C.nomeMes(ant)}.`, !n);
}
async function salvarMoradia(form) {
  const doMes = C.moradiaSalva(S.d.moradia, S.mes);
  const upserts = []; const apagar = [];
  for (const c of C.CONTAS_MORADIA) {
    const txt = form.elements[`v_${c.id}`].value.trim();
    const existente = doMes.find((m) => m.conta === c.id);
    if (!txt) { if (existente) apagar.push(existente.id); continue; }
    const v = C.avaliarValor(txt);
    if (!v.ok || v.valor < 0) return toast(`${c.nome}: ${v.erro || 'valor inválido'}`, true);
    let consumo = null;
    if (c.unidade) {
      const ct = form.elements[`c_${c.id}`].value.trim().replace(',', '.');
      if (ct) { consumo = Number(ct); if (!Number.isFinite(consumo) || consumo < 0) return toast(`${c.nome}: consumo inválido`, true); }
    }
    // "pagador" continua gravado só porque a coluna existe no banco; não é usado em nenhum cálculo
    upserts.push({ mes: S.mes, conta: c.id, valor: v.valor, consumo, pagador: existente?.pagador || S.perfil.pessoa });
  }
  if (upserts.length) {
    const { error } = await sb.from('moradia').upsert(upserts, { onConflict: 'mes,conta' });
    if (error) return falha(error, 'Não salvou');
  }
  if (apagar.length) {
    const { error } = await sb.from('moradia').delete().in('id', apagar);
    if (error) return falha(error, 'Não apagou');
  }
  toast('Moradia salva');
  await recarregar('moradia');
  render();
}

// =====================================================================
// ABA: HISTÓRICO
// =====================================================================
function dadosHistorico() {
  const meses = C.listaMeses(S.mes, Number(S.f.periodo));
  return meses.map((m) => {
    const g = C.totalGastosMes(S.d.lancamentos, S.d.parceladas, S.d.legado, m);
    const mor = C.r2(C.moradiaDoMes(S.d.moradia, m).reduce((a, x) => a + Number(x.valor), 0));
    return { mes: m, gastos: g.total, fonte: g.fonte, itens: g.itens, moradia: mor, total: C.r2(g.total + mor) };
  });
}
function vHistorico() {
  const h = dadosHistorico();
  const comDados = h.filter((x) => x.total > 0);
  const media = comDados.length ? comDados.reduce((a, x) => a + x.gastos, 0) / comDados.length : 0;
  const mediaMor = comDados.length ? comDados.reduce((a, x) => a + x.moradia, 0) / comDados.length : 0;
  const tipos = C.porTipo(h.flatMap((x) => x.itens));
  const linhas = [...h].reverse().map((x, i, arr) => {
    const ant = arr[i + 1];
    let vari = '';
    if (ant && ant.gastos > 0 && x.gastos > 0) {
      const p = (x.gastos / ant.gastos - 1) * 100;
      vari = `<span class="${p > 0 ? 'sobe' : 'desce'}">${p > 0 ? '+' : ''}${C.num(p, 1)}%</span>`;
    }
    return `<tr><td>${C.cap(C.nomeMes(x.mes))}${x.fonte === 'planilha' ? '<span class="selo">planilha</span>' : ''}</td>
      <td class="n">${x.gastos ? C.brl(x.gastos) : '–'}</td><td class="n">${vari}</td>
      <td class="n">${x.moradia ? C.brl(x.moradia) : '–'}</td><td class="n"><strong>${x.total ? C.brl(x.total) : '–'}</strong></td></tr>`;
  }).join('');

  return `
  <div style="max-width:360px">${seg('periodo', [['6', '6 meses'], ['12', '12 meses'], ['24', '24 meses']])}</div>
  <section class="numeros">
    <div class="numero"><dt>Média de gastos do mês</dt><dd>${C.brl(media)}</dd></div>
    <div class="numero"><dt>Média de moradia</dt><dd>${C.brl(mediaMor)}</dd></div>
    <div class="numero"><dt>Total no período</dt><dd>${C.brl(h.reduce((a, x) => a + x.total, 0))}</dd></div>
  </section>
  <section class="bloco">
    <div class="bloco-cab"><h2>Gastos do mês por tipo</h2><span class="nota">sem moradia</span></div>
    <div class="grafico alto"><canvas id="g-hist"></canvas></div>
  </section>
  <section class="bloco">
    <div class="bloco-cab"><h2>Divisão por tipo no período</h2><span class="nota">só meses lançados no site</span></div>
    ${tipos.length ? `<div class="pizza-lado"><div class="grafico"><canvas id="g-hist-tipos"></canvas></div>${legendaTipos(tipos)}</div>` : '<p class="vazio">Sem lançamentos detalhados no período.</p>'}
  </section>
  <section class="bloco">
    <h2>Mês a mês</h2>
    <div class="tabela-wrap"><table>
      <thead><tr><th>Mês</th><th class="n">Gastos do mês</th><th class="n">Variação</th><th class="n">Moradia</th><th class="n">Total</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table></div>
  </section>`;
}
function gHistorico() {
  const h = dadosHistorico();
  const labels = h.map((x) => C.nomeMes(x.mes, true));
  const tiposSet = new Set(h.flatMap((x) => x.itens.map((i) => i.tipo)));
  const ds = [...tiposSet].map((t) => ({
    label: t,
    data: h.map((x) => C.r2(x.itens.filter((i) => i.tipo === t).reduce((a, i) => a + i.valor, 0))),
    backgroundColor: corTipo(t),
  }));
  if (h.some((x) => x.fonte === 'planilha')) {
    ds.push({ label: 'PLANILHA (SEM DETALHE)', data: h.map((x) => (x.fonte === 'planilha' ? x.gastos : 0)), backgroundColor: corTipo('PLANILHA (SEM DETALHE)') });
  }
  barrasEmpilhadas('g-hist', labels, ds);
  const tipos = C.porTipo(h.flatMap((x) => x.itens));
  if (tipos.length) pizza('g-hist-tipos', tipos);
}

// =====================================================================
// ABA: MINHA ÁREA (cada um vê só o seu)
// =====================================================================
function dadosEu() {
  const pessoa = S.perfil.pessoa;
  const { mor, geral } = dadosDoMes();
  const moradia = C.custoPessoalDoCasal([], mor, pessoa).moradia;
  const metade = (contas) => C.r2(mor.filter((m) => contas.includes(m.conta)).reduce((a, m) => a + Number(m.valor) / 2, 0));
  const morPartes = {
    aluguel: metade(['ALUGUEL']),
    condominio: metade(['CONDOMINIO']),
    contas: metade(['INTERNET', 'AGUA', 'ENERGIA', 'GAS']),
  };
  // acerto do casal: entra como ganho (recebe) ou gasto (paga)
  const recebe = geral.valor && geral.para === pessoa ? geral.valor : 0;
  const paga = geral.valor && geral.de === pessoa ? geral.valor : 0;
  const meus = S.d.pessoais.filter((p) => p.mes === S.mes && p.dono === S.user.id);
  const ganhos = meus.filter((p) => p.natureza === 'GANHO');
  const gastos = meus.filter((p) => p.natureza === 'GASTO');
  const soma = (l) => C.r2(l.reduce((a, x) => a + Number(x.valor), 0));
  const totG = soma(ganhos); const totP = soma(gastos);
  const sobra = C.r2(totG + recebe - totP - paga - moradia);
  return { pessoa, geral, recebe, paga, moradia, morPartes, ganhos, gastos, totG, totP, sobra };
}
function vEu() {
  const { pessoa, geral, recebe, paga, moradia, morPartes, ganhos, gastos, totG, totP, sobra } = dadosEu();
  const outroNome = C.NOME[C.outro(pessoa)];
  const item = (p) => `<li>
    <span class="barra p-${pessoa}"></span>
    <div><div class="titulo">${esc(p.descricao || p.tipo)}${p.descricao ? `<span class="selo">${esc(p.tipo)}</span>` : ''}</div></div>
    <span class="valor">${C.brl(p.valor)}</span>
    <span class="ops"><button type="button" data-acao="excluir-pess" data-id="${p.id}" title="Excluir" aria-label="Excluir">✕</button></span>
  </li>`;
  const auto_ = (titulo, sub, v) => `<li><span class="barra auto"></span>
    <div><div class="titulo">${titulo}<span class="selo">automático</span></div><div class="sub">${sub}</div></div>
    <span class="valor">${C.brl(v)}</span><span class="ops"></span></li>`;

  const cardAcerto = recebe
    ? `<div class="numero"><dt>Acerto: você recebe</dt><dd class="desce">+&nbsp;${C.brl(recebe)}</dd></div>`
    : paga
      ? `<div class="numero"><dt>Acerto: você paga</dt><dd class="sobe">−&nbsp;${C.brl(paga)}</dd></div>`
      : `<div class="numero"><dt>Acerto do mês</dt><dd>${C.brl(0)}</dd></div>`;
  const listaGanhos = [
    recebe ? auto_('Acerto do casal', `recebido de ${outroNome}`, recebe) : '',
    ...ganhos.map(item),
  ].join('');

  return `
  <section class="numeros">
    <div class="numero"><dt>Ganhos</dt><dd>${C.brl(totG)}</dd></div>
    <div class="numero"><dt>Gastos pessoais</dt><dd>${C.brl(totP)}</dd></div>
    ${cardAcerto}
    <div class="numero"><dt>Aluguel (sua metade)</dt><dd>${C.brl(morPartes.aluguel)}</dd></div>
    <div class="numero"><dt>Condomínio (sua metade)</dt><dd>${C.brl(morPartes.condominio)}</dd></div>
    <div class="numero"><dt>Contas da moradia (sua metade)</dt><dd>${C.brl(morPartes.contas)}</dd></div>
    <div class="numero destaque"><dt>Sobra do mês</dt><dd>${C.brl(sobra)}</dd></div>
  </section>
  <p class="nota">Esta área é só sua: ${outroNome} não vê seus ganhos nem gastos pessoais.</p>

  <div class="duas duas-form">
    <form class="bloco form" data-form="pess">
      <h2>Lançar na minha área</h2>
      ${seg('nat', [['GASTO', 'Gasto pessoal'], ['GANHO', 'Ganho']])}
      <label>Tipo <input type="text" name="tipo" id="pess-tipo" list="dl-pess" required autocomplete="off"></label>
      ${chips('pess-tipo', C.TIPOS_GASTO_PESSOAL, 'nat=GASTO')}
      ${chips('pess-tipo', C.TIPOS_GANHO, 'nat=GANHO')}
      ${datalist('dl-pess', [...C.TIPOS_GASTO_PESSOAL, ...C.TIPOS_GANHO], S.d.pessoais.map((p) => p.tipo))}
      <label><span>Descrição <span class="campo-dica">opcional</span></span><input type="text" name="descricao" autocomplete="off"></label>
      ${campoValor('valor')}
      <div class="acoes"><button type="submit" class="btn btn-cheio">Salvar</button></div>
    </form>

    <section class="bloco">
      <div class="grupo">
        <div class="grupo-cab"><h3>Ganhos</h3>
          <button type="button" class="btn-texto" data-acao="repetir-ganhos">Repetir ganhos do mês anterior</button></div>
        ${listaGanhos ? `<ul class="lista">${listaGanhos}</ul>` : '<p class="vazio">Nenhum ganho lançado.</p>'}
      </div>
      <div class="grupo">
        <div class="grupo-cab"><h3>Gastos</h3></div>
        <ul class="lista">
          ${paga ? auto_('Acerto do casal', `pago a ${outroNome}`, paga) : ''}
          ${morPartes.aluguel ? auto_('Aluguel', 'sua metade', morPartes.aluguel) : ''}
          ${morPartes.condominio ? auto_('Condomínio', 'sua metade', morPartes.condominio) : ''}
          ${morPartes.contas ? auto_('Contas da moradia', 'sua metade de internet, água, energia e gás', morPartes.contas) : ''}
          ${gastos.map(item).join('')}
        </ul>
      </div>
    </section>
  </div>

  <section class="bloco">
    <div class="bloco-cab"><h2>Para onde foi o seu dinheiro</h2></div>
    <div class="pizza-lado"><div class="grafico"><canvas id="g-eu"></canvas></div><div id="leg-eu"></div></div>
  </section>

  <form class="bloco form" data-form="senha" style="max-width:420px">
    <h3>Trocar minha senha</h3>
    <label>Nova senha <input type="password" name="senha" minlength="6" required autocomplete="new-password"></label>
    <div class="acoes"><button type="submit" class="btn">Trocar senha</button></div>
  </form>`;
}
function gEu() {
  const { paga, morPartes, gastos } = dadosEu();
  const itens = [
    { tipo: 'ACERTO DO CASAL', valor: paga },
    { tipo: 'ALUGUEL', valor: morPartes.aluguel },
    { tipo: 'CONDOMÍNIO', valor: morPartes.condominio },
    { tipo: 'CONTAS DA MORADIA', valor: morPartes.contas },
    ...gastos.map((g) => ({ tipo: g.tipo, valor: Number(g.valor) })),
  ];
  const tipos = C.porTipo(itens);
  $('#leg-eu').innerHTML = tipos.length ? legendaTipos(tipos) : '<p class="vazio">Sem gastos neste mês.</p>';
  if (tipos.length) pizza('g-eu', tipos);
}
async function salvarPess(form) {
  const fd = new FormData(form);
  const v = C.avaliarValor(fd.get('valor'));
  if (!v.ok) return toast(v.erro, true);
  if (v.valor <= 0) return toast('O valor precisa ser maior que zero', true);
  const reg = { mes: S.mes, natureza: S.f.nat, tipo: normTipo(fd.get('tipo')), descricao: fd.get('descricao').trim() || null, valor: v.valor };
  const { error } = await sb.from('pessoais').insert(reg);
  if (error) return falha(error, 'Não salvou');
  toast(S.f.nat === 'GANHO' ? 'Ganho salvo' : 'Gasto salvo');
  await recarregar('pessoais');
  render();
}
async function repetirGanhos() {
  const ant = C.somaMes(S.mes, -1);
  const lista = S.d.pessoais.filter((p) => p.mes === ant && p.natureza === 'GANHO' && p.dono === S.user.id);
  if (!lista.length) return toast(`Nenhum ganho em ${C.nomeMes(ant)}.`, true);
  if (!confirm(`Copiar ${lista.length} ganho(s) de ${C.nomeMes(ant)} para ${C.nomeMes(S.mes)}?`)) return;
  const { error } = await sb.from('pessoais').insert(lista.map((p) => ({ mes: S.mes, natureza: 'GANHO', tipo: p.tipo, descricao: p.descricao, valor: p.valor })));
  if (error) return falha(error, 'Não copiou');
  toast('Ganhos copiados');
  await recarregar('pessoais');
  render();
}

// =====================================================================
// gráficos
// =====================================================================
function configurarChart() {
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.color = cssVar('--suave');
  Chart.defaults.plugins.legend.labels.boxWidth = 12;
}
function pizza(id, tipos) {
  const el = document.getElementById(id);
  if (!el) return;
  S.charts.push(new Chart(el, {
    type: 'doughnut',
    data: { labels: tipos.map((t) => t.tipo), datasets: [{ data: tipos.map((t) => t.valor), backgroundColor: tipos.map((t) => corTipo(t.tipo)), borderColor: cssVar('--superficie'), borderWidth: 2 }] },
    options: {
      maintainAspectRatio: false, cutout: '58%',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.label}: ${C.brl(c.raw)} (${C.num(tipos[c.dataIndex].pct * 100, 1)}%)` } } },
    },
  }));
}
function barrasEmpilhadas(id, labels, datasets) {
  const el = document.getElementById(id);
  if (!el) return;
  S.charts.push(new Chart(el, {
    type: 'bar',
    data: { labels, datasets: datasets.map((d) => ({ ...d, borderRadius: 3, maxBarThickness: 44 })) },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: { stacked: true, beginAtZero: true, grid: { color: cssVar('--linha') }, ticks: { callback: (v) => C.brl(v) } },
      },
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          filter: (i) => i.raw > 0,
          callbacks: {
            label: (c) => `${c.dataset.label}: ${C.brl(c.raw)}`,
            footer: (arr) => `Total: ${C.brl(arr.reduce((a, i) => a + i.raw, 0))}`,
          },
        },
      },
    },
  }));
}

// =====================================================================
// eventos
// =====================================================================
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-acao], [data-aba]');
  if (!b) return;
  if (b.dataset.aba) return irPara(b.dataset.aba);
  const { acao, id, k, v } = b.dataset;
  const n = Number(id);

  switch (acao) {
    case 'mes-ant': S.mes = C.somaMes(S.mes, -1); S.edit = { lanc: null, parc: null }; return render();
    case 'mes-prox': S.mes = C.somaMes(S.mes, 1); S.edit = { lanc: null, parc: null }; return render();
    case 'mes-hoje': S.mes = C.mesAtual(); return render();
    case 'aba': return irPara(v);

    case 'set': {
      S.f[k] = v;
      $$(`[data-grupo="${k}"] button`).forEach((x) => x.setAttribute('aria-pressed', x.dataset.v === v));
      atualizarDependentes();
      if (k === 'fim' || k === 'cat') previaParc($('[data-form=lanc]'));
      if (k === 'grafMor') desenharConsumo();
      if (k === 'periodo') render();
      if (k === 'nat') { const t = $('#pess-tipo'); if (t) t.value = ''; }
      return;
    }
    case 'chip': {
      const alvo = document.getElementById(b.dataset.alvo);
      if (alvo) { alvo.value = v; alvo.dispatchEvent(new Event('input')); }
      $$('button', b.parentElement).forEach((x) => x.setAttribute('aria-pressed', x === b));
      return;
    }

    case 'editar-lanc': {
      const l = S.d.lancamentos.find((x) => x.id === n);
      S.edit = { lanc: n, parc: null }; S.f.cat = l.categoria; S.f.pagador = l.pagador;
      render(); $('[data-form=lanc]').scrollIntoView({ behavior: 'smooth' });
      return;
    }
    case 'cancelar-edicao':
      S.edit = { lanc: null, parc: null }; S.f.cat = 'COMPARTILHADO'; S.f.fim = 'REC'; S.f.pagador = S.perfil.pessoa;
      return render();
    case 'excluir-lanc': {
      const l = S.d.lancamentos.find((x) => x.id === n);
      if (!confirm(`Excluir ${l.descricao || l.tipo} de ${C.brl(l.valor)}?`)) return;
      const { error } = await sb.from('lancamentos').delete().eq('id', n);
      if (error) return falha(error, 'Não excluiu');
      if (S.edit.lanc === n) S.edit.lanc = null;
      toast('Excluído'); await recarregar('lancamentos'); return render();
    }

    case 'editar-parc': {
      const p = S.d.parceladas.find((x) => x.id === n);
      S.edit = { lanc: null, parc: n }; S.f.cat = 'PARCELA'; S.f.pagador = p.pagador; S.f.div = p.divisao; S.f.fim = p.mes_fim ? 'MES' : 'REC';
      render(); $('[data-form=lanc]').scrollIntoView({ behavior: 'smooth' });
      return;
    }
    case 'encerrar-parc': {
      const p = S.d.parceladas.find((x) => x.id === n);
      if (!confirm(`${p.descricao}: a última parcela passa a ser ${C.nomeMes(S.mes)}. Confirma?`)) return;
      const { error } = await sb.from('parceladas').update({ mes_fim: S.mes }).eq('id', n);
      if (error) return falha(error, 'Não encerrou');
      toast('Encerrada neste mês'); await recarregar('parceladas'); return render();
    }
    case 'excluir-parc': {
      const p = S.d.parceladas.find((x) => x.id === n);
      if (!confirm(`Excluir ${p.descricao}? Ela some de TODOS os meses, inclusive os anteriores. Para só parar de cobrar a partir deste mês, use Parar.`)) return;
      const { error } = await sb.from('parceladas').delete().eq('id', n);
      if (error) return falha(error, 'Não excluiu');
      if (S.edit.parc === n) { S.edit.parc = null; S.f.cat = 'COMPARTILHADO'; }
      toast('Excluída'); await recarregar('parceladas'); return render();
    }

    case 'repetir-fixos': return repetirFixos();
    case 'repetir-ganhos': return repetirGanhos();
    case 'excluir-pess': {
      if (!confirm('Excluir este lançamento?')) return;
      const { error } = await sb.from('pessoais').delete().eq('id', n);
      if (error) return falha(error, 'Não excluiu');
      toast('Excluído'); await recarregar('pessoais'); return render();
    }
    default:
  }
});

document.addEventListener('submit', async (e) => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  const btn = $('button[type=submit]', form);
  if (btn) btn.disabled = true;
  try {
    const f = form.dataset.form;
    if (f === 'lanc') await (S.f.cat === 'PARCELA' ? salvarParc(form) : salvarLanc(form));
    else if (f === 'moradia') await salvarMoradia(form);
    else if (f === 'pess') await salvarPess(form);
    else if (f === 'senha') {
      const { error } = await sb.auth.updateUser({ password: new FormData(form).get('senha') });
      if (error) falha(error, 'Não trocou a senha'); else { toast('Senha alterada'); form.reset(); }
    }
  } catch (err) {
    falha(err, 'Erro');
  } finally {
    if (btn && document.body.contains(btn)) btn.disabled = false;
  }
});

document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.matches('[data-previa]')) {
    const p = el.closest('label')?.nextElementSibling;
    if (!p || !p.classList.contains('previa')) return;
    if (!el.value.trim()) { p.textContent = ''; return; }
    const r = C.avaliarValor(el.value);
    p.classList.toggle('erro', !r.ok);
    p.textContent = r.ok ? (r.expressao ? `= ${C.brl(r.valor)}` : '') : r.erro;
  }
  const fp = el.closest('[data-form=lanc]');
  if (fp && ['inicio', 'qtd', 'fim'].includes(el.name)) previaParc(fp);
});

iniciar();
