/* Sorteio de alunos — tudo fica guardado neste aparelho, nada vai pra internet. */

(function () {
'use strict';

var CHAVE = 'sorteio-alunos-v1';

var PESOS_PADRAO = { certo: 1, errou: 0.7, naoSabe: 0.4, recusou: 0 };

var ROTULOS = {
  certo:   'Respondeu certo',
  errou:   'Respondeu, mas errou',
  naoSabe: 'Disse que não sabe',
  recusou: 'Se recusou a responder'
};

// os mesmos símbolos dos botões, reaproveitados na lista de notas
var GLIFOS = { certo: '✓', errou: '≈', naoSabe: '?', recusou: '✕' };

var dados = null;
var sorteado = null;     // id do aluno que está na tela
var ultimaAcao = null;   // guarda o que dá pra desfazer
var girando = false;
var ordemNotas = 'nome';
var armazenamentoOk = true;
var segurando = null;    // botão de resultado que está sendo segurado agora
var travado = false;     // segura o app durante o estouro do dobro

/* ---------- atalhos ---------- */

function $(s) { return document.querySelector(s); }
function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }

function cria(tag, classe, texto) {
  var e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto != null) e.textContent = texto;
  return e;
}

function novoId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function aleatorio(n) {
  if (n <= 1) return 0;
  if (window.crypto && crypto.getRandomValues) {
    var a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % n;
  }
  return Math.floor(Math.random() * n);
}

function hoje() {
  var d = new Date();
  return d.getFullYear() + '-' +
         String(d.getMonth() + 1).padStart(2, '0') + '-' +
         String(d.getDate()).padStart(2, '0');
}

function num(n) { return Number(n).toFixed(1).replace('.', ','); }

function comSinal(v) { return (v > 0 ? '+' : '') + num(v); }

function dataCurta(iso) {
  var d = new Date(iso);
  if (isNaN(d)) return '';
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
}

// tira acentos e maiúsculas, só para comparar nomes ("José" e "jose" são o mesmo)
function normalizar(s) {
  var t = String(s).trim().toLowerCase().normalize('NFD');
  var saida = '';
  for (var i = 0; i < t.length; i++) {
    var c = t.charCodeAt(i);
    if (c < 768 || c > 879) saida += t.charAt(i);   // 768 a 879 = marcas de acento
  }
  return saida;
}

/* ---------- busca por som ---------- */

// reescreve o nome do jeito que ele soa, para "cami" encontrar "Kamila":
// c e k viram a mesma letra, y vira i, w vira v, h some, letra dobrada vira uma só.
function fonetica(s) {
  var t = normalizar(String(s).replace(/ç/gi, 's'));
  t = t.replace(/[^a-z0-9 ]+/g, ' ');
  t = t.replace(/ph/g, 'f');
  t = t.replace(/[cs]h/g, 'x');        // Chris, Sheila
  t = t.replace(/lh/g, 'l');
  t = t.replace(/nh/g, 'n');
  t = t.replace(/qu/g, 'k');           // Quiteria
  // o G marcado em maiúscula é o de som duro (Guilherme, Miguel), para a
  // linha seguinte não trocá-lo por J; depois ele volta a ser g minúsculo
  t = t.replace(/gu([ei])/g, 'G$1');
  t = t.replace(/g([ei])/g, 'j$1');    // Gerson / Jerson
  t = t.replace(/G/g, 'g');
  t = t.replace(/c([ei])/g, 's$1');    // Cecilia
  t = t.replace(/[cq]/g, 'k');         // Camila / Kamila
  t = t.replace(/z/g, 's');            // Luiz / Luis
  t = t.replace(/y/g, 'i');            // Tayná / Tainá
  t = t.replace(/w/g, 'v');            // Wanderson / Vanderson
  t = t.replace(/h/g, '');             // Thiago / Tiago
  t = t.replace(/(.)\1+/g, '$1');      // Jessica / Jéssyka
  return t.replace(/\s+/g, ' ').trim();
}

// quantas correções faltam para o que foi digitado virar o começo da palavra.
// serve para perdoar letra trocada ou faltando ("kmila" ainda acha "Kamila").
function distanciaInicio(busca, palavra) {
  var m = busca.length, n = palavra.length, i, j;
  if (!m) return 0;

  var anterior = [], atual = [];
  for (j = 0; j <= n; j++) anterior[j] = j;

  for (i = 1; i <= m; i++) {
    atual[0] = i;
    for (j = 1; j <= n; j++) {
      var custo = busca.charAt(i - 1) === palavra.charAt(j - 1) ? 0 : 1;
      atual[j] = Math.min(anterior[j] + 1, atual[j - 1] + 1, anterior[j - 1] + custo);
    }
    for (j = 0; j <= n; j++) anterior[j] = atual[j];
  }

  var menor = anterior[0];
  for (j = 1; j <= n; j++) if (anterior[j] < menor) menor = anterior[j];
  return menor;
}

// nota de 0 a 100 de um pedaço digitado contra um nome; -1 quando não combina
function pontuarPedaco(pedaco, palavras, inteiro) {
  var melhor = -1;

  for (var i = 0; i < palavras.length; i++) {
    var p = palavras[i];
    var pos = p.indexOf(pedaco);
    var pontos = -1;

    if (pos === 0) pontos = 100;                 // começa igual
    else if (pos > 0) pontos = 70;               // aparece no meio da palavra
    else {
      // sobra de erro: nomes curtos perdoam menos, senão tudo vira resultado
      var folga = pedaco.length <= 3 ? 0 : pedaco.length <= 6 ? 1 : 2;
      var d = distanciaInicio(pedaco, p);
      if (d <= folga) pontos = 86 - d * 18;
    }

    if (pontos >= 0) pontos -= i * 3;            // o primeiro nome pesa mais
    if (pontos > melhor) melhor = pontos;
  }

  // última tentativa: nome inteiro sem espaços, para quem digita "anasilva"
  if (melhor < 0 && inteiro.indexOf(pedaco) !== -1) melhor = 45;
  return melhor;
}

function pontuarNome(nome, pedacos) {
  var f = fonetica(nome);
  var palavras = f.split(' ');
  var inteiro = f.replace(/ /g, '');
  var total = 0;

  for (var i = 0; i < pedacos.length; i++) {
    var p = pontuarPedaco(pedacos[i], palavras, inteiro);
    if (p < 0) return -1;                        // todo pedaço digitado tem de bater
    total += p;
  }
  // empate: nome mais curto primeiro, porque costuma ser o que se procurava
  return total * 1000 - f.length;
}

function buscarAlunos(turma, texto) {
  var pedacos = fonetica(texto).split(' ').filter(function (p) { return p; });

  var lista = turma.alunos.slice().sort(function (a, b) {
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });
  if (!pedacos.length) return lista;

  return lista
    .map(function (a) { return { aluno: a, pontos: pontuarNome(a.nome, pedacos) }; })
    .filter(function (x) { return x.pontos >= 0; })
    .sort(function (a, b) { return b.pontos - a.pontos; })
    .map(function (x) { return x.aluno; });
}

/* ---------- guardar e ler ---------- */

function estruturaVazia() {
  return {
    versao: 1,
    turmaAtiva: null,
    pesos: Object.assign({}, PESOS_PADRAO),
    efeitos: true,
    turmas: [],
    registros: [],
    rodadas: {},
    ausencias: {}
  };
}

function testarArmazenamento() {
  try {
    localStorage.setItem('__teste__', '1');
    localStorage.removeItem('__teste__');
    return true;
  } catch (e) {
    return false;
  }
}

function carregar() {
  armazenamentoOk = testarArmazenamento();
  var bruto = null;
  try { bruto = localStorage.getItem(CHAVE); } catch (e) { bruto = null; }

  if (bruto) {
    try { dados = JSON.parse(bruto); } catch (e) { dados = null; }
  }
  if (!dados || typeof dados !== 'object') dados = estruturaVazia();

  // conserta pedaços que possam faltar
  var vazio = estruturaVazia();
  ['pesos', 'turmas', 'registros', 'rodadas', 'ausencias'].forEach(function (k) {
    if (!dados[k]) dados[k] = vazio[k];
  });
  Object.keys(PESOS_PADRAO).forEach(function (k) {
    if (typeof dados.pesos[k] !== 'number' || isNaN(dados.pesos[k])) dados.pesos[k] = PESOS_PADRAO[k];
  });
  if (typeof dados.efeitos !== 'boolean') dados.efeitos = true;

  if (!dados.turmas.length) {
    dados.turmas.push({ id: novoId(), nome: 'Turma 1', alunos: [] });
  }
  if (!turmaAtual()) dados.turmaAtiva = dados.turmas[0].id;
}

function salvar() {
  if (!armazenamentoOk) return;
  try {
    localStorage.setItem(CHAVE, JSON.stringify(dados));
  } catch (e) {
    armazenamentoOk = false;
    mostrarAviso('Não consegui salvar. A memória do navegador pode estar cheia. Baixe um backup em Ajustes antes de continuar.');
  }
}

function mostrarAviso(texto) {
  var el = $('#avisoArmazenamento');
  el.textContent = texto;
  el.classList.remove('oculto');
}

/* ---------- consultas ---------- */

function turmaAtual() {
  for (var i = 0; i < dados.turmas.length; i++) {
    if (dados.turmas[i].id === dados.turmaAtiva) return dados.turmas[i];
  }
  return null;
}

function alunoPorId(turma, id) {
  for (var i = 0; i < turma.alunos.length; i++) {
    if (turma.alunos[i].id === id) return turma.alunos[i];
  }
  return null;
}

function rodada(turmaId) {
  if (!Array.isArray(dados.rodadas[turmaId])) dados.rodadas[turmaId] = [];
  return dados.rodadas[turmaId];
}

// faltas valem só para o dia de hoje; amanhã a lista zera sozinha
function ausentes(turmaId) {
  var a = dados.ausencias[turmaId];
  if (!a || a.data !== hoje() || !Array.isArray(a.ids)) {
    dados.ausencias[turmaId] = { data: hoje(), ids: [] };
  }
  return dados.ausencias[turmaId].ids;
}

function disponiveis(turma) {
  var feitos = rodada(turma.id);
  var faltaram = ausentes(turma.id);
  return turma.alunos.filter(function (a) {
    return feitos.indexOf(a.id) === -1 && faltaram.indexOf(a.id) === -1;
  });
}

// pergunta desafiadora conta 2; registro antigo, sem o campo, conta 1
function multiploDe(registro) {
  return registro.mult === 2 ? 2 : 1;
}

function estatisticas(turma) {
  var regs = dados.registros.filter(function (r) { return r.turmaId === turma.id; });
  return turma.alunos.map(function (a) {
    var meus = regs.filter(function (r) { return r.alunoId === a.id; });
    var soma = 0, divisor = 0, dobros = 0;

    meus.forEach(function (r) {
      var m = multiploDe(r);
      var p = dados.pesos[r.resultado];
      soma += (typeof p === 'number' ? p : 0) * m;
      divisor += m;                       // a pergunta em dobro pesa por duas
      if (m > 1) dobros++;
    });

    return {
      aluno: a,
      vezes: meus.length,
      dobros: dobros,
      soma: soma,
      nota: divisor ? (soma / divisor) * 10 : null,
      registros: meus
    };
  });
}

// quantos "respondeu certo" seguidos a turma emendou até agora
function sequencia(turma) {
  var regs = dados.registros.filter(function (r) { return r.turmaId === turma.id; });
  var n = 0;
  for (var i = regs.length - 1; i >= 0; i--) {
    if (regs[i].resultado === 'certo') n++; else break;
  }
  return n;
}

/* ---------- enfeites ---------- */

function iniciais(nome) {
  var p = String(nome).trim().split(/\s+/);
  var a = p[0] ? p[0].charAt(0) : '?';
  var b = p.length > 1 ? p[p.length - 1].charAt(0) : '';
  return (a + b).toUpperCase();
}

// cada aluno ganha sempre a mesma cor, calculada a partir do nome
function matiz(nome) {
  var h = 0;
  for (var i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) % 360;
  return h;
}

function pintarAvatar(el, nome) {
  var h = matiz(nome);
  el.style.setProperty('--h', h);
  el.style.setProperty('--h2', (h + 42) % 360);
  el.textContent = iniciais(nome);
}

function vibrar(padrao) {
  if (!dados.efeitos || !navigator.vibrate) return;
  try { navigator.vibrate(padrao); } catch (e) {}
}

/* Um único desenho no ar para tudo: confete e fumaça dourada dividem a mesma
   tela e o mesmo laço, senão um apagaria o outro no meio do caminho. */

var pecas = [];
var lacoLigado = false;
var ctxFesta = null, largFesta = 0, altFesta = 0;

function prepararTela() {
  var tela = $('#festa');
  if (!tela || !tela.getContext || !window.requestAnimationFrame) return null;
  var ctx = tela.getContext('2d');
  if (!ctx) return null;

  var dpr = window.devicePixelRatio || 1;
  largFesta = window.innerWidth;
  altFesta = window.innerHeight;

  var lp = Math.round(largFesta * dpr), ap = Math.round(altFesta * dpr);
  if (tela.width !== lp || tela.height !== ap) {
    tela.width = lp;
    tela.height = ap;
    tela.style.width = largFesta + 'px';
    tela.style.height = altFesta + 'px';
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctxFesta = ctx;
  return ctx;
}

function ligarLaco() {
  if (lacoLigado) return;
  lacoLigado = true;
  requestAnimationFrame(quadro);
}

function quadro() {
  var ctx = ctxFesta;
  if (!ctx) { lacoLigado = false; pecas = []; return; }

  ctx.clearRect(0, 0, largFesta, altFesta);

  var agora = Date.now();
  var vivas = [];

  for (var i = 0; i < pecas.length; i++) {
    var p = pecas[i];
    var t = (agora - p.inicio) / p.vida;
    if (t >= 1) continue;                     // acabou o tempo dela
    if (p.tipo === 'fumaca') pintarFumaca(ctx, p, t);
    else pintarConfete(ctx, p, t);
    vivas.push(p);
  }

  pecas = vivas;

  if (pecas.length) requestAnimationFrame(quadro);
  else { lacoLigado = false; ctx.clearRect(0, 0, largFesta, altFesta); }
}

function pintarConfete(ctx, p, t) {
  p.vx *= 0.986;
  p.vy += p.peso;
  p.x += p.vx;
  p.y += p.vy;
  p.giro += p.vgiro;

  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - t * t);
  ctx.translate(p.x, p.y);
  ctx.rotate(p.giro);
  ctx.fillStyle = p.cor;
  ctx.fillRect(-p.larg / 2, -p.alt / 2, p.larg, p.alt);
  ctx.restore();
}

// baforada dourada: sobe, abre e some, com brilho somado para parecer luz
function pintarFumaca(ctx, p, t) {
  p.vy += p.empuxo;
  p.vx *= 0.98;
  p.x += p.vx;
  p.y += p.vy;
  p.raio += p.abre;

  var a = p.forca * Math.min(1, t * 5) * (1 - t) * (1 - t);
  if (a <= 0.002) return;

  var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.raio);
  g.addColorStop(0, 'rgba(253, 230, 138, ' + a.toFixed(3) + ')');
  g.addColorStop(0.45, 'rgba(251, 191, 36, ' + (a * 0.45).toFixed(3) + ')');
  g.addColorStop(1, 'rgba(251, 191, 36, 0)');

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.raio, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function festaDe(ox, oy, cores, quantidade) {
  if (!dados.efeitos || !prepararTela()) return;
  var agora = Date.now();

  for (var i = 0; i < quantidade; i++) {
    var ang = Math.random() * Math.PI * 2;
    var vel = 3 + Math.random() * 7.5;
    pecas.push({
      tipo: 'confete',
      inicio: agora, vida: 1150,
      x: ox, y: oy,
      vx: Math.cos(ang) * vel,
      vy: Math.sin(ang) * vel - 3.5,
      peso: 0.20 + Math.random() * 0.16,
      larg: 4 + Math.random() * 5,
      alt: 3 + Math.random() * 4,
      giro: Math.random() * Math.PI,
      vgiro: (Math.random() - 0.5) * 0.4,
      cor: cores[i % cores.length]
    });
  }
  ligarLaco();
}

function festa(cores, quantidade) {
  if (!dados.efeitos || !prepararTela()) return;
  // sai do meio do palco; se ele estiver escondido, sai do meio da tela
  var caixa = $('#palco').getBoundingClientRect();
  festaDe(caixa.width ? caixa.left + caixa.width / 2 : largFesta / 2,
          caixa.width ? caixa.top + caixa.height / 2 : altFesta / 2.4,
          cores, quantidade);
}

// a fumaça dourada que sobe de dentro do botão segurado
function fumacaDourada(caixa) {
  if (!dados.efeitos || !prepararTela()) return;
  var agora = Date.now();

  for (var i = 0; i < 26; i++) {
    var lado = Math.random();
    pecas.push({
      tipo: 'fumaca',
      inicio: agora + Math.random() * 130,
      vida: 900 + Math.random() * 620,
      x: caixa.left + lado * caixa.width,
      y: caixa.top + caixa.height * (0.35 + Math.random() * 0.5),
      vx: (lado - 0.5) * 2.6 + (Math.random() - 0.5) * 1.2,
      vy: -1.4 - Math.random() * 2.2,
      empuxo: -0.045,                       // vai ficando mais rápido pra cima
      raio: 10 + Math.random() * 20,
      abre: 0.85 + Math.random() * 0.9,
      forca: 0.30 + Math.random() * 0.3
    });
  }

  // faíscas douradas junto, para a fumaça não ficar só um borrão
  for (var j = 0; j < 16; j++) {
    var ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
    var vel = 3.5 + Math.random() * 6;
    pecas.push({
      tipo: 'confete',
      inicio: agora, vida: 1000 + Math.random() * 300,
      x: caixa.left + Math.random() * caixa.width,
      y: caixa.top + caixa.height / 2,
      vx: Math.cos(ang) * vel,
      vy: Math.sin(ang) * vel,
      peso: 0.10 + Math.random() * 0.10,
      larg: 3 + Math.random() * 3,
      alt: 2 + Math.random() * 3,
      giro: Math.random() * Math.PI,
      vgiro: (Math.random() - 0.5) * 0.5,
      cor: ['#fde68a', '#fbbf24', '#f59e0b', '#fff7d6'][j % 4]
    });
  }
  ligarLaco();
}

function sacudirTela() {
  if (!dados.efeitos) return;
  var m = document.querySelector('main');
  m.classList.remove('sacode');
  void m.offsetWidth;              // reinicia a animação se ela já estava rodando
  m.classList.add('sacode');
  setTimeout(function () { m.classList.remove('sacode'); }, 500);
}

var FLASHES = ['flash-certo', 'flash-errou', 'flash-naoSabe', 'flash-recusou'];

function piscarPalco(resultado) {
  var palco = $('#palco');
  FLASHES.forEach(function (c) { palco.classList.remove(c); });
  palco.classList.add('flash-' + resultado);
  setTimeout(function () { palco.classList.remove('flash-' + resultado); }, 950);
}

/* ---------- navegação ---------- */

function renderTopo(t) {
  document.getElementById('nomeTurmaTopo').textContent = t.nome;
  var seq = sequencia(t);
  var chip = $('#chipSequencia');
  if (seq >= 2) {
    chip.classList.remove('oculto');
    chip.textContent = '🔥 ' + seq + ' seguidos';
  } else {
    chip.classList.add('oculto');
  }
}

function irPara(nome) {
  $$('.tela').forEach(function (t) { t.classList.toggle('ativa', t.id === 'tela-' + nome); });
  $$('.rodape button').forEach(function (b) { b.classList.toggle('ativo', b.dataset.ir === nome); });
  window.scrollTo(0, 0);
  if (nome === 'sortear') renderSortear();
  if (nome === 'notas') renderNotas();
  if (nome === 'turma') renderTurma();
  if (nome === 'ajustes') renderAjustes();
}

/* ---------- tela de sortear ---------- */

function repouso(mensagem, dica) {
  sorteado = null;
  var palco = $('#palco');
  palco.classList.remove('revelado', 'girando');
  $('#palcoNome').textContent = mensagem;
  $('#palcoDica').textContent = dica;
  $('#acoesResultado').classList.add('oculto');
  $('#acoesSorteio').classList.remove('oculto');
  $('#btnFaltou').classList.remove('oculto');
  $('#btnSortear').disabled = false;
}

// uma bolinha por aluno: acesa quem já caiu, contornada quem faltou hoje
function renderPips(t) {
  var caixa = $('#pips');
  caixa.textContent = '';
  var feitos = rodada(t.id);
  var faltaram = ausentes(t.id);
  t.alunos.forEach(function (a) {
    var p = document.createElement('i');
    if (faltaram.indexOf(a.id) !== -1) p.className = 'faltou';
    else if (feitos.indexOf(a.id) !== -1) p.className = 'feito';
    caixa.appendChild(p);
  });
}

function renderSortear() {
  var t = turmaAtual();
  renderTopo(t);

  var total = t.alunos.length;
  var jaForam = rodada(t.id).filter(function (id) { return alunoPorId(t, id); }).length;
  var faltaram = ausentes(t.id).filter(function (id) { return alunoPorId(t, id); });

  renderPips(t);
  $('#textoProgresso').textContent = total
    ? jaForam + ' de ' + total + ' já caíram nesta rodada'
    : 'nenhum aluno cadastrado nesta turma';

  var chip = $('#ausentesChip');
  if (faltaram.length) {
    chip.classList.remove('oculto');
    $('#ausentesTexto').textContent = faltaram.length === 1
      ? '1 aluno marcado como falta hoje'
      : faltaram.length + ' alunos marcados como falta hoje';
  } else {
    chip.classList.add('oculto');
  }

  $$('[data-peso]').forEach(function (el) {
    el.textContent = comSinal(dados.pesos[el.dataset.peso]);
  });

  if (!total && !sorteado && !girando) {
    repouso('Sem alunos', 'Vá em Turmas e cadastre a lista');
  }

  atualizarDesfazer();
}

/* ---------- segurar o botão: a resposta vale o dobro ---------- */

var SEGURAR_MS = 1000;   // quanto tempo de dedo no botão para valer o dobro

// enquanto o dedo fica no botão, a barra dentro dele enche. ao encher de vez,
// o botão estoura, sai fumaça dourada e a resposta é registrada valendo dobro.
function comecarSegurar(botao, resultado, e) {
  if (girando || travado || !sorteado) return;
  if (e.button != null && e.button > 0) return;     // só o botão principal do mouse

  soltarSegurar();
  segurando = { botao: botao, resultado: resultado, inicio: Date.now(), raf: 0 };
  botao.style.setProperty('--carga', '0');   // zera antes de acender, nunca depois
  botao.classList.add('segurando');
  vibrar(8);
  segurando.raf = requestAnimationFrame(passoSegurar);
}

function passoSegurar() {
  if (!segurando) return;
  var p = (Date.now() - segurando.inicio) / SEGURAR_MS;
  if (p > 1) p = 1;
  segurando.botao.style.setProperty('--carga', p.toFixed(3));

  if (p >= 1) { estourarDobro(); return; }
  segurando.raf = requestAnimationFrame(passoSegurar);
}

function soltarSegurar() {
  if (!segurando) return;
  cancelAnimationFrame(segurando.raf);
  segurando.botao.classList.remove('segurando');
  segurando.botao.style.setProperty('--carga', '0');
  segurando = null;
}

function estourarDobro() {
  var botao = segurando.botao;
  var resultado = segurando.resultado;
  soltarSegurar();

  travado = true;                       // ninguém registra nada durante o estouro

  botao.classList.remove('estourou');
  void botao.offsetWidth;
  botao.classList.add('estourou');

  fumacaDourada(botao.getBoundingClientRect());
  sacudirTela();
  vibrar([26, 34, 70]);

  // o registro espera o estouro aparecer; só depois a tela volta ao repouso
  setTimeout(function () {
    botao.classList.remove('estourou');
    travado = false;
    registrar(resultado, true);
  }, 340);
}

function sortear() {
  if (girando) return;
  var t = turmaAtual();

  if (!t.alunos.length) {
    irPara('turma');
    $('#inputAluno').focus();
    return;
  }

  var pool = disponiveis(t);
  var rodadaNova = false;

  if (!pool.length) {
    var faltaram = ausentes(t.id);
    var possiveis = t.alunos.filter(function (a) { return faltaram.indexOf(a.id) === -1; });
    if (!possiveis.length) {
      repouso('Ninguém disponível', 'Todos estão marcados como falta hoje');
      return;
    }
    dados.rodadas[t.id] = [];
    pool = possiveis;
    rodadaNova = true;
  }

  var escolhido = pool[aleatorio(pool.length)];
  animar(pool, escolhido, rodadaNova);
}

function animar(pool, escolhido, rodadaNova) {
  girando = true;
  var palco = $('#palco');
  var nome = $('#palcoNome');
  var dica = $('#palcoDica');

  $('#btnSortear').disabled = true;
  $('#acoesResultado').classList.add('oculto');
  palco.classList.remove('revelado');
  palco.classList.add('girando');
  dica.textContent = 'sorteando…';

  var nomes = pool.map(function (a) { return a.nome; });
  var inicio = Date.now();
  var duracao = 800;

  (function passo() {
    var p = (Date.now() - inicio) / duracao;
    if (p >= 1) { revelar(escolhido, rodadaNova); return; }
    nome.textContent = nomes[aleatorio(nomes.length)];
    // reinicia a animação a cada troca, para o nome parecer cair de cima
    nome.classList.remove('passa');
    void nome.offsetWidth;
    nome.classList.add('passa');
    setTimeout(passo, 40 + 140 * p * p);   // vai desacelerando
  })();
}

function revelar(aluno, rodadaNova) {
  girando = false;
  sorteado = aluno.id;

  var palco = $('#palco');
  var nome = $('#palcoNome');
  palco.classList.remove('girando');
  FLASHES.forEach(function (c) { palco.classList.remove(c); });
  nome.classList.remove('passa');
  palco.classList.add('revelado');
  nome.textContent = aluno.nome;
  $('#palcoDica').textContent = rodadaNova
    ? 'rodada nova · todo mundo voltou pro sorteio'
    : 'o que aconteceu?';

  $('#acoesSorteio').classList.add('oculto');
  $('#acoesResultado').classList.remove('oculto');
  $('#btnFaltou').classList.remove('oculto');

  vibrar(28);
  if (rodadaNova) salvar();
  renderSortear();
}

/* ---------- chamar quem se ofereceu ---------- */

// coloca o aluno no palco sem sortear. daí em diante é igual ao sorteio:
// ao registrar o resultado ele entra na lista de quem já caiu nesta rodada,
// e só volta a ser sorteável quando a rodada virar.
function chamarVoluntario(alunoId) {
  if (girando) return;
  var t = turmaAtual();
  var aluno = alunoPorId(t, alunoId);
  if (!aluno) return;

  fecharJanela($('#dlgVoluntario'));

  sorteado = aluno.id;
  var palco = $('#palco');
  var nome = $('#palcoNome');
  palco.classList.remove('girando');
  FLASHES.forEach(function (c) { palco.classList.remove(c); });
  nome.classList.remove('passa');
  palco.classList.add('revelado');
  nome.textContent = aluno.nome;
  $('#palcoDica').textContent = 'se ofereceu · o que aconteceu?';

  $('#acoesSorteio').classList.add('oculto');
  $('#acoesResultado').classList.remove('oculto');
  $('#btnFaltou').classList.add('oculto');   // quem se ofereceu está na aula

  vibrar(18);
  renderSortear();
}

// desiste do nome que está no palco. nada é registrado e ninguém gasta a vez:
// o aluno só entra na lista de "já caíram" quando um resultado é registrado.
function cancelarSorteio(chamarOutro) {
  if (girando || travado || !sorteado) return;
  soltarSegurar();
  sorteado = null;

  repouso(chamarOutro ? 'Quem se ofereceu?' : 'Sorteio cancelado',
          chamarOutro ? 'escolha o nome na lista' : 'ninguém foi registrado, ninguém gastou a vez');
  renderSortear();

  if (chamarOutro) abrirVoluntario();
}

function abrirVoluntario() {
  var t = turmaAtual();
  if (!t.alunos.length) {
    irPara('turma');
    $('#inputAluno').focus();
    return;
  }
  $('#buscaVoluntario').value = '';
  renderBusca();
  abrirJanela($('#dlgVoluntario'));
  $('#buscaVoluntario').focus();
}

function renderBusca() {
  var t = turmaAtual();
  var caixa = $('#listaVoluntario');
  caixa.textContent = '';

  var achados = buscarAlunos(t, $('#buscaVoluntario').value);

  if (!achados.length) {
    caixa.appendChild(cria('p', 'vazio', 'Nenhum nome parecido com isso.'));
    return;
  }

  var feitos = rodada(t.id);
  var faltaram = ausentes(t.id);
  var vezes = {};
  dados.registros.forEach(function (r) {
    if (r.turmaId === t.id) vezes[r.alunoId] = (vezes[r.alunoId] || 0) + 1;
  });

  achados.slice(0, 40).forEach(function (a, i) {
    var b = cria('button', 'linha-busca' + (i === 0 ? ' primeiro' : ''));
    b.type = 'button';

    var av = cria('span', 'avatar');
    pintarAvatar(av, a.nome);
    b.appendChild(av);

    var info = cria('div', 'info');
    info.appendChild(cria('span', 'nome', a.nome));

    var n = vezes[a.id] || 0;
    var recado = n === 0 ? 'ainda não participou' : n === 1 ? '1 participação' : n + ' participações';
    var marca = cria('span', 'marca', recado);

    if (faltaram.indexOf(a.id) !== -1) {
      marca.textContent = recado + ' · marcado como falta hoje';
      marca.classList.add('destaque');
    } else if (feitos.indexOf(a.id) !== -1) {
      marca.textContent = recado + ' · já caiu nesta rodada';
      marca.classList.add('destaque');
    }
    info.appendChild(marca);
    b.appendChild(info);

    b.addEventListener('click', function () { chamarVoluntario(a.id); });
    caixa.appendChild(b);
  });
}

function registrar(resultado, dobro) {
  if (!sorteado || girando || travado) return;
  var t = turmaAtual();
  var aluno = alunoPorId(t, sorteado);
  if (!aluno) { repouso('Pronto?', 'Toque no botão para sortear'); return; }

  var reg = {
    id: novoId(),
    turmaId: t.id,
    alunoId: aluno.id,
    resultado: resultado,
    data: new Date().toISOString()
  };
  if (dobro) reg.mult = 2;   // só grava quando é dobro; o normal fica sem campo
  dados.registros.push(reg);

  // quem se ofereceu pode já ter caído nesta rodada; guardo isso para o desfazer
  var jaNaRodada = rodada(t.id).indexOf(aluno.id) !== -1;
  if (!jaNaRodada) rodada(t.id).push(aluno.id);

  ultimaAcao = {
    tipo: 'registro', registroId: reg.id, turmaId: t.id,
    alunoId: aluno.id, nome: aluno.nome, resultado: resultado,
    jaNaRodada: jaNaRodada, dobro: !!dobro
  };
  salvar();

  sorteado = null;
  $('#palco').classList.remove('revelado');
  $('#palcoNome').textContent = aluno.nome;
  $('#palcoDica').textContent = '✓ ' + ROTULOS[resultado] + ' · ' +
    comSinal(dados.pesos[resultado] * (dobro ? 2 : 1)) + (dobro ? ' ⚡ em dobro' : '');
  $('#acoesResultado').classList.add('oculto');
  $('#acoesSorteio').classList.remove('oculto');
  $('#btnSortear').disabled = false;

  comemorar(resultado, sequencia(t), dobro);
  renderSortear();
}

// a parte bonita: pisca a moldura na cor do resultado e joga confete no acerto
function comemorar(resultado, seq, dobro) {
  piscarPalco(resultado);

  if (resultado === 'certo') {
    festa(dobro ? ['#fbbf24', '#fde68a', '#f59e0b', '#34d399', '#ffffff']
                : ['#34d399', '#7c5cff', '#22d3ee', '#fbbf24', '#ffffff'],
          Math.min((dobro ? 70 : 45) + seq * 14, 130));
    vibrar([18, 45, 18]);
  } else if (resultado === 'errou') {
    festa(['#fbbf24', '#f59e0b', '#ffffff'], 24);
    vibrar(30);
  } else {
    vibrar(14);
  }
}

function marcarFalta() {
  if (!sorteado || girando) return;
  var t = turmaAtual();
  var aluno = alunoPorId(t, sorteado);
  if (!aluno) return;

  var lista = ausentes(t.id);
  if (lista.indexOf(aluno.id) === -1) lista.push(aluno.id);

  ultimaAcao = { tipo: 'falta', turmaId: t.id, alunoId: aluno.id, nome: aluno.nome };
  salvar();

  sorteado = null;
  renderSortear();
  setTimeout(sortear, 200);   // já sorteia outro, sem parar a aula
}

function atualizarDesfazer() {
  var caixa = $('#desfazer');
  if (!ultimaAcao) { caixa.classList.add('oculto'); return; }
  caixa.classList.remove('oculto');
  $('#desfazerTexto').textContent = ultimaAcao.tipo === 'falta'
    ? ultimaAcao.nome + ': falta'
    : ultimaAcao.nome + ': ' + (ROTULOS[ultimaAcao.resultado] || 'registrado') +
      (ultimaAcao.dobro ? ' ⚡' : '');
}

function desfazer() {
  if (!ultimaAcao) return;
  var a = ultimaAcao;

  if (a.tipo === 'registro') {
    dados.registros = dados.registros.filter(function (r) { return r.id !== a.registroId; });
    // volta o aluno pro sorteio, a não ser que ele já estivesse na lista de
    // "já caíram" antes deste registro (caso de quem se ofereceu duas vezes)
    if (!a.jaNaRodada) {
      var r = rodada(a.turmaId);
      var pos = r.indexOf(a.alunoId);
      if (pos !== -1) r.splice(pos, 1);
    }
  } else if (a.tipo === 'falta') {
    var lista = ausentes(a.turmaId);
    var i = lista.indexOf(a.alunoId);
    if (i !== -1) lista.splice(i, 1);
  }

  ultimaAcao = null;
  salvar();
  repouso('Desfeito', 'Toque no botão para sortear');
  renderSortear();
}

/* ---------- tela de notas ---------- */

function renderNotas() {
  var t = turmaAtual();
  renderTopo(t);

  var caixa = $('#listaNotas');
  caixa.textContent = '';

  var linhas = estatisticas(t);
  renderPlacar(t, linhas);

  if (!linhas.length) {
    caixa.appendChild(cria('p', 'vazio', 'Nenhum aluno cadastrado nesta turma.'));
    return;
  }

  // as três maiores notas ganham medalha, seja qual for a ordem escolhida
  var premiados = linhas.filter(function (l) { return l.nota !== null; })
    .sort(function (a, b) { return b.nota - a.nota; })
    .slice(0, 3)
    .map(function (l) { return l.aluno.id; });
  var MEDALHAS = ['🥇', '🥈', '🥉'];

  linhas.sort(function (a, b) {
    if (ordemNotas === 'nome') return a.aluno.nome.localeCompare(b.aluno.nome, 'pt-BR');
    if (ordemNotas === 'poucos') return a.vezes - b.vezes || a.aluno.nome.localeCompare(b.aluno.nome, 'pt-BR');
    if (a.nota === null && b.nota === null) return a.aluno.nome.localeCompare(b.aluno.nome, 'pt-BR');
    if (a.nota === null) return 1;
    if (b.nota === null) return -1;
    return ordemNotas === 'maior' ? b.nota - a.nota : a.nota - b.nota;
  });

  linhas.forEach(function (l) {
    var b = cria('button', 'linha-nota');
    b.type = 'button';

    var moldura = cria('div', 'av-wrap');
    var av = cria('span', 'avatar');
    pintarAvatar(av, l.aluno.nome);
    moldura.appendChild(av);

    var lugar = premiados.indexOf(l.aluno.id);
    if (lugar !== -1) moldura.appendChild(cria('span', 'medalha', MEDALHAS[lugar]));
    b.appendChild(moldura);

    var info = cria('div', 'info');
    info.appendChild(cria('span', 'nome', l.aluno.nome));

    var contagem = { certo: 0, errou: 0, naoSabe: 0, recusou: 0 };
    l.registros.forEach(function (r) { if (contagem[r.resultado] !== undefined) contagem[r.resultado]++; });

    var pills = cria('div', 'pills');
    Object.keys(contagem).forEach(function (k) {
      if (!contagem[k]) return;
      var pi = cria('i', k, GLIFOS[k] + ' ' + contagem[k]);
      pi.title = ROTULOS[k];
      pills.appendChild(pi);
    });

    if (l.dobros) {
      var pd = cria('i', 'dobro', '⚡ ' + l.dobros);
      pd.title = l.dobros === 1 ? '1 pergunta desafiadora' : l.dobros + ' perguntas desafiadoras';
      pills.appendChild(pd);
    }
    info.appendChild(pills);
    b.appendChild(info);

    var lado = cria('div', 'nota-caixa');
    lado.appendChild(cria('span', 'nota ' + faixaNota(l.nota), l.nota === null ? '—' : num(l.nota)));
    lado.appendChild(cria('span', 'vezes', l.vezes === 1 ? '1 vez' : l.vezes + ' vezes'));
    b.appendChild(lado);

    var xp = cria('div', 'xp');
    xp.style.width = (l.nota === null ? 0 : l.nota * 10) + '%';
    b.appendChild(xp);

    b.addEventListener('click', function () { abrirAluno(l.aluno.id); });
    caixa.appendChild(b);
  });
}

function faixaNota(nota) {
  if (nota === null) return 'vazia';
  if (nota >= 8) return 'alta';
  if (nota >= 5) return 'media';
  return 'baixa';
}

function renderPlacar(t, linhas) {
  var caixa = $('#placarTurma');
  caixa.textContent = '';

  var comNota = linhas.filter(function (l) { return l.nota !== null; });
  var sorteios = linhas.reduce(function (s, l) { return s + l.vezes; }, 0);
  var media = comNota.length
    ? comNota.reduce(function (s, l) { return s + l.nota; }, 0) / comNota.length
    : null;

  [[String(sorteios), 'sorteios'],
   [media === null ? '—' : num(media), 'média'],
   [String(t.alunos.length), 'alunos']].forEach(function (par) {
    var d = document.createElement('div');
    d.appendChild(cria('b', null, par[0]));
    d.appendChild(cria('span', null, par[1]));
    caixa.appendChild(d);
  });
}

function abrirAluno(alunoId) {
  var t = turmaAtual();
  var aluno = alunoPorId(t, alunoId);
  if (!aluno) return;

  var stat = estatisticas(t).filter(function (s) { return s.aluno.id === alunoId; })[0];

  $('#dlgAlunoNome').textContent = aluno.nome;
  pintarAvatar($('#dlgAlunoAvatar'), aluno.nome);

  var contagem = { certo: 0, errou: 0, naoSabe: 0, recusou: 0 };
  stat.registros.forEach(function (r) { if (contagem[r.resultado] !== undefined) contagem[r.resultado]++; });

  var partes = [];
  Object.keys(contagem).forEach(function (k) {
    if (contagem[k]) partes.push(contagem[k] + ' × ' + ROTULOS[k].toLowerCase());
  });

  $('#dlgAlunoResumo').textContent = stat.vezes
    ? 'Nota ' + num(stat.nota) + ' · ' + stat.vezes + ' sorteios' +
      (stat.dobros ? ' (' + stat.dobros + ' em dobro)' : '') + ' · ' + partes.join(', ')
    : 'Ainda não foi sorteado nenhuma vez.';

  var hist = $('#dlgAlunoHistorico');
  hist.textContent = '';

  stat.registros
    .slice()
    .sort(function (a, b) { return String(b.data).localeCompare(String(a.data)); })
    .forEach(function (r) {
      var linha = cria('div', 'item-hist');
      linha.appendChild(cria('span', 'data', dataCurta(r.data)));

      var m = multiploDe(r);

      var sel = document.createElement('select');
      Object.keys(ROTULOS).forEach(function (k) {
        var op = document.createElement('option');
        op.value = k;
        op.textContent = ROTULOS[k] + ' (' + comSinal(dados.pesos[k] * m) + ')';
        if (k === r.resultado) op.selected = true;
        sel.appendChild(op);
      });
      sel.addEventListener('change', function () {
        r.resultado = sel.value;
        salvar();
        abrirAluno(alunoId);
        renderNotas();
      });
      linha.appendChild(sel);

      // liga e desliga o dobro depois, caso tenha esquecido na hora da aula
      var chaveDobro = cria('button', 'marca-dobro' + (m > 1 ? ' ligado' : ''), '⚡×2');
      chaveDobro.type = 'button';
      chaveDobro.title = m > 1 ? 'Pergunta desafiadora (toque para voltar ao normal)'
                               : 'Marcar como pergunta desafiadora';
      chaveDobro.addEventListener('click', function () {
        if (multiploDe(r) > 1) delete r.mult; else r.mult = 2;
        salvar();
        abrirAluno(alunoId);
        renderNotas();
      });
      linha.appendChild(chaveDobro);

      var tirar = cria('button', 'tirar', '✕');
      tirar.type = 'button';
      tirar.title = 'Apagar este registro';
      tirar.addEventListener('click', function () {
        if (!confirm('Apagar este registro de ' + aluno.nome + '?')) return;
        dados.registros = dados.registros.filter(function (x) { return x.id !== r.id; });
        if (ultimaAcao && ultimaAcao.registroId === r.id) ultimaAcao = null;
        salvar();
        abrirAluno(alunoId);
        renderNotas();
      });
      linha.appendChild(tirar);

      hist.appendChild(linha);
    });

  abrirJanela($('#dlgAluno'));
}

/* ---------- tela de turmas ---------- */

function renderTurma() {
  var t = turmaAtual();
  renderTopo(t);

  var sel = $('#seletorTurma');
  sel.textContent = '';
  dados.turmas.forEach(function (turma) {
    var op = document.createElement('option');
    op.value = turma.id;
    op.textContent = turma.nome + ' (' + turma.alunos.length + ')';
    if (turma.id === dados.turmaAtiva) op.selected = true;
    sel.appendChild(op);
  });

  $('#contaAlunos').textContent = t.alunos.length;

  var lista = $('#listaAlunos');
  lista.textContent = '';

  if (!t.alunos.length) {
    lista.appendChild(cria('li', 'vazio', 'Nenhum aluno ainda. Digite um nome acima ou cole a lista inteira.'));
    return;
  }

  t.alunos
    .slice()
    .sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); })
    .forEach(function (a) {
      var li = document.createElement('li');
      li.appendChild(cria('span', 'nome', a.nome));

      var tirar = cria('button', 'tirar', '✕');
      tirar.type = 'button';
      tirar.title = 'Tirar da turma';
      tirar.addEventListener('click', function () {
        var quantos = dados.registros.filter(function (r) {
          return r.turmaId === t.id && r.alunoId === a.id;
        }).length;
        var texto = quantos
          ? 'Tirar ' + a.nome + ' da turma? Os ' + quantos + ' registros dele também vão ser apagados.'
          : 'Tirar ' + a.nome + ' da turma?';
        if (!confirm(texto)) return;

        t.alunos = t.alunos.filter(function (x) { return x.id !== a.id; });
        dados.registros = dados.registros.filter(function (r) {
          return !(r.turmaId === t.id && r.alunoId === a.id);
        });
        dados.rodadas[t.id] = rodada(t.id).filter(function (id) { return id !== a.id; });
        salvar();
        renderTurma();
      });
      li.appendChild(tirar);
      lista.appendChild(li);
    });
}

function adicionarAlunos(nomes) {
  var t = turmaAtual();
  var existentes = t.alunos.map(function (a) { return normalizar(a.nome); });
  var adicionados = 0;

  nomes.forEach(function (n) {
    var limpo = String(n).replace(/\s+/g, ' ').trim();
    if (!limpo) return;
    if (existentes.indexOf(normalizar(limpo)) !== -1) return;
    existentes.push(normalizar(limpo));
    t.alunos.push({ id: novoId(), nome: limpo });
    adicionados++;
  });

  if (adicionados) salvar();
  renderTurma();
  return adicionados;
}

/* ---------- tela de ajustes ---------- */

function renderAjustes() {
  renderTopo(turmaAtual());
  Object.keys(PESOS_PADRAO).forEach(function (k) {
    $('#peso-' + k).value = num(dados.pesos[k]);
  });
  $('#ligaEfeitos').checked = dados.efeitos;
}

/* ---------- baixar arquivos ---------- */

function baixar(nomeArquivo, conteudo, tipo) {
  var blob = new Blob([conteudo], { type: tipo });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
}

function nomeArquivo(prefixo, ext) {
  return prefixo + '-' + hoje() + '.' + ext;
}

// a marca do começo faz o Excel abrir o arquivo com os acentos certos
function csv(linhas) {
  return String.fromCharCode(65279) + linhas.map(function (l) {
    return l.map(function (c) {
      var s = String(c == null ? '' : c);
      return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(';');
  }).join('\r\n');
}

function exportarBackup() {
  baixar(nomeArquivo('sorteio-backup', 'json'), JSON.stringify(dados, null, 2), 'application/json');
}

function exportarNotas() {
  var t = turmaAtual();
  var linhas = [['Aluno', 'Sorteios', 'Certo', 'Errou', 'Nao sabe', 'Recusou',
                 'Perguntas em dobro', 'Pontos', 'Nota (0 a 10)']];

  estatisticas(t)
    .sort(function (a, b) { return a.aluno.nome.localeCompare(b.aluno.nome, 'pt-BR'); })
    .forEach(function (s) {
      var c = { certo: 0, errou: 0, naoSabe: 0, recusou: 0 };
      s.registros.forEach(function (r) { if (c[r.resultado] !== undefined) c[r.resultado]++; });
      linhas.push([
        s.aluno.nome, s.vezes, c.certo, c.errou, c.naoSabe, c.recusou, s.dobros,
        num(s.soma), s.nota === null ? '' : num(s.nota)
      ]);
    });

  baixar(nomeArquivo('notas-' + normalizar(t.nome).replace(/[^a-z0-9]+/g, '-'), 'csv'),
         csv(linhas), 'text/csv;charset=utf-8');
}

function exportarRegistros() {
  var t = turmaAtual();
  var linhas = [['Data', 'Hora', 'Aluno', 'Resultado', 'Pergunta', 'Pontos']];

  dados.registros
    .filter(function (r) { return r.turmaId === t.id; })
    .sort(function (a, b) { return String(a.data).localeCompare(String(b.data)); })
    .forEach(function (r) {
      var aluno = alunoPorId(t, r.alunoId);
      var d = new Date(r.data);
      var m = multiploDe(r);
      linhas.push([
        isNaN(d) ? '' : d.toLocaleDateString('pt-BR'),
        isNaN(d) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        aluno ? aluno.nome : '(aluno removido)',
        ROTULOS[r.resultado] || r.resultado,
        m > 1 ? 'Desafiadora (dobro)' : 'Normal',
        num((dados.pesos[r.resultado] || 0) * m)
      ]);
    });

  baixar(nomeArquivo('registros-' + normalizar(t.nome).replace(/[^a-z0-9]+/g, '-'), 'csv'),
         csv(linhas), 'text/csv;charset=utf-8');
}

function importarBackup(arquivo) {
  var leitor = new FileReader();
  leitor.onload = function () {
    var novo;
    try { novo = JSON.parse(leitor.result); } catch (e) { novo = null; }

    if (!novo || !Array.isArray(novo.turmas) || !Array.isArray(novo.registros)) {
      alert('Esse arquivo não parece ser um backup deste app.');
      return;
    }
    var qtdAlunos = novo.turmas.reduce(function (s, t) { return s + (t.alunos ? t.alunos.length : 0); }, 0);
    if (!confirm('Restaurar este backup?\n\n' + novo.turmas.length + ' turma(s), ' +
                 qtdAlunos + ' aluno(s), ' + novo.registros.length + ' registro(s).\n\n' +
                 'Tudo que está guardado agora neste aparelho será substituído.')) return;

    dados = novo;
    carregarConserto();
    salvar();
    irPara('sortear');
    repouso('Backup restaurado', 'Toque no botão para sortear');
    renderSortear();
  };
  leitor.readAsText(arquivo);
}

// reaproveita as travas de segurança do carregar(), sem reler o armazenamento
function carregarConserto() {
  var vazio = estruturaVazia();
  ['pesos', 'turmas', 'registros', 'rodadas', 'ausencias'].forEach(function (k) {
    if (!dados[k]) dados[k] = vazio[k];
  });
  Object.keys(PESOS_PADRAO).forEach(function (k) {
    if (typeof dados.pesos[k] !== 'number' || isNaN(dados.pesos[k])) dados.pesos[k] = PESOS_PADRAO[k];
  });
  if (typeof dados.efeitos !== 'boolean') dados.efeitos = true;
  if (!dados.turmas.length) dados.turmas.push({ id: novoId(), nome: 'Turma 1', alunos: [] });
  if (!turmaAtual()) dados.turmaAtiva = dados.turmas[0].id;
  ultimaAcao = null;
  sorteado = null;
  soltarSegurar();
}

/* ---------- janelas ---------- */

function abrirJanela(dlg) {
  if (dlg.showModal) dlg.showModal();
  else dlg.setAttribute('open', '');
}

function fecharJanela(dlg) {
  if (dlg.close) dlg.close();
  else dlg.removeAttribute('open');
}

/* ---------- ligações ---------- */

function ligarEventos() {

  $$('.rodape button').forEach(function (b) {
    b.addEventListener('click', function () { irPara(b.dataset.ir); });
  });

  $('#btnSortear').addEventListener('click', sortear);

  $$('.res[data-res]').forEach(function (b) {
    // toque rápido registra o normal; segurar 1 segundo registra valendo o dobro
    b.addEventListener('click', function () { registrar(b.dataset.res, false); });

    if (window.PointerEvent) {
      b.addEventListener('pointerdown', function (e) { comecarSegurar(b, b.dataset.res, e); });
      b.addEventListener('pointerup', soltarSegurar);
      b.addEventListener('pointerleave', soltarSegurar);
      b.addEventListener('pointercancel', soltarSegurar);
    } else {
      b.addEventListener('touchstart', function (e) { comecarSegurar(b, b.dataset.res, e); });
      b.addEventListener('touchend', soltarSegurar);
      b.addEventListener('touchcancel', soltarSegurar);
      b.addEventListener('mousedown', function (e) { comecarSegurar(b, b.dataset.res, e); });
      b.addEventListener('mouseup', soltarSegurar);
      b.addEventListener('mouseleave', soltarSegurar);
    }

    // sem menu de "copiar" ao segurar o botão
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  });

  // se a aula for interrompida (troca de app, tela apagando), solta o gesto
  window.addEventListener('blur', soltarSegurar);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) soltarSegurar();
  });

  $('#btnFaltou').addEventListener('click', marcarFalta);
  $('#btnDesfazer').addEventListener('click', desfazer);

  $('#btnCancelarSorteio').addEventListener('click', function () { cancelarSorteio(false); });
  $('#btnTrocarVoluntario').addEventListener('click', function () { cancelarSorteio(true); });

  $('#btnVoluntario').addEventListener('click', abrirVoluntario);
  $('#btnVoluntarioCancelar').addEventListener('click', function () { fecharJanela($('#dlgVoluntario')); });
  $('#buscaVoluntario').addEventListener('input', renderBusca);

  // Enter escolhe o primeiro da lista, sem precisar tirar a mão do teclado
  $('#buscaVoluntario').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    var primeiro = $('#listaVoluntario .linha-busca');
    if (primeiro) primeiro.click();
  });

  $('#btnLimparAusentes').addEventListener('click', function () {
    var t = turmaAtual();
    dados.ausencias[t.id] = { data: hoje(), ids: [] };
    salvar();
    renderSortear();
  });

  $('#ordenarNotas').addEventListener('change', function (e) {
    ordemNotas = e.target.value;
    renderNotas();
  });

  $('#btnFecharAluno').addEventListener('click', function () { fecharJanela($('#dlgAluno')); });

  /* turmas */

  $('#seletorTurma').addEventListener('change', function (e) {
    dados.turmaAtiva = e.target.value;
    ultimaAcao = null;
    soltarSegurar();
    salvar();
    repouso('Pronto?', 'Toque no botão para sortear');
    renderTurma();
  });

  $('#btnNovaTurma').addEventListener('click', function () {
    var nome = prompt('Nome da nova turma:', 'Turma ' + (dados.turmas.length + 1));
    if (nome === null) return;
    nome = nome.trim();
    if (!nome) return;
    var nova = { id: novoId(), nome: nome, alunos: [] };
    dados.turmas.push(nova);
    dados.turmaAtiva = nova.id;
    salvar();
    renderTurma();
  });

  $('#btnRenomearTurma').addEventListener('click', function () {
    var t = turmaAtual();
    var nome = prompt('Novo nome da turma:', t.nome);
    if (nome === null) return;
    nome = nome.trim();
    if (!nome) return;
    t.nome = nome;
    salvar();
    renderTurma();
  });

  $('#btnApagarTurma').addEventListener('click', function () {
    var t = turmaAtual();
    var quantos = dados.registros.filter(function (r) { return r.turmaId === t.id; }).length;
    if (!confirm('Apagar a turma "' + t.nome + '"?\n\n' + t.alunos.length + ' aluno(s) e ' +
                 quantos + ' registro(s) somem junto. Não tem como desfazer.')) return;

    dados.turmas = dados.turmas.filter(function (x) { return x.id !== t.id; });
    dados.registros = dados.registros.filter(function (r) { return r.turmaId !== t.id; });
    delete dados.rodadas[t.id];
    delete dados.ausencias[t.id];
    if (!dados.turmas.length) dados.turmas.push({ id: novoId(), nome: 'Turma 1', alunos: [] });
    dados.turmaAtiva = dados.turmas[0].id;
    ultimaAcao = null;
    salvar();
    repouso('Pronto?', 'Toque no botão para sortear');
    renderTurma();
  });

  $('#formAluno').addEventListener('submit', function (e) {
    e.preventDefault();
    var campo = $('#inputAluno');
    if (!campo.value.trim()) return;
    adicionarAlunos([campo.value]);
    campo.value = '';
    campo.focus();
  });

  $('#btnColarLista').addEventListener('click', function () {
    $('#textoColado').value = '';
    abrirJanela($('#dlgColar'));
    $('#textoColado').focus();
  });

  $('#btnColarCancelar').addEventListener('click', function () { fecharJanela($('#dlgColar')); });

  $('#btnColarConfirmar').addEventListener('click', function () {
    var linhas = $('#textoColado').value.split(/\r?\n/);
    var n = adicionarAlunos(linhas);
    fecharJanela($('#dlgColar'));
    alert(n === 0 ? 'Nenhum nome novo foi adicionado.'
                  : n === 1 ? '1 aluno adicionado.' : n + ' alunos adicionados.');
  });

  $('#btnReiniciarRodada').addEventListener('click', function () {
    var t = turmaAtual();
    if (!confirm('Reiniciar a rodada de "' + t.nome + '"?\nTodo mundo volta pro sorteio. Nenhuma nota é apagada.')) return;
    dados.rodadas[t.id] = [];
    salvar();
    irPara('sortear');
    repouso('Rodada reiniciada', 'Toque no botão para sortear');
    renderSortear();
  });

  /* ajustes */

  Object.keys(PESOS_PADRAO).forEach(function (k) {
    $('#peso-' + k).addEventListener('change', function (e) {
      // aceita tanto 0,7 quanto 0.7, porque no celular o teclado dá vírgula
      var v = parseFloat(String(e.target.value).trim().replace(',', '.'));
      if (isNaN(v) || v < 0) v = dados.pesos[k];
      if (v > 10) v = 10;
      dados.pesos[k] = Math.round(v * 10) / 10;   // décimos, igual ao que aparece na tela
      e.target.value = num(dados.pesos[k]);
      salvar();
    });
  });

  $('#ligaEfeitos').addEventListener('change', function (e) {
    dados.efeitos = !!e.target.checked;
    salvar();
    if (dados.efeitos) festa(['#7c5cff', '#22d3ee', '#34d399', '#ffffff'], 30);
  });

  $('#btnExportarJson').addEventListener('click', exportarBackup);
  $('#btnExportarNotas').addEventListener('click', exportarNotas);
  $('#btnExportarRegistros').addEventListener('click', exportarRegistros);

  $('#btnImportar').addEventListener('click', function () { $('#arquivoImportar').click(); });
  $('#arquivoImportar').addEventListener('change', function (e) {
    if (e.target.files && e.target.files[0]) importarBackup(e.target.files[0]);
    e.target.value = '';
  });

  $('#btnApagarTudo').addEventListener('click', function () {
    if (!confirm('Apagar TODOS os dados deste aparelho?\n\nTurmas, alunos e histórico. Não tem como desfazer.')) return;
    if (!confirm('Tem certeza mesmo? Se ainda não baixou um backup, cancele e baixe primeiro.')) return;
    try { localStorage.removeItem(CHAVE); } catch (e) {}
    dados = estruturaVazia();
    dados.turmas.push({ id: novoId(), nome: 'Turma 1', alunos: [] });
    dados.turmaAtiva = dados.turmas[0].id;
    ultimaAcao = null;
    salvar();
    repouso('Pronto?', 'Toque no botão para sortear');
    irPara('turma');
  });
}

/* ---------- funcionar sem internet ---------- */

function prepararOffline() {
  var estado = $('#estadoOffline');
  if (!('serviceWorker' in navigator)) {
    estado.textContent = 'este navegador não guarda o app para usar sem internet';
    return;
  }
  if (location.protocol === 'file:') {
    estado.textContent = 'aberto direto do arquivo (sem modo offline)';
    return;
  }
  navigator.serviceWorker.register('./sw.js')
    .then(function () { estado.textContent = 'pronto para funcionar sem internet'; })
    .catch(function () { estado.textContent = 'não consegui preparar o modo offline'; });
}

/* ---------- início ---------- */

carregar();
salvar();   // grava já no primeiro uso, para a turma inicial não se perder

if (!armazenamentoOk) {
  mostrarAviso('Este navegador está bloqueando o salvamento (janela anônima?). Nada do que você registrar vai ficar guardado.');
}

ligarEventos();
irPara('sortear');
prepararOffline();

})();
