// =====================================================================
// INVESTIMENTOS — aba do app (tela + Supabase)
// Dados por pessoa na tabela invest_carteira (uma linha, coluna jsonb "dados").
// =====================================================================
import * as I from './invest.js?v=3';

const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
let xlsxPromessa = null;
// SheetJS só é baixado quando alguém carrega uma planilha (~900 KB)
function garantirXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!xlsxPromessa) {
    xlsxPromessa = new Promise((ok, erro) => {
      const s = document.createElement('script');
      s.src = XLSX_URL;
      s.onload = () => ok(window.XLSX);
      s.onerror = () => { xlsxPromessa = null; erro(new Error('não consegui baixar o leitor de planilhas — verifique a internet')); };
      document.head.appendChild(s);
    });
  }
  return xlsxPromessa;
}

export function criarInvest({ S, sb, toast, falha, esc, C, render }) {
  const st = { R: null, erro: null, ultimo: null, abertos: new Set(), finclass: null };
  // dados enviados pelo favorito da Finclass (#invest-finclass=…)
  try { const d = I.lerHashFinclass(location.hash); if (d) st.finclass = { dados: d, usarValor: false }; } catch (e) { console.warn('hash Finclass inválido', e); }
  // mantém <details> abertos entre um render e outro
  document.addEventListener('toggle', (e) => {
    const k = e.target?.dataset?.invDet;
    if (k) { if (e.target.open) st.abertos.add(k); else st.abertos.delete(k); }
  }, true);
  const det = (k) => `data-inv-det="${k}"${st.abertos.has(k) ? ' open' : ''}`;
  const vazio = () => ({ posicoes: [], data: null, arquivo: null, instSel: null, alvo: null, cfg: { ...I.CFG_PADRAO } });

  // -------------------------------------------------------------------
  // banco
  // -------------------------------------------------------------------
  async function carregar(auto = true) {
    const { data, error } = await sb.from('invest_carteira').select('dados').eq('pessoa', S.perfil.pessoa).maybeSingle();
    if (error) { st.erro = error; st.R = vazio(); return; }
    st.erro = null;
    const d = data?.dados || {};
    st.R = { ...vazio(), ...d, cfg: { ...I.CFG_PADRAO, ...(d.cfg || {}) } };
    if (auto && precisaSync()) sincronizarAgora(true); // em segundo plano
  }

  // ---------- Open Finance (Pluggy) ----------
  const HORAS_SYNC = 6;
  const itensPluggy = () => (st.R?.pluggyItens || []).filter((i) => i?.id);
  function precisaSync() {
    if (st.erro || !itensPluggy().length || st.sync === 'rodando') return false;
    const ult = Date.parse(st.R.sincronizadoEm || 0) || 0;
    return Date.now() - ult > HORAS_SYNC * 3600e3;
  }
  async function sincronizarAgora(silencioso = false) {
    if (st.sync === 'rodando') return;
    st.sync = 'rodando'; st.syncErro = null;
    if (S.aba === 'invest') render();
    try {
      const { data, error } = await sb.functions.invoke('sync-investimentos', { body: {} });
      if (error) {
        let msg = error.message;
        try { const b = await error.context.json(); msg = b.erro || msg; } catch { /* sem corpo */ }
        throw new Error(msg);
      }
      if (data?.erro) throw new Error(data.erro);
      await carregar(false);
      if (!silencioso || data?.avisos?.length) toast(data?.avisos?.length ? data.avisos[0] : `${data.n} posições atualizadas pelo Open Finance`, !!data?.avisos?.length);
    } catch (e) {
      st.syncErro = e.message;
      if (!silencioso) falha(e, 'Open Finance');
    } finally {
      st.sync = null;
      if (S.aba === 'invest') render();
    }
  }
  function tempoDesde(iso) {
    const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (!Number.isFinite(min)) return '';
    if (min < 2) return 'agora';
    if (min < 60) return `há ${min} min`;
    if (min < 48 * 60) return `há ${Math.round(min / 60)} h`;
    return `há ${Math.round(min / 1440)} dias`;
  }
  async function salvar() {
    if (st.erro) return; // tabela não existe ainda: trabalha só na memória
    const { error } = await sb.from('invest_carteira').upsert(
      { pessoa: S.perfil.pessoa, dados: st.R, atualizado_em: new Date().toISOString() },
      { onConflict: 'pessoa' },
    );
    if (error) falha(error, 'Não salvou os investimentos');
  }

  // -------------------------------------------------------------------
  // derivados
  // -------------------------------------------------------------------
  const alvoAtivo = () => st.R.alvo || I.ALVO_PADRAO;
  const cfgCalc = () => {
    const c = st.R.cfg;
    return { ...c, tol: Math.max(0, Number(c.tol) || 0) / 100, patMeta: Math.max(0, Number(c.patMeta) || 0),
      aporte: Math.max(0, Number(c.aporte) || 0), janela: Math.max(0, Number(c.janela) || 0) };
  };
  function estado() {
    const todas = st.R.posicoes || [];
    const insts = I.instituicoes(todas);
    const sel = I.instEfetiva(insts, st.R.instSel);
    const pos = I.filtrarPorInst(todas, sel);
    let res = null; let erroCalc = null;
    if (todas.length) {
      try { res = I.calcular(pos, alvoAtivo(), cfgCalc()); } catch (e) { erroCalc = e.message; }
    }
    st.ultimo = res;
    return { todas, insts, sel, pos, res, erroCalc };
  }

  // -------------------------------------------------------------------
  // tela
  // -------------------------------------------------------------------
  const pct = (v, d = 2) => `${C.num(v * 100, d)}%`;
  const pp = (v) => `${v >= 0 ? '+' : '−'}${C.num(Math.abs(v * 100), 2)} p.p.`;
  const dataBR = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
  const ROT_ACAO = { buy: 'Comprar', sell: 'Vender', ok: 'Em linha' };

  function blocoSetup() {
    if (!st.erro) return '';
    return `<section class="bloco inv-alerta">
      <h3>Falta criar a tabela no Supabase</h3>
      <p class="nota">Rode o arquivo <strong>sql/03_investimentos.sql</strong> no SQL Editor do Supabase. Até lá a aba funciona,
      mas nada fica salvo ao recarregar. <span class="campo-dica">(${esc(st.erro.message || st.erro.code || '')})</span></p>
    </section>`;
  }

  function blocoArquivos(insts, sel, todas) {
    const R = st.R;
    const qtdPor = (i) => todas.filter((p) => (p.inst || '') === i).length;
    const filtro = insts.length > 1 || (insts.length === 1 && insts[0]) ? `
      <div class="inv-inst">
        <div class="rotulo">Instituições consideradas <span class="campo-dica">o padrão é só XP</span></div>
        <div class="inv-checks">
          ${insts.map((i) => `<label class="inv-check"><input type="checkbox" data-inv="inst" value="${esc(i)}" ${sel.includes(i) ? 'checked' : ''}>
            <span>${esc(i || I.SEM_INST)} <small>${qtdPor(i)}</small></span></label>`).join('')}
        </div>
        <div class="acoes"><button type="button" class="btn-texto" data-acao="inv-inst-xp">Só XP</button>
          <button type="button" class="btn-texto" data-acao="inv-inst-todas">Todas</button></div>
      </div>` : '';
    return `<section class="bloco">
      <div class="bloco-cab"><h2>Posição</h2>
        <span class="nota">${R.data ? `posição de <strong>${dataBR(R.data)}</strong>` : 'nenhuma posição carregada'}${R.arquivo ? ` · ${esc(R.arquivo)}` : ''}${R.fonte === 'pluggy' && R.sincronizadoEm ? ` · sincronizado ${tempoDesde(R.sincronizadoEm)}` : ''}</span></div>
      ${st.syncErro ? `<p class="erro">Open Finance: ${esc(st.syncErro)}</p>` : ''}
      <div class="acoes">
        ${itensPluggy().length ? `<button type="button" class="btn btn-cheio" data-acao="inv-sync" ${st.sync === 'rodando' ? 'disabled' : ''}>${st.sync === 'rodando' ? 'Atualizando…' : 'Atualizar agora (Open Finance)'}</button>` : ''}
        <label class="btn ${itensPluggy().length ? '' : 'btn-cheio '}inv-arq">Carregar relatório da B3 (.xlsx)
          <input type="file" id="inv-arq-pos" accept=".xlsx,.xls,.csv" hidden></label>
        ${todas.length ? '<button type="button" class="btn" data-acao="inv-csv">Baixar plano (CSV)</button>' : ''}
      </div>
      <details class="inv-ajuda" ${det('ajuda')}><summary>Como baixar o relatório</summary>
        <ol>
          <li>Entre na <strong>Área do Investidor B3</strong> → Investimentos → <strong>Posição</strong>.</li>
          <li>Pode deixar todas as instituições — o filtro é feito aqui.</li>
          <li>Clique em <strong>Baixar</strong> → Excel e carregue o arquivo acima.</li>
        </ol>
        <p class="nota">A B3 só libera API para corretoras e fintechs autorizadas, com o seu consentimento, então para uso pessoal o caminho é o Excel. O app lê todas as abas (Ações, ETF, FII, Tesouro, Renda Fixa).</p>
      </details>
      ${blocoConexao()}
      ${filtro}
    </section>`;
  }

  function blocoConexao() {
    const itens = itensPluggy();
    const stOf = (id) => (st.R.pluggyStatus || []).find((x) => x.id === id);
    const linha = (it) => {
      const s = stOf(it.id);
      const ok = s && ['UPDATED', 'UPDATING'].includes(s.status);
      const venc = s?.consentimentoAte ? dataBR(String(s.consentimentoAte).slice(0, 10)) : null;
      return `<li><span class="barra ${ok ? 'inv-ok' : s ? 'inv-sell' : ''}"></span>
        <div><div class="titulo">${esc(it.nome || 'XP')}${s ? `<span class="selo${ok ? '' : ' inv-sell-s'}">${esc(s.status)}</span>` : ''}</div>
          <div class="sub">${esc(it.id)}${s?.atualizadoEm ? ` · dados da instituição ${tempoDesde(s.atualizadoEm)}` : ''}${venc ? ` · consentimento até ${venc}` : ''}${s?.erro ? ` · ${esc(s.erro)}` : ''}</div></div>
        <span></span>
        <span class="ops"><button type="button" data-acao="inv-of-del" data-id="${esc(it.id)}" title="Remover conexão" aria-label="Remover">✕</button></span></li>`;
    };
    return `<details class="inv-ajuda" ${det('of')}><summary>Conexão automática (Open Finance) · ${itens.length ? `${itens.length} conectada(s)` : 'desligada'}</summary>
      ${itens.length ? `<ul class="lista">${itens.map(linha).join('')}</ul>` : ''}
      <div class="inv-of-add">
        <input type="text" id="inv-of-id" placeholder="Item ID do meu.pluggy.ai" autocomplete="off">
        <input type="text" id="inv-of-nome" placeholder="Nome (ex.: XP)" value="XP" autocomplete="off">
        <button type="button" class="btn" data-acao="inv-of-add">Conectar</button>
      </div>
      <ol>
        <li>Crie a conta em <strong>dashboard.pluggy.ai</strong> → Applications → nova aplicação (gera Client ID e Secret).</li>
        <li>Ainda no período de teste, entre em <strong>meu.pluggy.ai</strong> e conecte a <strong>XP</strong> (autoriza no app da XP).</li>
        <li>No meu.pluggy.ai, menu ⋮ → <strong>Copiar Item ID</strong> e cole acima.</li>
        <li>Uma vez só: segredos <code>PLUGGY_CLIENT_ID_${esc(S.perfil.pessoa)}</code> e <code>PLUGGY_CLIENT_SECRET_${esc(S.perfil.pessoa)}</code> no Supabase e deploy da função <code>sync-investimentos</code>.</li>
      </ol>
      <p class="nota">Esta conexão e esta carteira são só suas — ${esc(S.perfil.pessoa === 'FELIPE' ? 'a Mariana' : 'o Felipe')} não vê nem altera. Com a conexão ativa, a posição se atualiza sozinha ao abrir esta aba (se tiver mais de ${HORAS_SYNC} h). O consentimento do Open Finance vence em 12 meses — aí é só reconectar.</p>
    </details>`;
  }

  function blocoPlano(res) {
    const c = st.R.cfg;
    const seg = (nome, opcoes) => `<div class="segmentado">${opcoes.map(([v, t]) =>
      `<button type="button" data-acao="inv-cfg" data-k="${nome}" data-v="${v}" aria-pressed="${String(c[nome]) === v}">${t}</button>`).join('')}</div>`;
    const campo = (nome, rot, dica, passo = '0.01') => `<label><span>${rot}${dica ? ` <span class="campo-dica">${dica}</span>` : ''}</span>
      <input type="number" data-inv="cfg" name="${nome}" value="${esc(c[nome])}" step="${passo}" min="0" inputmode="decimal"></label>`;
    return `<section class="bloco">
      <div class="bloco-cab"><h2>Plano Finclass</h2><span class="nota">${res ? `investido: <strong>${C.brl(res.patrimonio)}</strong>` : ''}</span></div>
      <div class="inv-cfg">
        ${campo('patMeta', 'Valor investido da carteira', 'o mesmo da Finclass', '100')}
        <div><span class="rotulo">Os percentuais valem sobre</span>${seg('baseModo', [['meta', 'O valor acima'], ['atual', 'O que já tenho']])}</div>
        <div><span class="rotulo">Modo</span>${seg('modo', [['full', 'Rebalancear'], ['aporte', 'Só aporte']])}</div>
        ${campo('aporte', 'Aporte previsto', 'dinheiro novo', '50')}
        ${campo('tol', 'Banda morta', 'p.p. — abaixo disso fica “em linha”', '0.1')}
      </div>
      <details class="inv-ajuda" ${det('opcoes')}><summary>Opções de equivalência</summary>
        <div class="inv-cfg">
          ${campo('janela', 'Janela do Tesouro', 'anos de diferença no vencimento', '1')}
          <div><span class="rotulo">Ativos equivalentes</span>${seg('agrupar', [['auto', 'Agrupar se faltar par'], ['nunca', 'Sempre separar']])}</div>
          <label class="inv-check"><input type="checkbox" data-inv="cfg" name="raizAcao" ${c.raizAcao ? 'checked' : ''}><span>Classes da mesma empresa se equivalem (KLBN11 ≈ KLBN4)</span></label>
          <label class="inv-check"><input type="checkbox" data-inv="cfg" name="renda" ${c.renda ? 'checked' : ''}><span>Renda+ conta como Tesouro IPCA+</span></label>
        </div>
      </details>
    </section>`;
  }

  function blocoResumo(res) {
    const cfg = cfgCalc();
    const comprar = res.grupos.filter((g) => g.dif > 0).reduce((a, g) => a + g.dif, 0);
    const vender = res.grupos.filter((g) => g.dif < 0).reduce((a, g) => a - g.dif, 0);
    const saldo = vender + cfg.aporte - comprar;
    const classes = I.ORDEM_CLASSE.filter((k) => res.grupos.some((g) => g.classe === k));
    const cardCls = (k) => {
      const gs = res.grupos.filter((g) => g.classe === k);
      const at = gs.reduce((a, g) => a + g.atual, 0); const al = gs.reduce((a, g) => a + g.percAlvo, 0);
      const pa = res.base ? at / res.base : 0; const dv = pa - al;
      const cor = Math.abs(dv) <= cfg.tol ? 'ok' : dv < 0 ? 'buy' : 'sell';
      const esc_ = Math.max(al, pa, 0.0001);
      return `<div class="numero inv-cls"><dt>${I.NOME_CLASSE[k]}</dt><dd>${pct(pa)}</dd>
        <div class="inv-sub ${cor}">alvo ${pct(al)} · ${pp(dv)}</div>
        <div class="inv-bar"><i class="${cor}" style="width:${Math.min(100, (pa / esc_) * 100)}%"></i><u style="left:${Math.min(100, (al / esc_) * 100)}%"></u></div></div>`;
    };
    return `<section class="numeros">
      <div class="numero destaque"><dt>${cfg.baseModo === 'meta' ? 'Investido / plano' : 'Patrimônio considerado'}</dt>
        <dd>${C.brl(res.patrimonio)}</dd><div class="inv-sub">${cfg.baseModo === 'meta' ? `de ${C.brl(res.base)} · ${pct(res.base ? res.patrimonio / res.base : 0, 0)}` : `base ${C.brl(res.base)}`}</div></div>
      <div class="numero"><dt>Comprar</dt><dd class="inv-buy">${C.brl(comprar)}</dd></div>
      <div class="numero"><dt>Vender</dt><dd class="inv-sell">${C.brl(vender)}</dd></div>
      <div class="numero"><dt>${saldo < 0 ? 'Dinheiro novo necessário' : 'Caixa ao final'}</dt><dd>${C.brl(Math.abs(saldo))}</dd></div>
    </section>
    <section class="numeros">${classes.map(cardCls).join('')}</section>`;
  }

  function blocoClasses(res) {
    const cfg = cfgCalc();
    return I.ORDEM_CLASSE.filter((k) => res.grupos.some((g) => g.classe === k)).map((k) => {
      const gs = res.grupos.filter((g) => g.classe === k).sort((a, b) => a.desvio - b.desvio);
      const comprar = gs.filter((g) => g.dif > 0).reduce((a, g) => a + g.dif, 0);
      const vender = gs.filter((g) => g.dif < 0).reduce((a, g) => a - g.dif, 0);
      const escala = Math.max(cfg.tol * 2, ...gs.map((g) => Math.abs(g.desvio))) || 0.01;
      const linha = (g) => {
        const selos = (g.foraDoAlvo ? '<span class="selo inv-sell-s">fora do alvo</span>' : '')
          + (g.equiv ? '<span class="selo ouro">grupo</span>' : '')
          + (!g.atual && g.alvoRS ? '<span class="selo">novo</span>' : '')
          + (g.alvos.some((a) => a.tipoRef === 'EM_REVISAO') ? '<span class="selo ouro">em revisão</span>' : '');
        const w = Math.min(50, (Math.abs(g.desvio) / escala) * 50);
        const regua = `<span class="inv-regua" title="${pp(g.desvio)}"><span class="eixo"></span>
          <span class="fill ${g.acao}" style="${g.desvio < 0 ? `right:50%` : 'left:50%'};width:${w}%"></span></span>`;
        const q = g.qtd ? `≈ ${g.qtd} cota(s)` : (g.dif && g.alvos.length > 1) ? 'divisão por título abaixo' : (g.dif && g.precoUnit ? `menos de 1 cota (${C.brl(g.precoUnit)})` : (g.dif ? 'quantidade não estimada' : ''));
        const det = g.equiv && g.detalhe.length ? `<ul class="inv-det">${g.detalhe.map((d) => `<li><span>${esc(d.rotulo)}${d.nota ? ` <small>você tem: ${esc(d.nota)}</small>` : ''}</span>
          <span>${C.brl(d.atual)} → ${C.brl(d.alvo)}</span><span class="${d.acao}">${d.acao === 'ok' ? 'em linha' : `${d.acao === 'buy' ? 'comprar' : 'vender'} ${C.brl(Math.abs(d.dif))}`}${d.qtd ? ` · ≈ ${d.qtd}` : ''}</span></li>`).join('')}</ul>` : '';
        return `<li class="inv-item">
          <span class="barra inv-${g.acao}"></span>
          <div><div class="titulo">${esc(g.rotulo)}${selos}</div>
            <div class="sub">${esc(g.nome)}${g.inclui.length ? ` · inclui ${esc(g.inclui.join(', '))}` : ''}</div>
            <div class="sub">hoje ${C.brl(g.atual)} (${pct(g.percAtual)}) · alvo ${C.brl(g.alvoRS)} (${pct(g.percAlvo)})</div>
            ${regua}${det}</div>
          <span class="inv-acao"><span class="pilula ${g.acao}">${ROT_ACAO[g.acao]}</span>
            <strong class="${g.acao}">${g.dif ? C.brl(Math.abs(g.dif)) : '—'}</strong><small>${q}</small></span>
        </li>`;
      };
      return `<section class="bloco">
        <div class="bloco-cab"><h2>${I.NOME_CLASSE[k]}</h2><span class="nota">comprar ${C.brl(comprar)} · vender ${C.brl(vender)}</span></div>
        <ul class="lista">${gs.map(linha).join('')}</ul>
      </section>`;
    }).join('');
  }

  function blocoAvisos(res) {
    if (!res.avisos.length) return '';
    return `<section class="bloco inv-alerta"><h3>Confira antes de executar</h3>
      <ul class="inv-avisos">${res.avisos.map((a) => `<li>${a}</li>`).join('')}</ul></section>`;
  }

  function blocoAlvo() {
    const alvo = alvoAtivo();
    const soma = alvo.reduce((a, b) => a + b.perc, 0);
    const okSoma = Math.abs(soma - 1) < 0.0005;
    const proprio = !!st.R.alvo;
    const linhas = I.ORDEM_CLASSE.map((k) => {
      const itens = alvo.map((a, i) => ({ a, i })).filter((x) => x.a.classe === k);
      if (!itens.length) return '';
      const tot = itens.reduce((s, x) => s + x.a.perc, 0);
      return `<tr class="inv-tr-cls"><td colspan="3">${I.NOME_CLASSE[k]}</td><td class="n">${pct(tot)}</td><td class="n">${C.brl(tot * cfgCalc().patMeta)}</td><td></td></tr>
        ${itens.map(({ a, i }) => `<tr>
          <td><strong>${esc(a.ativo.length > 16 ? a.nome : a.ativo)}</strong></td>
          <td class="inv-nome">${esc(a.ativo.length > 16 ? a.ativo : a.nome)}</td>
          <td>${a.tipoRef === 'EM_REVISAO' ? '<span class="selo ouro">em revisão</span>' : a.tipoRef === 'PRECO_MAX' && a.valRef ? `máx ${C.brl(a.valRef)}` : ''}</td>
          <td class="n"><input type="text" class="inv-pct" data-inv="alvo-pct" data-i="${i}" value="${C.num(a.perc * 100, 2)}" inputmode="decimal" aria-label="% de ${esc(a.ativo)}"></td>
          <td class="n">${C.brl(a.perc * cfgCalc().patMeta)}</td>
          <td class="n"><button type="button" class="btn-texto" data-acao="inv-alvo-del" data-id="${i}" title="Remover do alvo" aria-label="Remover">✕</button></td>
        </tr>`).join('')}`;
    }).join('');
    return `<section class="bloco">
      <details class="detalhe inv-alvo" ${det('alvo')}>
        <summary>Carteira-alvo (Finclass) · ${alvo.length} ativos · soma <span class="${okSoma ? 'desce' : 'sobe'}">${pct(soma)}</span></summary>
        <div class="inv-fav">
          <div><strong>Atualizar pela Finclass</strong>${st.R.finclass?.atualizadaEm ? ` <span class="selo">última: revisão de ${dataBR(String(st.R.finclass.atualizadaEm).slice(0, 10))}</span>` : ''}</div>
          <ol>
            <li>No computador, <strong>arraste</strong> este botão para a barra de favoritos do Chrome (Ctrl+Shift+B mostra a barra):
              <a class="btn inv-fav-btn" href="${esc(I.codigoFavorito(location.origin + location.pathname))}" onclick="return false" title="Arraste para a barra de favoritos">◈ Enviar para o Nossos Gastos</a></li>
            <li>Abra a página <strong>Carteira</strong> da Finclass e espere carregar.</li>
            <li>Clique no favorito. O app abre mostrando o que mudou, e você confirma.</li>
          </ol>
        </div>
        <p class="nota">${proprio ? 'Esta é a sua cópia — editar aqui não muda a Finclass.' : 'Usando o alvo embutido (Finclass de 23/10/2026). Ao editar qualquer linha, ele vira a sua cópia salva.'}</p>
        <div class="tabela-wrap"><table>
          <thead><tr><th>Ativo</th><th>Nome</th><th>Referência</th><th class="n">% alvo</th><th class="n">R$</th><th></th></tr></thead>
          <tbody>${linhas}</tbody>
        </table></div>
        <div class="inv-add">
          <select id="inv-novo-classe" aria-label="Classe">${I.ORDEM_CLASSE.filter((k) => k !== 'OUTROS').map((k) => `<option value="${k}">${I.NOME_CLASSE[k]}</option>`).join('')}</select>
          <input type="text" id="inv-novo-ativo" placeholder="Ticker (ex.: ITSA4)" autocomplete="off">
          <input type="text" id="inv-novo-nome" placeholder="Nome" autocomplete="off">
          <input type="text" id="inv-novo-pct" placeholder="% (ex.: 2,5)" inputmode="decimal" autocomplete="off">
          <input type="text" id="inv-novo-pmax" placeholder="Preço máx. (opcional)" inputmode="decimal" autocomplete="off">
          <button type="button" class="btn" data-acao="inv-alvo-add">Adicionar</button>
        </div>
        <div class="acoes" style="margin-top:12px">
          <label class="btn">Importar carteira-alvo.xlsx<input type="file" id="inv-arq-alvo" accept=".xlsx,.xls,.csv" hidden></label>
          ${proprio ? '<button type="button" class="btn btn-texto btn-perigo" data-acao="inv-alvo-padrao">Voltar ao alvo embutido</button>' : ''}
        </div>
      </details>
    </section>`;
  }

  function blocoFinclass() {
    const F = st.finclass;
    if (!F) return '';
    let r;
    try { r = I.lerFinclass(F.dados, alvoAtivo()); } catch (e) {
      return `<section class="bloco inv-alerta"><h3>Carteira da Finclass</h3><p class="erro">${esc(e.message)}</p>
        <div class="acoes"><button type="button" class="btn" data-acao="inv-fc-descartar">Fechar</button></div></section>`;
    }
    const mud = I.diffAlvo(alvoAtivo(), r.itens);
    const quando = r.atualizadaEm ? dataBR(String(r.atualizadaEm).slice(0, 10)) : '';
    const muda = r.valor && Math.abs(r.valor - Number(st.R.cfg.patMeta)) > 0.5;
    const ROT = { entrou: 'Entrou', saiu: 'Saiu', '%': '% mudou', 'referência': 'Preço / taxa' };
    return `<section class="bloco inv-fc">
      <div class="bloco-cab"><h2>Atualização da Finclass</h2>
        <span class="nota">${esc(r.titulo || 'Carteira')}${quando ? ` · revisada pela Finclass em <strong>${quando}</strong>` : ''}</span></div>
      ${mud.length ? `<div class="tabela-wrap"><table>
          <thead><tr><th>Mudança</th><th>Ativo</th><th>Antes</th><th>Agora</th></tr></thead>
          <tbody>${mud.map((m) => `<tr><td><span class="selo${m.tipo === 'saiu' ? ' inv-sell-s' : m.tipo === 'entrou' ? ' ouro' : ''}">${ROT[m.tipo] || esc(m.tipo)}</span></td>
            <td><strong>${esc(m.ativo.length > 16 ? r.itens.concat(alvoAtivo()).find((x) => x.ativo === m.ativo)?.nome || m.ativo : m.ativo)}</strong></td>
            <td>${esc(m.de || '—')}</td><td>${esc(m.para || '—')}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="nota">Nenhuma mudança: a sua carteira-alvo já está igual à da Finclass.</p>'}
      ${r.avisos.length ? `<ul class="inv-avisos">${r.avisos.map((a) => `<li>${a}</li>`).join('')}</ul>` : ''}
      ${muda ? `<label class="inv-check" style="margin-top:12px"><input type="checkbox" data-inv="fc-valor" ${F.usarValor ? 'checked' : ''}>
        <span>Usar também o valor investido da Finclass: <strong>${C.brl(r.valor)}</strong> (hoje: ${C.brl(st.R.cfg.patMeta)})</span></label>` : ''}
      <div class="acoes" style="margin-top:14px">
        <button type="button" class="btn btn-cheio" data-acao="inv-fc-aplicar">${mud.length ? `Aplicar ${mud.length} mudança(s)` : 'Ok'}</button>
        <button type="button" class="btn" data-acao="inv-fc-descartar">Descartar</button>
      </div>
    </section>`;
  }

  function vInvest() {
    if (!st.R) return '<p class="vazio">Carregando investimentos…</p>';
    const { todas, insts, sel, pos, res, erroCalc } = estado();
    let corpo;
    if (!todas.length) {
      corpo = `<section class="bloco"><p class="vazio">Carregue o relatório de posição da B3 para comparar com a carteira da Finclass.</p></section>`;
    } else if (erroCalc) {
      corpo = `<section class="bloco"><p class="erro">Erro no cálculo: ${esc(erroCalc)}</p></section>`;
    } else if (!pos.length) {
      corpo = `<section class="bloco"><p class="vazio">Nenhuma posição nas instituições marcadas.</p></section>`;
    } else {
      corpo = blocoResumo(res) + blocoClasses(res) + blocoAvisos(res);
    }
    return blocoSetup() + blocoFinclass() + blocoArquivos(insts, sel, todas) + blocoPlano(res) + corpo + blocoAlvo()
      + '<p class="nota">Ferramenta de cálculo: os percentuais vêm da sua carteira-alvo. Confira preço e liquidez antes de executar qualquer ordem.</p>';
  }

  // -------------------------------------------------------------------
  // ações
  // -------------------------------------------------------------------
  async function lerWb(file) {
    const XLSX = await garantirXLSX();
    const buf = await file.arrayBuffer();
    return { XLSX, wb: XLSX.read(new Uint8Array(buf), { type: 'array' }) };
  }
  async function carregarPosicao(file) {
    const { XLSX, wb } = await lerWb(file);
    const r = I.lerPosicoes(wb, XLSX);
    if (!r.posicoes.length) throw new Error('nenhuma linha com coluna Produto/Ativo encontrada');
    st.R.posicoes = r.posicoes;
    st.R.data = r.data;
    st.R.arquivo = file.name;
    // se as instituições marcadas não existem neste arquivo, volta ao padrão
    const insts = I.instituicoes(r.posicoes);
    if (st.R.instSel && !st.R.instSel.some((i) => insts.includes(i))) st.R.instSel = null;
    await salvar();
    r.avisos.forEach((a) => console.warn(a));
    toast(`${r.posicoes.length} posições lidas${r.data ? ` (${dataBR(r.data)})` : ''}`);
  }
  async function carregarAlvo(file) {
    const { XLSX, wb } = await lerWb(file);
    const { itens, config } = I.lerAlvo(wb, XLSX);
    st.R.alvo = itens;
    if (config.PATRIMONIO_REFERENCIA) st.R.cfg.patMeta = I.num(config.PATRIMONIO_REFERENCIA);
    if (config.TOLERANCIA_PP) st.R.cfg.tol = +(I.num(config.TOLERANCIA_PP) * 100).toFixed(2);
    if (config.JANELA_ANOS_TESOURO) st.R.cfg.janela = I.num(config.JANELA_ANOS_TESOURO);
    await salvar();
    toast(`Carteira-alvo importada: ${itens.length} ativos`);
  }
  // primeira edição transforma o alvo embutido em cópia própria
  const alvoEditavel = () => { if (!st.R.alvo) st.R.alvo = I.ALVO_PADRAO.map((a) => ({ ...a })); return st.R.alvo; };
  const lerNum = (t) => { const r = C.avaliarValor(String(t || '').replace(/%/g, '')); return r.ok ? r.valor : NaN; };

  // devolve true se tratou o clique
  async function onClick(acao, b) {
    if (!acao || !acao.startsWith('inv-')) return false;
    switch (acao) {
      case 'inv-cfg': {
        const { k, v } = b.dataset;
        st.R.cfg[k] = v;
        await salvar(); render(); return true;
      }
      case 'inv-sync': await sincronizarAgora(false); return true;
      case 'inv-fc-aplicar': {
        const r = I.lerFinclass(st.finclass.dados, alvoAtivo());
        const n = I.diffAlvo(alvoAtivo(), r.itens).length;
        st.R.alvo = r.itens;
        st.R.finclass = { titulo: r.titulo, atualizadaEm: r.atualizadaEm, importadoEm: new Date().toISOString() };
        if (st.finclass.usarValor && r.valor) st.R.cfg.patMeta = r.valor;
        st.finclass = null;
        history.replaceState(null, '', '#invest');
        await salvar(); render();
        toast(n ? `Carteira-alvo atualizada: ${n} mudança(s)` : 'Carteira-alvo conferida: nada mudou');
        return true;
      }
      case 'inv-fc-descartar':
        st.finclass = null; history.replaceState(null, '', '#invest'); render(); return true;
      case 'inv-of-add': {
        const id = document.getElementById('inv-of-id')?.value.trim();
        const nome = document.getElementById('inv-of-nome')?.value.trim() || 'XP';
        if (!/^[0-9a-f-]{20,}$/i.test(id || '')) { toast('Cole o Item ID (formato 1a2b3c4d-…)', true); return true; }
        const lista = itensPluggy();
        if (lista.some((i) => i.id === id)) { toast('Essa conexão já está cadastrada', true); return true; }
        st.R.pluggyItens = [...lista, { id, nome }];
        st.abertos.add('of');
        await salvar(); render();
        await sincronizarAgora(false);
        return true;
      }
      case 'inv-of-del': {
        const id = b.dataset.id;
        if (!confirm('Remover esta conexão? A última posição sincronizada continua salva.')) return true;
        st.R.pluggyItens = itensPluggy().filter((i) => i.id !== id);
        await salvar(); render(); return true;
      }
      case 'inv-inst-xp': st.R.instSel = I.instPadrao(I.instituicoes(st.R.posicoes)); await salvar(); render(); return true;
      case 'inv-inst-todas': st.R.instSel = I.instituicoes(st.R.posicoes); await salvar(); render(); return true;
      case 'inv-csv': {
        if (!st.ultimo) return true;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([I.paraCsv(st.ultimo)], { type: 'text/csv;charset=utf-8' }));
        a.download = `plano-rebalanceamento-${st.R.data || 'hoje'}.csv`;
        a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        return true;
      }
      case 'inv-alvo-del': {
        const i = Number(b.dataset.id); const alvo = alvoEditavel(); const a = alvo[i];
        if (!a || !confirm(`Remover ${a.ativo} da carteira-alvo?`)) return true;
        alvo.splice(i, 1); await salvar(); render(); return true;
      }
      case 'inv-alvo-padrao':
        if (!confirm('Descartar a sua cópia e voltar ao alvo embutido?')) return true;
        st.R.alvo = null; await salvar(); render(); return true;
      case 'inv-alvo-add': {
        const v = (id) => document.getElementById(id)?.value.trim() || '';
        const ativo = v('inv-novo-ativo').toUpperCase(); const p = lerNum(v('inv-novo-pct'));
        const pmax = v('inv-novo-pmax') ? lerNum(v('inv-novo-pmax')) : 0;
        if (!ativo) { toast('Informe o ticker', true); return true; }
        if (!Number.isFinite(p) || p <= 0 || p > 100) { toast('Informe o % (entre 0 e 100)', true); return true; }
        const alvo = alvoEditavel();
        if (alvo.some((a) => I.norm(a.ativo) === I.norm(ativo))) { toast(`${ativo} já está no alvo`, true); return true; }
        alvo.push({ classe: v('inv-novo-classe') || 'ACOES', ativo, nome: v('inv-novo-nome') || ativo, perc: p / 100,
          grupo: I.raiz(ativo) || ativo, equiv: 'NAO', alias: '', tipoRef: pmax > 0 ? 'PRECO_MAX' : '', valRef: pmax > 0 ? pmax : null, obs: '' });
        await salvar(); render(); toast(`${ativo} adicionado`); return true;
      }
      default: return false;
    }
  }

  // devolve true se tratou a mudança
  async function onChange(el) {
    try {
      if (el.id === 'inv-arq-pos' || el.id === 'inv-arq-alvo') {
        const f = el.files?.[0]; if (!f) return true;
        await (el.id === 'inv-arq-pos' ? carregarPosicao(f) : carregarAlvo(f));
        render(); return true;
      }
      const tipo = el.dataset?.inv;
      if (!tipo) return false;
      if (tipo === 'fc-valor') { if (st.finclass) st.finclass.usarValor = el.checked; return true; }
      if (tipo === 'inst') {
        const marcadas = [...document.querySelectorAll('[data-inv=inst]')].filter((x) => x.checked).map((x) => x.value);
        st.R.instSel = marcadas;
      } else if (tipo === 'cfg') {
        st.R.cfg[el.name] = el.type === 'checkbox' ? el.checked : Math.max(0, Number(el.value) || 0);
      } else if (tipo === 'alvo-pct') {
        const p = lerNum(el.value);
        if (!Number.isFinite(p) || p < 0 || p > 100) { toast('Use um % entre 0 e 100', true); render(); return true; }
        alvoEditavel()[Number(el.dataset.i)].perc = p / 100;
      } else return false;
      await salvar(); render(); return true;
    } catch (e) {
      falha(e, 'Não foi possível ler o arquivo');
      if (el.type === 'file') el.value = '';
      return true;
    }
  }

  return { carregar, vInvest, onClick, onChange };
}
