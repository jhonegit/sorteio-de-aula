/* Sorteio de alunos — tudo fica guardado neste aparelho, nada vai pra internet. */

(function () {
'use strict';

var CHAVE = 'sorteio-alunos-v1';
var VERSAO = 'v15';   // aparece em Ajustes; tem que bater com o CACHE do sw.js

var PESOS_PADRAO = { certo: 1, errou: 0.7, naoSabe: 0.4, recusou: 0 };

var ROTULOS = {
  certo:   'Respondeu certo',
  errou:   'Respondeu, mas errou',
  naoSabe: 'Disse que não sabe',
  recusou: 'Se recusou a responder'
};

// numa atividade os mesmos resultados ganham outro nome, que faz mais sentido
// para dever de casa: o registro é do mesmo tipo, só a palavra muda
var ROTULOS_ATIV = {
  certo:   'Fez a atividade',
  errou:   'Fez em parte',
  recusou: 'Não fez'
};

// os mesmos símbolos dos botões, reaproveitados na lista de notas
var GLIFOS = { certo: '✓', errou: '≈', naoSabe: '?', recusou: '✕' };

function rotulo(resultado, ehAtividade) {
  if (ehAtividade && ROTULOS_ATIV[resultado]) return ROTULOS_ATIV[resultado];
  return ROTULOS[resultado] || resultado;
}

var dados = null;
var sorteado = null;     // id do aluno que está na tela
var ultimaAcao = null;   // guarda o que dá pra desfazer
var girando = false;
var ordemNotas = 'nome';
var periodoVisto = 'atual';   // qual período a tela de Notas mostra: 'atual', 'todos' ou um id
var armazenamentoOk = true;
var segurando = null;    // botão de resultado que está sendo segurado agora
var travado = false;     // segura o app durante o estouro do dobro

var MULT_MAX = 3;        // peso máximo que uma oportunidade pode valer
var ofereceu = false;    // o nome que está no palco se ofereceu, não foi sorteado

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
  // "2026-08-26" sozinho é um dia daqui, não um horário: formata sem fuso
  var so = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  if (so) return so[3] + '/' + so[2];

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
    zoom: 1,               // tamanho da letra no projetor
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
  if (typeof dados.zoom !== 'number' || isNaN(dados.zoom)) dados.zoom = 1;

  if (!dados.turmas.length) {
    dados.turmas.push({ id: novoId(), nome: 'Turma 1', alunos: [] });
  }
  if (!turmaAtual()) dados.turmaAtiva = dados.turmas[0].id;
  dados.turmas.forEach(function (t) { garantirPeriodos(t); });
}

function salvar() {
  if (!armazenamentoOk) return;
  try {
    localStorage.setItem(CHAVE, JSON.stringify(dados));
    agendarEnvioHub();
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

/* ---------- períodos ---------- */

/* Cada turma tem uma fila de períodos (bimestre, disciplina, prova). O último
   da fila é o que está valendo. Todo registro nasce carimbado com o id do
   período, então "zerar as notas" é só abrir um período novo: nada é apagado,
   o que já foi registrado continua guardado no período que terminou. */

function garantirPeriodos(turma) {
  if (Array.isArray(turma.periodos) && turma.periodos.length) return;
  var p = { id: novoId(), nome: 'Período 1', inicio: hoje(), fim: null };
  turma.periodos = [p];
  // o que já existia neste aparelho passa a pertencer ao primeiro período
  dados.registros.forEach(function (r) {
    if (r.turmaId === turma.id && !r.per) r.per = p.id;
  });
  salvar();   // grava na hora: o id do período não pode mudar depois
}

function periodosDe(turma) {
  garantirPeriodos(turma);
  return turma.periodos;
}

function periodoAtual(turma) {
  var ps = periodosDe(turma);
  return ps[ps.length - 1];
}

function periodoPorId(turma, id) {
  var achados = periodosDe(turma).filter(function (p) { return p.id === id; });
  return achados[0] || null;
}

// qual período a tela de Notas está mostrando. null = todos juntos
function periodoVendo(turma) {
  if (periodoVisto === 'todos') return null;
  if (periodoVisto === 'atual') return periodoAtual(turma);
  return periodoPorId(turma, periodoVisto) || periodoAtual(turma);
}

// os registros que a tela de Notas deve considerar (respeita o período escolhido)
function registrosDa(turma) {
  var p = periodoVendo(turma);
  return dados.registros.filter(function (r) {
    return r.turmaId === turma.id && (!p || r.per === p.id);
  });
}

// os registros do período que está valendo agora, seja qual for a tela aberta
function registrosAgora(turma) {
  var p = periodoAtual(turma);
  return dados.registros.filter(function (r) {
    return r.turmaId === turma.id && r.per === p.id;
  });
}

// quantas vezes cada aluno participou no período que está valendo
function contarParticipacoes(turma) {
  var vezes = {};
  registrosAgora(turma).forEach(function (r) {
    vezes[r.alunoId] = (vezes[r.alunoId] || 0) + 1;
  });
  return vezes;
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

// quanto aquela oportunidade pesa: pergunta desafiadora conta 2, atividade pode
// contar até 3. registro antigo, sem o campo, conta 1
function multiploDe(registro) {
  var m = Math.round(Number(registro.mult));
  return m >= 2 && m <= MULT_MAX ? m : 1;
}

function estatisticas(turma) {
  var regs = registrosDa(turma);
  return turma.alunos.map(function (a) {
    var meus = regs.filter(function (r) { return r.alunoId === a.id; });
    var soma = 0, divisor = 0, dobros = 0, ofertas = 0;

    meus.forEach(function (r) {
      var m = multiploDe(r);
      var p = dados.pesos[r.resultado];
      soma += (typeof p === 'number' ? p : 0) * m;
      divisor += m;                       // a pergunta em dobro pesa por duas
      if (m > 1) dobros++;
      if (r.ofereceu) ofertas++;           // quantas vezes ele levantou a mão
    });

    return {
      aluno: a,
      vezes: meus.length,
      dobros: dobros,
      ofertas: ofertas,
      soma: soma,
      nota: divisor ? (soma / divisor) * 10 : null,
      registros: meus
    };
  });
}

/* A ordem do ranking, usada na lista de notas e no projetor. A nota manda:
   quem tem 10 nunca aparece abaixo de quem tem 9. Entre os que empatam, sobe
   quem participou mais; empatando de novo, quem mais se ofereceu. Isso não
   muda nota nenhuma, só decide quem aparece primeiro. Quem ainda não tem nota
   fica no fim das duas ordens. */
function ordenarPorRanking(lista, doPiorPraMelhor) {
  return lista.sort(function (a, b) {
    if (a.nota === null && b.nota === null) return a.aluno.nome.localeCompare(b.aluno.nome, 'pt-BR');
    if (a.nota === null) return 1;
    if (b.nota === null) return -1;

    var r = (b.nota - a.nota) || (b.vezes - a.vezes) || (b.ofertas - a.ofertas);
    if (doPiorPraMelhor) r = -r;
    return r || a.aluno.nome.localeCompare(b.aluno.nome, 'pt-BR');
  });
}

// quantos "respondeu certo" seguidos a turma emendou até agora
function sequencia(turma) {
  var regs = registrosAgora(turma);
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
  ofereceu = false;               // este nome saiu no sorteio, não foi voluntário
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
  ofereceu = true;                 // fica registrado que a mão foi dele
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
  ofereceu = false;

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
  var vezes = contarParticipacoes(t);

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
    per: periodoAtual(t).id,
    alunoId: aluno.id,
    resultado: resultado,
    data: new Date().toISOString()
  };
  if (dobro) reg.mult = 2;   // só grava quando é dobro; o normal fica sem campo
  if (ofereceu) reg.ofereceu = true;
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
  ofereceu = false;
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
  var texto;
  if (ultimaAcao.tipo === 'falta') {
    texto = ultimaAcao.nome + ': falta';
  } else if (ultimaAcao.tipo === 'grupo') {
    texto = 'Grupo de ' + ultimaAcao.total + ' (resposta ' + ultimaAcao.gabarito + '): ' +
            ultimaAcao.acertos + (ultimaAcao.acertos === 1 ? ' acertou' : ' acertaram');
  } else if (ultimaAcao.tipo === 'varios') {
    texto = (ultimaAcao.ofereceu ? '🔥 ' : '👥 ') + ultimaAcao.total +
            (ultimaAcao.total === 1 ? ' aluno lançado' : ' alunos lançados') +
            (ultimaAcao.acertos ? ' · ' + ultimaAcao.acertos +
              (ultimaAcao.acertos === 1 ? ' acertou' : ' acertaram') : '');
  } else {
    texto = ultimaAcao.nome + ': ' + (ROTULOS[ultimaAcao.resultado] || 'registrado') +
            (ultimaAcao.dobro ? ' ⚡' : '');
  }
  $('#desfazerTexto').textContent = texto;
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
  } else if (a.tipo === 'grupo' || a.tipo === 'varios') {
    dados.registros = dados.registros.filter(function (r) { return r.lote !== a.lote; });
    var naRodada = rodada(a.turmaId);
    (a.novos || []).forEach(function (id) {
      var pos = naRodada.indexOf(id);
      if (pos !== -1) naRodada.splice(pos, 1);
    });
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

/* A lista de períodos no alto da tela de Notas. Enquanto houver só um período,
   ela some: não faz sentido escolher entre uma coisa só. */
function renderSeletorPeriodo(t) {
  var ps = periodosDe(t);
  var caixa = $('.faixa-periodo');
  var sel = $('#periodoNotas');
  var aviso = $('#periodoAviso');

  if (ps.length < 2) {
    caixa.classList.add('oculto');
    return;
  }
  caixa.classList.remove('oculto');

  sel.textContent = '';
  var opcoes = [['atual', periodoAtual(t).nome + ' (o de agora)']];
  ps.slice(0, -1).reverse().forEach(function (p) {
    opcoes.push([p.id, p.nome + ' (encerrado)']);
  });
  opcoes.push(['todos', 'Todos os períodos juntos']);

  opcoes.forEach(function (par) {
    var op = document.createElement('option');
    op.value = par[0];
    op.textContent = par[1];
    if (par[0] === periodoVisto) op.selected = true;
    sel.appendChild(op);
  });

  var p = periodoVendo(t);
  if (periodoVisto === 'atual') {
    aviso.textContent = '';
    aviso.classList.remove('destaque');
  } else {
    aviso.classList.add('destaque');
    aviso.textContent = p
      ? 'histórico · ' + dataCurta(p.inicio) + ' a ' + (p.fim ? dataCurta(p.fim) : 'hoje')
      : 'somando tudo desde o começo';
  }
}

function renderNotas() {
  var t = turmaAtual();
  renderTopo(t);
  renderSeletorPeriodo(t);

  var caixa = $('#listaNotas');
  caixa.textContent = '';

  var linhas = estatisticas(t);
  renderPlacar(t, linhas);

  if (!linhas.length) {
    caixa.appendChild(cria('p', 'vazio', 'Nenhum aluno cadastrado nesta turma.'));
    return;
  }

  // o pódio é o do ranking, seja qual for a ordem escolhida na tela
  var premiados = ordenarPorRanking(linhas.filter(function (l) { return l.nota !== null; }))
    .slice(0, 3)
    .map(function (l) { return l.aluno.id; });
  var MEDALHAS = ['🥇', '🥈', '🥉'];

  if (ordemNotas === 'nome') {
    linhas.sort(function (a, b) { return a.aluno.nome.localeCompare(b.aluno.nome, 'pt-BR'); });
  } else if (ordemNotas === 'poucos') {
    linhas.sort(function (a, b) {
      return a.vezes - b.vezes || a.aluno.nome.localeCompare(b.aluno.nome, 'pt-BR');
    });
  } else {
    ordenarPorRanking(linhas, ordemNotas === 'menor');
  }

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

    if (l.ofertas) {
      var po = cria('i', 'oferta', '🔥 ' + l.ofertas);
      po.title = l.ofertas === 1 ? 'Se ofereceu 1 vez' : 'Se ofereceu ' + l.ofertas + ' vezes';
      pills.appendChild(po);
    }

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
  var oportunidades = linhas.reduce(function (s, l) { return s + l.vezes; }, 0);
  var media = comNota.length
    ? comNota.reduce(function (s, l) { return s + l.nota; }, 0) / comNota.length
    : null;

  [[String(oportunidades), 'participações'],
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

  var deAtividade = stat.registros.filter(function (r) { return r.atividade; }).length;

  var extras = [];
  if (deAtividade) extras.push(deAtividade + ' de atividade');
  if (stat.ofertas) extras.push('🔥 ' + stat.ofertas + ' por vontade própria');

  $('#dlgAlunoResumo').textContent = stat.vezes
    ? 'Nota ' + num(stat.nota) + ' · ' + stat.vezes + ' oportunidades' +
      (extras.length ? ' (' + extras.join(', ') + ')' : '') + ' · ' + partes.join(', ')
    : 'Ainda não teve nenhuma oportunidade.';

  var hist = $('#dlgAlunoHistorico');
  hist.textContent = '';

  stat.registros
    .slice()
    .sort(function (a, b) { return String(b.data).localeCompare(String(a.data)); })
    .forEach(function (r) {
      var linha = cria('div', 'item-hist');

      // de onde veio esta oportunidade: atividade ou mão levantada
      if (r.atividade) {
        var tag = cria('span', 'tag-ativ', '📋 ' + r.atividade);
        tag.title = 'Atividade: ' + r.atividade;
        linha.appendChild(tag);
      } else if (r.gabarito) {
        var tagG = cria('span', 'tag-ativ grupo',
          '🎯 marcou ' + (r.alt || '—') + ' · certa ' + r.gabarito);
        tagG.title = 'Pergunta para o grupo';
        linha.appendChild(tagG);
      } else if (r.ofereceu) {
        var tagO = cria('span', 'tag-ativ oferta', '🔥 se ofereceu');
        linha.appendChild(tagO);
      }

      linha.appendChild(cria('span', 'data', dataCurta(r.data)));

      var m = multiploDe(r);

      var sel = document.createElement('select');
      Object.keys(ROTULOS).forEach(function (k) {
        var op = document.createElement('option');
        op.value = k;
        op.textContent = rotulo(k, r.atividade) + ' (' + comSinal(dados.pesos[k] * m) + ')';
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

      // muda o peso depois, caso tenha esquecido na hora da aula: ×1, ×2, ×3 e volta
      var chaveDobro = cria('button', 'marca-dobro' + (m > 1 ? ' ligado' : ''), '⚡×' + m);
      chaveDobro.type = 'button';
      chaveDobro.title = 'Peso desta oportunidade (toque para mudar)';
      chaveDobro.addEventListener('click', function () {
        var novo = multiploDe(r) + 1;
        if (novo > MULT_MAX) delete r.mult; else r.mult = novo;
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

/* ---------- projetor ---------- */

/* A mesma lista de notas, em tela cheia e letra grande, para mostrar à turma.
   Só lê o que já existe: não grava, não muda nota, não gasta vez de ninguém. */

var projAberto = false;
var projOrdem = 'ranking';
var projCorte = 6;          // só aparece quem está acima disso
var projLuz = null;         // pedido para a tela do aparelho não apagar

var LEGENDA = [
  ['certo', '✓', 'respondeu certo'],
  ['errou', '≈', 'respondeu, mas errou'],
  ['naosabe', '?', 'disse que não sabe'],
  ['recusou', '✕', 'se recusou'],
  ['oferta', '🔥', 'se ofereceu para responder'],
  ['dobro', '⚡', 'valeu peso extra'],
  ['ativ', '📋', 'veio de atividade']
];

function abrirProjetor() {
  projAberto = true;
  $('#projetor').classList.remove('oculto');
  document.body.classList.add('projetando');
  renderProjetor();

  // tela cheia de verdade, quando o navegador deixa
  var raiz = document.documentElement;
  try {
    if (raiz.requestFullscreen) raiz.requestFullscreen();
    else if (raiz.webkitRequestFullscreen) raiz.webkitRequestFullscreen();
  } catch (e) {}

  // e a tela do aparelho não apaga no meio da explicação
  if (navigator.wakeLock && navigator.wakeLock.request) {
    try {
      navigator.wakeLock.request('screen').then(function (l) { projLuz = l; }, function () {});
    } catch (e) {}
  }
}

function fecharProjetor() {
  projAberto = false;
  $('#projetor').classList.add('oculto');
  document.body.classList.remove('projetando');

  try {
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
  } catch (e) {}

  if (projLuz) { try { projLuz.release(); } catch (e) {} projLuz = null; }
}

function mudarZoom(passo) {
  var z = Math.round((dados.zoom + passo) * 10) / 10;
  dados.zoom = Math.min(2.2, Math.max(0.7, z));
  salvar();
  $('#projetor').style.setProperty('--zoom', dados.zoom);
}

function renderProjetor() {
  var t = turmaAtual();
  var todas = estatisticas(t);

  $('#projTitulo').textContent = t.nome;
  $('#projetor').style.setProperty('--zoom', dados.zoom);
  $('#projetor').classList.toggle('sem-efeitos', !dados.efeitos);

  $$('#projOrdens .proj-chip').forEach(function (b) {
    b.classList.toggle('ativo', b.dataset.ordem === projOrdem);
  });
  $$('#projCortes .proj-chip').forEach(function (b) {
    b.classList.toggle('ativo', Number(b.dataset.corte) === projCorte);
  });

  // o placar é sempre da turma inteira, não só de quem está na tela
  var comNota = todas.filter(function (l) { return l.nota !== null; });
  var media = comNota.length
    ? comNota.reduce(function (s, l) { return s + l.nota; }, 0) / comNota.length
    : null;
  var participacoes = todas.reduce(function (s, l) { return s + l.vezes; }, 0);

  var placar = $('#projPlacar');
  placar.textContent = '';
  [[media === null ? '—' : num(media), 'média da turma'],
   [String(participacoes), 'participações']].forEach(function (par) {
    var d = cria('div', 'proj-num');
    d.appendChild(cria('b', null, par[0]));
    d.appendChild(cria('span', null, par[1]));
    placar.appendChild(d);
  });

  // as medalhas são do pódio do ranking, mesmo na ordem alfabética
  var premiados = ordenarPorRanking(comNota.slice())
    .slice(0, 3)
    .map(function (l) { return l.aluno.id; });
  var MEDALHAS = ['🥇', '🥈', '🥉'];

  var lista = todas.filter(function (l) {
    if (!projCorte) return true;                 // "todos" mostra até quem não tem nota
    return l.nota !== null && l.nota >= projCorte;
  });

  if (projOrdem === 'alfa') {
    lista.sort(function (a, b) { return a.aluno.nome.localeCompare(b.aluno.nome, 'pt-BR'); });
  } else {
    ordenarPorRanking(lista);
  }

  var caixa = $('#projLista');
  caixa.textContent = '';

  if (!lista.length) {
    caixa.appendChild(cria('p', 'proj-vazio', projCorte
      ? 'Ninguém chegou a ' + num(projCorte) + ' ainda. Toque em "todos" para ver a lista inteira.'
      : 'Nenhum aluno cadastrado nesta turma.'));
  }

  // com muita gente e tela larga, a lista vira duas colunas de verdade:
  // a primeira metade à esquerda, a segunda à direita, cada nome embaixo do outro
  var duas = lista.length > 12 && window.innerWidth >= 900;
  var esquerda = cria('div', 'proj-coluna');
  var direita = duas ? cria('div', 'proj-coluna') : null;
  var corte = duas ? Math.ceil(lista.length / 2) : lista.length;
  caixa.appendChild(esquerda);
  if (direita) caixa.appendChild(direita);

  lista.forEach(function (l, i) {
    var linha = cria('div', 'proj-linha');
    if (dados.efeitos) linha.style.setProperty('--i', i);

    // a colocação aparece sempre; as três maiores ganham a medalha ao lado dela.
    // atenção: nada de classe "medalha" aqui, que é de outra tela e sai do lugar
    var lugar = premiados.indexOf(l.aluno.id);
    var pos = cria('span', 'proj-pos' + (lugar !== -1 ? ' m' + (lugar + 1) : ''));
    if (projOrdem === 'ranking') pos.appendChild(cria('b', null, (i + 1) + 'º'));
    if (lugar !== -1) pos.appendChild(cria('span', 'med', MEDALHAS[lugar]));
    else if (projOrdem !== 'ranking') pos.appendChild(cria('b', null, '·'));
    linha.appendChild(pos);

    // o nome fica sozinho na primeira fileira, para caber inteiro;
    // os símbolos vão embaixo dele, onde há espaço de sobra
    var corpo = cria('div', 'proj-corpo');
    corpo.appendChild(cria('span', 'proj-nome', l.aluno.nome));

    var contagem = { certo: 0, errou: 0, naoSabe: 0, recusou: 0 };
    var deAtividade = 0;
    l.registros.forEach(function (r) {
      if (contagem[r.resultado] !== undefined) contagem[r.resultado]++;
      if (r.atividade) deAtividade++;
    });

    var marcas = cria('span', 'proj-marcas');
    Object.keys(contagem).forEach(function (k) {
      if (!contagem[k]) return;
      marcas.appendChild(cria('i', k === 'naoSabe' ? 'naosabe' : k, GLIFOS[k] + ' ' + contagem[k]));
    });
    if (l.ofertas) marcas.appendChild(cria('i', 'oferta', '🔥 ' + l.ofertas));
    if (l.dobros) marcas.appendChild(cria('i', 'dobro', '⚡ ' + l.dobros));
    if (deAtividade) marcas.appendChild(cria('i', 'ativ', '📋 ' + deAtividade));
    corpo.appendChild(marcas);
    linha.appendChild(corpo);

    linha.appendChild(cria('span', 'proj-nota ' + faixaNota(l.nota),
      l.nota === null ? '—' : num(l.nota)));

    (i < corte ? esquerda : direita).appendChild(linha);
  });

  var leg = $('#projLegenda');
  leg.textContent = '';
  LEGENDA.forEach(function (item) {
    var d = cria('span', 'leg-item');
    d.appendChild(cria('i', item[0], item[1]));
    d.appendChild(cria('span', null, item[2]));
    leg.appendChild(d);
  });
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
  renderDesfazerAtividade();
  renderBlocoPeriodo(t);

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

/* ---------- atividades ---------- */

/* Uma atividade é a mesma coisa que um sorteio, só que para a turma inteira de
   uma vez: cada aluno ganha um registro comum, com o nome da atividade junto.
   Por isso a nota é uma só, e nada do que já estava guardado precisa mudar.
   O que a atividade NÃO faz: mexer na rodada do sorteio. Ninguém gasta a vez. */

// quem você não marcar entra como "não fez", que era o pedido
var ESTADOS_ATIV = [
  { chave: 'fez',    glifo: '✓', classe: 'certo',   resultado: 'certo',   titulo: 'Fez' },
  { chave: 'parte',  glifo: '≈', classe: 'errou',   resultado: 'errou',   titulo: 'Fez em parte' },
  { chave: 'nao',    glifo: '✕', classe: 'recusou', resultado: 'recusou', titulo: 'Não fez' },
  { chave: 'faltou', glifo: '↻', classe: 'faltou',  resultado: null,      titulo: 'Faltou (não conta nada)' }
];

var marcasAtiv = {};      // alunoId -> estado marcado à mão
var multAtiv = 1;         // peso escolhido para esta atividade
var ultimoLote = null;    // o lançamento que ainda dá para desfazer

function estadoAtiv(alunoId) {
  return marcasAtiv[alunoId] || 'nao';
}

function contarAtiv(turma) {
  var c = { fez: 0, parte: 0, nao: 0, faltou: 0 };
  turma.alunos.forEach(function (a) { c[estadoAtiv(a.id)]++; });
  return c;
}

function abrirAtividade() {
  var t = turmaAtual();
  if (!t.alunos.length) {
    alert('Cadastre os alunos desta turma antes de lançar uma atividade.');
    return;
  }
  marcasAtiv = {};
  multAtiv = 1;

  // quem você já marcou como falta hoje, no sorteio, entra aqui como falta
  ausentes(t.id).forEach(function (id) { marcasAtiv[id] = 'faltou'; });

  $('#nomeAtividade').value = '';
  renderAtividade();
  abrirJanela($('#dlgAtividade'));
}

function renderAtividade() {
  var t = turmaAtual();

  $$('#pesoAtividade .chip-peso').forEach(function (b) {
    b.classList.toggle('ativo', Number(b.dataset.mult) === multAtiv);
  });
  $('#explicaPeso').textContent = multAtiv === 1
    ? 'conta como 1 participação'
    : 'conta como ' + multAtiv + ' participações';

  var caixa = $('#listaAtividade');
  caixa.textContent = '';

  t.alunos
    .slice()
    .sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); })
    .forEach(function (a) {
      var marcado = marcasAtiv[a.id];              // sem marca = vai como "não fez"
      var estado = marcado || 'nao';

      var linha = cria('div', 'ativ-linha' + (marcado ? ' marcado' : ''));

      // tocar no nome é o caminho rápido: liga e desliga o "fez"
      var nome = cria('button', 'ativ-nome', a.nome);
      nome.type = 'button';
      nome.addEventListener('click', function () {
        if (marcasAtiv[a.id] === 'fez') delete marcasAtiv[a.id];
        else marcasAtiv[a.id] = 'fez';
        renderAtividade();
      });
      linha.appendChild(nome);

      var grupo = cria('div', 'ativ-botoes');
      ESTADOS_ATIV.forEach(function (e) {
        var classes = 'ativ-op ' + e.classe;
        if (estado === e.chave) classes += marcado ? ' ativo' : ' previsto';
        var b = cria('button', classes, e.glifo);
        b.type = 'button';
        b.title = e.titulo;
        b.addEventListener('click', function () {
          if (e.chave === 'nao') delete marcasAtiv[a.id];   // volta ao padrão
          else marcasAtiv[a.id] = e.chave;
          renderAtividade();
        });
        grupo.appendChild(b);
      });
      linha.appendChild(grupo);

      caixa.appendChild(linha);
    });

  $('#resumoAtividade').textContent = resumoAtiv(contarAtiv(t));
}

function resumoAtiv(c) {
  var partes = [];
  if (c.fez) partes.push(c.fez + ' ' + (c.fez === 1 ? 'fez' : 'fizeram'));
  if (c.parte) partes.push(c.parte + ' em parte');
  if (c.faltou) partes.push(c.faltou + ' ' + (c.faltou === 1 ? 'faltou' : 'faltaram'));
  if (c.nao) partes.push(c.nao + ' ' + (c.nao === 1 ? 'vai' : 'vão') + ' como "não fez"');
  return partes.join(' · ');
}

function lancarAtividade() {
  var t = turmaAtual();
  var c = contarAtiv(t);

  if (!c.fez && !c.parte && !c.nao) {
    alert('Todo mundo está marcado como falta. Não há nada para lançar.');
    return;
  }

  var nome = $('#nomeAtividade').value.replace(/\s+/g, ' ').trim() || 'Atividade';

  if (!confirm('Lançar "' + nome + '" com peso ×' + multAtiv + '?\n\n' +
               resumoAtiv(c) + '\n\nA rodada do sorteio não muda: ninguém gasta a vez.')) return;

  var lote = novoId();
  var quando = new Date().toISOString();
  var quantos = 0;

  t.alunos.forEach(function (a) {
    var e = ESTADOS_ATIV.filter(function (x) { return x.chave === estadoAtiv(a.id); })[0];
    if (!e || !e.resultado) return;              // quem faltou não ganha registro nenhum

    var reg = {
      id: novoId(),
      turmaId: t.id,
      per: periodoAtual(t).id,
      alunoId: a.id,
      resultado: e.resultado,
      data: quando,
      atividade: nome,
      lote: lote
    };
    if (multAtiv > 1) reg.mult = multAtiv;
    dados.registros.push(reg);
    quantos++;
  });

  ultimoLote = { lote: lote, nome: nome, quantos: quantos };
  salvar();

  fecharJanela($('#dlgAtividade'));
  renderTurma();
  renderNotas();
}

function desfazerAtividade() {
  if (!ultimoLote) return;
  var alvo = ultimoLote.lote;

  dados.registros = dados.registros.filter(function (r) { return r.lote !== alvo; });
  ultimoLote = null;
  salvar();
  renderTurma();
  renderNotas();
}

function renderDesfazerAtividade() {
  var caixa = $('#desfazerAtividade');
  if (!ultimoLote) { caixa.classList.add('oculto'); return; }
  caixa.classList.remove('oculto');
  $('#desfazerAtividadeTexto').textContent = '✓ "' + ultimoLote.nome + '" lançada para ' +
    ultimoLote.quantos + (ultimoLote.quantos === 1 ? ' aluno' : ' alunos');
}

/* ---------- visto no caderno ---------- */

var sessaoVisto = null;
var fluxoVisto = { aberto: false, stream: null, detector: null, timer: null,
                   ocupado: false, cartao: false, lotePorTurma: {}, idsPorAluno: {},
                   escolhaTurmaPorQr: {}, combinacaoPendente: '', candidatosPendentes: [],
                   desfazer: [], ultimoQr: '', horaQr: 0, entradaHistorico: false };

function nomePadraoVisto() {
  var d = new Date();
  return 'Visto ' + String(d.getDate()).padStart(2, '0') + '/' +
    String(d.getMonth() + 1).padStart(2, '0');
}

function chaveVisto(turmaId, alunoId) { return turmaId + '|' + alunoId; }

function abrirVisto(alunoId) {
  if (fluxoVisto.aberto) return;
  fluxoVisto = { aberto: true, stream: null, detector: null, timer: null,
                 ocupado: false, cartao: false, lotePorTurma: {}, idsPorAluno: {},
                 escolhaTurmaPorQr: {}, combinacaoPendente: '', candidatosPendentes: [],
                 desfazer: [], ultimoQr: '', horaQr: 0, entradaHistorico: true };
  sessaoVisto = { id: novoId(), nome: nomePadraoVisto() };
  $('#nomeVisto').value = sessaoVisto.nome;
  $('#telaVisto').classList.remove('oculto');
  document.body.classList.add('visto-aberto');
  $('#cartaoVisto').classList.add('oculto');
  $('#resumoVisto').classList.add('oculto');
  $('#avisoCameraVisto').classList.add('oculto');
  $('#mensagemVisto').classList.add('oculto');
  $('.visto-moldura').classList.remove('oculto');
  renderContadorVisto();
  try { history.pushState({ visto: true }, '', location.href); } catch (e) {}
  if (alunoId) mostrarAlunoPorQr(alunoId);
  carregarLeitorVisto(function () {
    if (!fluxoVisto.aberto) return;
    abrirCameraVisto(alunoId);
  });
}

function carregarLeitorVisto(pronto) {
  if ('BarcodeDetector' in window) {
    try {
      fluxoVisto.detector = new BarcodeDetector({ formats: ['qr_code'] });
    } catch (e) { fluxoVisto.detector = null; }
  }
  if (fluxoVisto.detector) { pronto(); return; }
  if (window.jsQR) { pronto(); return; }
  var script = document.createElement('script');
  script.src = './vendor/jsQR.js';
  script.onload = pronto;
  script.onerror = function () { mostrarErroCameraVisto('Leitor de QR indisponível.'); };
  document.head.appendChild(script);
}

function abrirCameraVisto(alunoId) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    mostrarErroCameraVisto('A câmera não abriu. Confira a permissão do navegador.');
    return;
  }
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
    .then(function (stream) {
      if (!fluxoVisto.aberto) {
        stream.getTracks().forEach(function (trilha) { trilha.stop(); });
        return;
      }
      fluxoVisto.stream = stream;
      var video = $('#videoVisto');
      video.srcObject = stream;
      return video.play().then(function () {
        iniciarLeituraVisto();
      });
    }).catch(function () {
      mostrarErroCameraVisto('A câmera não abriu. Confira a permissão do navegador.');
    });
}

function mostrarErroCameraVisto(texto) {
  if (!fluxoVisto.aberto) return;
  if (fluxoVisto.stream) {
    fluxoVisto.stream.getTracks().forEach(function (trilha) { trilha.stop(); });
    fluxoVisto.stream = null;
  }
  $('#avisoCameraVisto').textContent = texto;
  $('#avisoCameraVisto').classList.remove('oculto');
  $('.visto-moldura').classList.add('oculto');
}

function idDoQr(valor) {
  var texto = String(valor || '').trim();
  var achado = /(?:^|[#&?])([pv])=([^&]+)/i.exec(texto);
  if (!achado && /^[pv]=/i.test(texto)) achado = /^([pv])=([^&]+)/i.exec(texto);
  if (!achado && /^https?:\/\//i.test(texto)) {
    var hash = texto.split('#')[1] || '';
    achado = /(?:^|&)([pv])=([^&]+)/i.exec(hash);
  }
  var tipo = achado ? achado[1].toLowerCase() : 'v';
  var valorQr = achado ? achado[2] : texto.replace(/^#/, '');
  try { valorQr = decodeURIComponent(valorQr); } catch (e) {}
  return { tipo: tipo, valor: valorQr };
}

function acharAlunoEmTodas(id) {
  for (var i = 0; i < dados.turmas.length; i++) {
    var t = dados.turmas[i];
    var a = alunoPorId(t, id);
    if (a) return { turma: t, aluno: a };
  }
  return null;
}

function acharPessoaEmTodas(pessoa) {
  var encontrados = [];
  dados.turmas.forEach(function (t) {
    t.alunos.forEach(function (a) {
      if (a.pessoa === pessoa) encontrados.push({ turma: t, aluno: a });
    });
  });
  return encontrados;
}

function mostrarCartaoParaAluno(achado) {
  fluxoVisto.cartao = true;
  fluxoVisto.alunoAtual = achado;
  $('#nomeAlunoVisto').textContent = achado.aluno.nome;
  $('#turmaAlunoVisto').textContent = achado.turma.nome;
  $('#opcoesTurmaVisto').classList.add('oculto');
  $('#opcoesTurmaVisto').textContent = '';
  $('.botoes-visto').classList.remove('oculto');
  var chave = chaveVisto(achado.turma.id, achado.aluno.id);
  var regId = fluxoVisto.idsPorAluno[chave];
  var reg = regId ? dados.registros.filter(function (r) { return r.id === regId; })[0] : null;
  var estado = $('#notaAtualVisto');
  if (reg) {
    estado.textContent = 'Já recebeu: ' + (reg.resultado === 'certo' ? 'Completo · 1,0' : 'Metade · 0,7') + '. Toque para trocar.';
    estado.classList.remove('oculto');
  } else estado.classList.add('oculto');
  $('#cartaoVisto').classList.remove('oculto');
}

function escolherTurmaDoQr(turmaId) {
  var candidatos = fluxoVisto.candidatosPendentes || [];
  for (var i = 0; i < candidatos.length; i++) {
    if (candidatos[i].turma.id === turmaId) {
      fluxoVisto.escolhaTurmaPorQr[fluxoVisto.combinacaoPendente] = turmaId;
      fluxoVisto.candidatosPendentes = [];
      fluxoVisto.combinacaoPendente = '';
      mostrarCartaoParaAluno(candidatos[i]);
      return;
    }
  }
}

function mostrarAlunoPorQr(valor) {
  if (!fluxoVisto.aberto) return;
  var qr = typeof valor === 'object' && valor.tipo ? valor : idDoQr(valor);
  var encontrados = qr.tipo === 'p' ? acharPessoaEmTodas(qr.valor) : [];
  if (qr.tipo === 'v') {
    var achado = acharAlunoEmTodas(qr.valor);
    if (achado) encontrados.push(achado);
  }
  if (!encontrados.length) {
    mostrarMensagemVisto('QR não reconhecido neste aparelho', 2000);
    return;
  }
  if (encontrados.length === 1) {
    mostrarCartaoParaAluno(encontrados[0]);
    return;
  }
  var ativa = turmaAtual();
  if (ativa) {
    for (var i = 0; i < encontrados.length; i++) {
      if (encontrados[i].turma.id === ativa.id) {
        mostrarCartaoParaAluno(encontrados[i]);
        return;
      }
    }
  }
  var ids = encontrados.map(function (x) { return x.turma.id; }).sort();
  var combinacao = ids.join('|');
  var escolhida = fluxoVisto.escolhaTurmaPorQr[combinacao];
  if (escolhida) {
    for (var j = 0; j < encontrados.length; j++) {
      if (encontrados[j].turma.id === escolhida) {
        mostrarCartaoParaAluno(encontrados[j]);
        return;
      }
    }
  }
  fluxoVisto.cartao = true;
  fluxoVisto.alunoAtual = null;
  fluxoVisto.combinacaoPendente = combinacao;
  fluxoVisto.candidatosPendentes = encontrados;
  $('#nomeAlunoVisto').textContent = encontrados[0].aluno.nome;
  $('#turmaAlunoVisto').textContent = 'Escolha a turma';
  $('#notaAtualVisto').classList.add('oculto');
  $('.botoes-visto').classList.add('oculto');
  var opcoes = $('#opcoesTurmaVisto');
  opcoes.textContent = '';
  encontrados.forEach(function (item) {
    var botao = cria('button', 'visto-escolha-turma', item.turma.nome);
    botao.type = 'button';
    botao.setAttribute('data-turma-visto', item.turma.id);
    opcoes.appendChild(botao);
  });
  opcoes.classList.remove('oculto');
  $('#cartaoVisto').classList.remove('oculto');
}

function iniciarLeituraVisto() {
  clearTimeout(fluxoVisto.timer);
  if (!fluxoVisto.aberto) return;
  fluxoVisto.timer = setTimeout(lerQuadroVisto, 150);
}

function lerQuadroVisto() {
  if (!fluxoVisto.aberto || fluxoVisto.cartao || !fluxoVisto.stream ||
      !$('#resumoVisto').classList.contains('oculto')) return;
  if (fluxoVisto.ocupado) { iniciarLeituraVisto(); return; }
  var video = $('#videoVisto');
  if (video.readyState < 2 || !video.videoWidth) { iniciarLeituraVisto(); return; }
  fluxoVisto.ocupado = true;
  if (fluxoVisto.detector) {
    fluxoVisto.detector.detect(video).then(function (resultados) {
      if (resultados && resultados.length) receberQrVisto(resultados[0].rawValue);
    }).catch(function () {}).then(function () {
      fluxoVisto.ocupado = false;
      iniciarLeituraVisto();
    });
    return;
  }
  var canvas = lerQuadroVisto.canvas || (lerQuadroVisto.canvas = document.createElement('canvas'));
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  var contexto = canvas.getContext('2d', { willReadFrequently: true });
  contexto.drawImage(video, 0, 0, canvas.width, canvas.height);
  var imagem = contexto.getImageData(0, 0, canvas.width, canvas.height);
  var resultado = window.jsQR ? window.jsQR(imagem.data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' }) : null;
  if (resultado) receberQrVisto(resultado.data);
  fluxoVisto.ocupado = false;
  iniciarLeituraVisto();
}

function receberQrVisto(texto) {
  var qr = idDoQr(texto);
  var chaveQr = qr.tipo + ':' + qr.valor;
  var agora = Date.now();
  if (!qr.valor || (chaveQr === fluxoVisto.ultimoQr && agora - fluxoVisto.horaQr < 3000)) return;
  fluxoVisto.ultimoQr = chaveQr;
  fluxoVisto.horaQr = agora;
  mostrarAlunoPorQr(qr);
}

function renderContadorVisto() {
  var total = Object.keys(fluxoVisto.idsPorAluno).length;
  $('#contadorVistos').textContent = total + (total === 1 ? ' visto' : ' vistos');
  $('#btnDesfazerVisto').disabled = !fluxoVisto.desfazer.length;
}

function nomeAtualVisto() {
  return $('#nomeVisto').value.replace(/\s+/g, ' ').trim() || nomePadraoVisto();
}

function atualizarNomeDosVistos() {
  if (!fluxoVisto.aberto) return;
  sessaoVisto.nome = nomeAtualVisto();
  Object.keys(fluxoVisto.lotePorTurma).forEach(function (turmaId) {
    var lote = fluxoVisto.lotePorTurma[turmaId];
    dados.registros.forEach(function (r) {
      if (r.lote === lote && r.visto) r.atividade = sessaoVisto.nome;
    });
  });
  salvar();
}

function gravarVisto(resultado) {
  var achado = fluxoVisto.alunoAtual;
  if (!achado) return;
  atualizarNomeDosVistos();
  var t = achado.turma, a = achado.aluno;
  var chave = chaveVisto(t.id, a.id);
  var anteriorId = fluxoVisto.idsPorAluno[chave];
  var anterior = anteriorId ? dados.registros.filter(function (r) { return r.id === anteriorId; })[0] : null;
  var faltas = ausentes(t.id);
  var eraFalta = faltas.indexOf(a.id) !== -1;
  var reg = {
    id: anterior ? anterior.id : novoId(),
    turmaId: t.id,
    per: periodoAtual(t).id,
    alunoId: a.id,
    resultado: resultado,
    data: new Date().toISOString(),
    atividade: sessaoVisto.nome,
    lote: fluxoVisto.lotePorTurma[t.id] || (fluxoVisto.lotePorTurma[t.id] = novoId()),
    visto: true
  };
  fluxoVisto.desfazer.push({ chave: chave, regId: reg.id, anterior: anterior ? JSON.parse(JSON.stringify(anterior)) : null, eraFalta: eraFalta });
  if (anterior) {
    dados.registros = dados.registros.map(function (r) { return r.id === anterior.id ? reg : r; });
  } else dados.registros.push(reg);
  fluxoVisto.idsPorAluno[chave] = reg.id;
  if (eraFalta) faltas.splice(faltas.indexOf(a.id), 1);
  salvar();
  renderContadorVisto();
  fluxoVisto.cartao = false;
  fluxoVisto.alunoAtual = null;
  $('#cartaoVisto').classList.add('oculto');
  mostrarMensagemVisto('✓ ' + a.nome + ' · ' + (resultado === 'certo' ? 'Completo' : 'Metade'), 1500);
  vibrar(24);
}

function desfazerVisto() {
  var acao = fluxoVisto.desfazer.pop();
  if (!acao) return;
  if (acao.anterior) {
    if (acao.anterior.visto) acao.anterior.atividade = sessaoVisto.nome;
    dados.registros = dados.registros.map(function (r) { return r.id === acao.regId ? acao.anterior : r; });
    fluxoVisto.idsPorAluno[acao.chave] = acao.regId;
  } else {
    dados.registros = dados.registros.filter(function (r) { return r.id !== acao.regId; });
    delete fluxoVisto.idsPorAluno[acao.chave];
  }
  if (acao.eraFalta) {
    var partes = acao.chave.split('|');
    var faltas = ausentes(partes[0]);
    if (faltas.indexOf(partes[1]) === -1) faltas.push(partes[1]);
  }
  salvar();
  renderContadorVisto();
  renderNotas();
}

function mostrarMensagemVisto(texto, duracao) {
  var el = $('#mensagemVisto');
  el.textContent = texto;
  el.classList.remove('oculto');
  clearTimeout(mostrarMensagemVisto.timer);
  mostrarMensagemVisto.timer = setTimeout(function () {
    el.classList.add('oculto');
    if (fluxoVisto.aberto && !fluxoVisto.cartao) iniciarLeituraVisto();
  }, duracao);
}

function renderResumoVisto() {
  atualizarNomeDosVistos();
  clearTimeout(fluxoVisto.timer);
  var caixa = $('#linhasResumoVisto');
  caixa.textContent = '';
  Object.keys(fluxoVisto.lotePorTurma).forEach(function (turmaId) {
    var t = dados.turmas.filter(function (x) { return x.id === turmaId; })[0];
    if (!t) return;
    var vistos = t.alunos.filter(function (a) { return !!fluxoVisto.idsPorAluno[chaveVisto(t.id, a.id)]; }).length;
    var faltaram = ausentes(t.id).filter(function (id) { return !!alunoPorId(t, id); }).length;
    var sem = Math.max(0, t.alunos.length - vistos - faltaram);
    caixa.appendChild(cria('div', 'linha-resumo-visto', t.nome + ': ' + vistos + ' com visto · ' + sem +
      ' sem visto (' + faltaram + (faltaram === 1 ? ' faltou)' : ' faltaram)')));
  });
  $('#resumoVisto').classList.remove('oculto');
}

function encerrarVisto(comZeros) {
  atualizarNomeDosVistos();
  if (comZeros) {
    var quando = new Date().toISOString();
    Object.keys(fluxoVisto.lotePorTurma).forEach(function (turmaId) {
      var t = dados.turmas.filter(function (x) { return x.id === turmaId; })[0];
      if (!t) return;
      var faltaram = ausentes(t.id);
      t.alunos.forEach(function (a) {
        if (fluxoVisto.idsPorAluno[chaveVisto(t.id, a.id)] || faltaram.indexOf(a.id) !== -1) return;
        dados.registros.push({ id: novoId(), turmaId: t.id, per: periodoAtual(t).id,
          alunoId: a.id, resultado: 'recusou', data: quando, atividade: sessaoVisto.nome,
          lote: fluxoVisto.lotePorTurma[t.id], visto: true });
      });
    });
    salvar();
  }
  fecharVisto(true);
}

function fecharVisto(voltarHistorico) {
  if (!fluxoVisto.aberto) return;
  fluxoVisto.aberto = false;
  clearTimeout(fluxoVisto.timer);
  clearTimeout(mostrarMensagemVisto.timer);
  if (fluxoVisto.stream) fluxoVisto.stream.getTracks().forEach(function (trilha) { trilha.stop(); });
  fluxoVisto.stream = null;
  $('#videoVisto').srcObject = null;
  $('#telaVisto').classList.add('oculto');
  $('#resumoVisto').classList.add('oculto');
  document.body.classList.remove('visto-aberto');
  renderNotas();
  renderSortear();
  if (voltarHistorico && fluxoVisto.entradaHistorico) {
    fluxoVisto.entradaHistorico = false;
    try { history.back(); } catch (e) {}
  }
}

function ligarEventosVisto() {
  $('#btnVisto').addEventListener('click', function () { abrirVisto(null); });
  $('#btnEncerrarVisto').addEventListener('click', renderResumoVisto);
  $('#btnFecharVisto').addEventListener('click', function () { fecharVisto(true); });
  $('#btnDesfazerVisto').addEventListener('click', desfazerVisto);
  $('#btnCompletoVisto').addEventListener('click', function () { gravarVisto('certo'); });
  $('#btnMetadeVisto').addEventListener('click', function () { gravarVisto('errou'); });
  $('#opcoesTurmaVisto').addEventListener('click', function (evento) {
    var id = evento.target.getAttribute('data-turma-visto');
    if (id) escolherTurmaDoQr(id);
  });
  $('#btnCancelarVisto').addEventListener('click', function () {
    fluxoVisto.cartao = false;
    fluxoVisto.alunoAtual = null;
    fluxoVisto.candidatosPendentes = [];
    fluxoVisto.combinacaoPendente = '';
    $('#cartaoVisto').classList.add('oculto');
    $('#opcoesTurmaVisto').classList.add('oculto');
    $('.botoes-visto').classList.remove('oculto');
    iniciarLeituraVisto();
  });
  $('#nomeVisto').addEventListener('change', atualizarNomeDosVistos);
  $('#nomeVisto').addEventListener('blur', atualizarNomeDosVistos);
  $('#btnZerosVisto').addEventListener('click', function () { encerrarVisto(true); });
  $('#btnFecharSemZerosVisto').addEventListener('click', function () { encerrarVisto(false); });
  $('#btnVoltarVisto').addEventListener('click', function () {
    $('#resumoVisto').classList.add('oculto');
    iniciarLeituraVisto();
  });
  window.addEventListener('popstate', function () { if (fluxoVisto.aberto) fecharVisto(false); });
  // link de QR aberto com o app já na tela (mesma aba)
  window.addEventListener('hashchange', abrirVistoPeloEndereco);
}

function abrirVistoPeloEndereco() {
  var id = null;
  var hash = location.hash || '';
  if (/^#?[pv]=/i.test(hash)) id = idDoQr(hash);
  if (!id || !id.valor) return;
  try { history.replaceState(history.state, '', location.pathname + location.search); } catch (e) {}
  // com a tela do visto já aberta, só mostra o aluno novo
  if (fluxoVisto.aberto) mostrarAlunoPorQr(id);
  else abrirVisto(id);
}

/* ---------- pergunta para o grupo ---------- */

/* Uma pergunta de A a E para vários alunos ao mesmo tempo. O app sorteia o
   grupo, você marca a letra que cada um respondeu, marca a resposta certa e
   lança tudo de uma vez: quem bateu leva "respondeu certo", o resto leva
   "respondeu, mas errou". Quem ficar sem letra entra como quem errou, porque
   a vez dele foi gasta do mesmo jeito. */

var ALTS = ['A', 'B', 'C', 'D', 'E'];

var grupoIds = [];         // alunos sorteados, na ordem em que saíram
var grupoAlt = {};         // alunoId -> letra que ele marcou
var grupoGabarito = null;  // a resposta certa
var grupoQtd = 5;          // quantos sortear de uma vez
var multGrupo = 1;         // peso desta pergunta

function abrirGrupo() {
  var t = turmaAtual();
  if (!t.alunos.length) {
    alert('Cadastre os alunos desta turma antes de sortear um grupo.');
    return;
  }
  multGrupo = 1;
  if (!sortearGrupo()) return;
  abrirJanela($('#dlgGrupo'));
}

// pega quantos couberem sem repetir ninguém na rodada. se a rodada acabar no
// meio do grupo, ela recomeça ali mesmo e o resto sai da lista nova
function sortearGrupo() {
  var t = turmaAtual();

  grupoIds = [];
  grupoAlt = {};
  grupoGabarito = null;

  grupoIds = sortearVarios(t, grupoQtd, []);

  if (!grupoIds.length) {
    alert('Ninguém disponível: todos estão marcados como falta hoje.');
    return false;
  }

  vibrar(12);
  renderGrupo();
  return true;
}

// aluno sorteado que não está na sala: marca a falta do dia e chama outro
function faltouNoGrupo(alunoId) {
  var t = turmaAtual();
  var lista = ausentes(t.id);
  if (lista.indexOf(alunoId) === -1) lista.push(alunoId);
  salvar();

  grupoIds = grupoIds.filter(function (id) { return id !== alunoId; });
  delete grupoAlt[alunoId];

  var substituto = sortearVarios(t, 1, grupoIds);
  if (substituto.length) grupoIds.push(substituto[0]);

  vibrar(14);
  renderGrupo();
  renderSortear();
}

function contarGrupo() {
  var acertos = 0, semLetra = 0;
  grupoIds.forEach(function (id) {
    if (!grupoAlt[id]) semLetra++;
    if (grupoGabarito && grupoAlt[id] === grupoGabarito) acertos++;
  });
  return { total: grupoIds.length, acertos: acertos,
           erros: grupoIds.length - acertos, semLetra: semLetra };
}

function resumoGrupo() {
  var c = contarGrupo();
  if (!c.total) return 'Ninguém sorteado.';
  if (!grupoGabarito) return 'Marque a resposta certa (A a E) para poder lançar.';

  var partes = [c.acertos + (c.acertos === 1 ? ' acertou' : ' acertaram')];
  if (c.erros) partes.push(c.erros === 1 ? '1 tentou, mas errou' : c.erros + ' tentaram, mas erraram');
  if (c.semLetra) partes.push(c.semLetra === 1 ? '1 sem letra marcada' : c.semLetra + ' sem letra marcada');
  return partes.join(' · ');
}

function renderGrupo() {
  var t = turmaAtual();

  $$('#qtdGrupo .chip-peso').forEach(function (b) {
    b.classList.toggle('ativo', Number(b.dataset.qtd) === grupoQtd);
  });
  $$('#pesoGrupo .chip-peso').forEach(function (b) {
    b.classList.toggle('ativo', Number(b.dataset.mult) === multGrupo);
  });
  $('#explicaPesoGrupo').textContent = multGrupo === 1
    ? 'conta como 1 participação'
    : 'conta como ' + multGrupo + ' participações';

  var gab = $('#gabaritoGrupo');
  gab.textContent = '';
  ALTS.forEach(function (letra) {
    var b = cria('button', 'alt-op gab' + (grupoGabarito === letra ? ' certa' : ''), letra);
    b.type = 'button';
    b.addEventListener('click', function () {
      grupoGabarito = grupoGabarito === letra ? null : letra;
      renderGrupo();
    });
    gab.appendChild(b);
  });

  var caixa = $('#listaGrupo');
  caixa.textContent = '';

  grupoIds.forEach(function (id) {
    var a = alunoPorId(t, id);
    if (!a) return;
    var marcada = grupoAlt[id] || null;

    var linha = cria('div', 'grupo-linha' + (marcada ? ' marcado' : ''));

    var cabeca = cria('div', 'grupo-cabeca');
    var av = cria('span', 'avatar', iniciais(a.nome));
    pintarAvatar(av, a.nome);
    cabeca.appendChild(av);
    cabeca.appendChild(cria('span', 'grupo-nome', a.nome));

    // não veio hoje: sai do grupo, entra a falta do dia e outro é sorteado
    var falta = cria('button', 'tirar-varios', '↻');
    falta.type = 'button';
    falta.title = 'Faltou hoje (sorteia outro no lugar)';
    falta.addEventListener('click', function () { faltouNoGrupo(id); });
    cabeca.appendChild(falta);

    linha.appendChild(cabeca);

    var botoes = cria('div', 'alts');
    ALTS.forEach(function (letra) {
      var classes = 'alt-op';
      if (marcada === letra) {
        classes += ' marcada';
        if (grupoGabarito) classes += (letra === grupoGabarito ? ' certa' : ' errada');
      }
      var b = cria('button', classes, letra);
      b.type = 'button';
      b.addEventListener('click', function () {
        if (grupoAlt[id] === letra) delete grupoAlt[id];   // tocar de novo desmarca
        else grupoAlt[id] = letra;
        renderGrupo();
      });
      botoes.appendChild(b);
    });
    linha.appendChild(botoes);

    caixa.appendChild(linha);
  });

  $('#resumoGrupo').textContent = resumoGrupo();
}

function lancarGrupo() {
  var t = turmaAtual();
  var c = contarGrupo();

  if (!c.total) return;
  if (!grupoGabarito) {
    alert('Marque a resposta certa (A a E) antes de lançar.');
    return;
  }

  if (!confirm('Lançar esta pergunta com peso ×' + multGrupo + '?\n\n' +
               'Resposta certa: ' + grupoGabarito + '\n' + resumoGrupo() +
               '\n\n' + (c.total === 1 ? 'O aluno gasta' : 'Os ' + c.total + ' gastam') +
               ' a vez na rodada. Quem ficou sem letra vai como "respondeu, mas errou".')) return;

  var lote = novoId();
  var quando = new Date().toISOString();
  var novos = [];

  grupoIds.forEach(function (id) {
    var a = alunoPorId(t, id);
    if (!a) return;
    var letra = grupoAlt[id] || '';

    var reg = {
      id: novoId(),
      turmaId: t.id,
      per: periodoAtual(t).id,
      alunoId: id,
      resultado: letra === grupoGabarito ? 'certo' : 'errou',
      data: quando,
      alt: letra,
      gabarito: grupoGabarito,
      lote: lote
    };
    if (multGrupo > 1) reg.mult = multGrupo;
    dados.registros.push(reg);

    if (rodada(t.id).indexOf(id) === -1) {
      rodada(t.id).push(id);
      novos.push(id);           // só estes voltam pro sorteio se você desfizer
    }
  });

  ultimaAcao = {
    tipo: 'grupo', lote: lote, turmaId: t.id, novos: novos,
    total: c.total, acertos: c.acertos, gabarito: grupoGabarito
  };
  salvar();

  fecharJanela($('#dlgGrupo'));

  sorteado = null;
  ofereceu = false;
  $('#palco').classList.remove('revelado');
  $('#palcoNome').textContent = c.acertos + ' de ' + c.total + ' acertaram';
  $('#palcoDica').textContent = 'Resposta certa: ' + grupoGabarito +
    (multGrupo > 1 ? ' · ⚡ ×' + multGrupo : '');
  $('#acoesResultado').classList.add('oculto');
  $('#acoesSorteio').classList.remove('oculto');
  $('#btnSortear').disabled = false;

  comemorar(c.acertos ? 'certo' : 'errou', c.acertos, multGrupo > 1);

  grupoIds = [];
  grupoAlt = {};
  grupoGabarito = null;

  renderSortear();
  renderNotas();
}

/* ---------- vários alunos de uma vez ---------- */

/* Uma janela só para os dois casos que atrapalhavam a aula: vários alunos se
   oferecem ao mesmo tempo (e chamar um por um demora), ou você quer sortear um
   punhado de uma vez. Cada nome ganha o resultado dele ali na linha, e quem
   não está na sala sai com um toque, sorteando um substituto na hora.
   Quem ficar sem marca nenhuma não é lançado e não gasta a vez. */

var VARIOS_OPS = [
  { chave: 'certo',   glifo: '✓', classe: 'certo',   titulo: 'Respondeu certo' },
  { chave: 'errou',   glifo: '≈', classe: 'errou',   titulo: 'Respondeu, mas errou' },
  { chave: 'naoSabe', glifo: '?', classe: 'naosabe', titulo: 'Disse que não sabe' },
  { chave: 'recusou', glifo: '✕', classe: 'recusou', titulo: 'Se recusou a responder' }
];

var variosModo = 'ofereceu';   // 'ofereceu' = escolhidos por você, 'sorteio' = sorteados
var variosIds = [];            // quem está na lista da janela
var variosRes = {};            // alunoId -> resultado marcado
var variosQtd = 3;             // quantos sortear de uma vez
var multVarios = 1;            // peso desta rodada

/* Sorteia até "quantos" alunos sem repetir ninguém que já caiu na rodada e sem
   pegar quem faltou hoje. Se a rodada acabar no meio, ela recomeça ali mesmo.
   Serve tanto para esta janela quanto para a pergunta do grupo. */
function sortearVarios(turma, quantos, fora) {
  var faltaram = ausentes(turma.id);
  var possiveis = turma.alunos.filter(function (a) { return faltaram.indexOf(a.id) === -1; });
  var escolhidos = [];
  if (!possiveis.length) return escolhidos;

  var jaTem = (fora || []).slice();
  var pool = disponiveis(turma).filter(function (a) { return jaTem.indexOf(a.id) === -1; });
  var recomecou = false;

  while (escolhidos.length < quantos) {
    if (!pool.length) {
      if (recomecou) break;                   // a turma é menor que o pedido
      recomecou = true;
      dados.rodadas[turma.id] = [];           // todo mundo já passou: rodada nova
      pool = possiveis.filter(function (a) {
        return jaTem.indexOf(a.id) === -1 && escolhidos.indexOf(a.id) === -1;
      });
      if (!pool.length) break;
    }
    var i = aleatorio(pool.length);
    escolhidos.push(pool[i].id);
    pool.splice(i, 1);
  }

  if (recomecou) salvar();
  return escolhidos;
}

function abrirVarios() {
  var t = turmaAtual();
  if (!t.alunos.length) {
    alert('Cadastre os alunos desta turma antes de lançar vários de uma vez.');
    return;
  }
  variosModo = 'ofereceu';
  variosIds = [];
  variosRes = {};
  multVarios = 1;
  $('#buscaVarios').value = '';
  renderVarios();
  abrirJanela($('#dlgVarios'));
  $('#buscaVarios').focus();
}

function trocarModoVarios(modo) {
  if (modo === variosModo) return;
  variosModo = modo;
  variosIds = [];
  variosRes = {};
  $('#buscaVarios').value = '';

  if (modo === 'sorteio') {
    var t = turmaAtual();
    variosIds = sortearVarios(t, variosQtd, []);
    if (!variosIds.length) {
      alert('Ninguém disponível: todos estão marcados como falta hoje.');
      variosModo = 'ofereceu';
    } else {
      vibrar(12);
    }
  }
  renderVarios();
}

function ressortearVarios() {
  var t = turmaAtual();
  variosRes = {};
  variosIds = sortearVarios(t, variosQtd, []);
  if (!variosIds.length) alert('Ninguém disponível: todos estão marcados como falta hoje.');
  else vibrar(12);
  renderVarios();
}

function juntarNoVarios(alunoId) {
  if (variosIds.indexOf(alunoId) === -1) variosIds.push(alunoId);
  $('#buscaVarios').value = '';
  vibrar(10);
  renderVarios();
}

function tirarDoVarios(alunoId) {
  variosIds = variosIds.filter(function (id) { return id !== alunoId; });
  delete variosRes[alunoId];
  renderVarios();
}

// o aluno não está na sala: marca a falta do dia e, se ele tinha sido sorteado,
// já sorteia outro no lugar dele
function faltouNoVarios(alunoId) {
  var t = turmaAtual();
  var lista = ausentes(t.id);
  if (lista.indexOf(alunoId) === -1) lista.push(alunoId);
  salvar();

  variosIds = variosIds.filter(function (id) { return id !== alunoId; });
  delete variosRes[alunoId];

  if (variosModo === 'sorteio') {
    var substituto = sortearVarios(t, 1, variosIds);
    if (substituto.length) variosIds.push(substituto[0]);
  }
  vibrar(14);
  renderVarios();
  renderSortear();
}

function renderBuscaVarios() {
  var t = turmaAtual();
  var caixa = $('#listaBuscaVarios');
  var texto = $('#buscaVarios').value.trim();
  caixa.textContent = '';

  if (variosModo !== 'ofereceu' || !texto) {
    caixa.classList.add('oculto');
    return;
  }
  caixa.classList.remove('oculto');

  var achados = buscarAlunos(t, texto).filter(function (a) {
    return variosIds.indexOf(a.id) === -1;      // quem já está na lista sai da busca
  });

  if (!achados.length) {
    caixa.appendChild(cria('p', 'vazio', 'Nenhum nome novo parecido com isso.'));
    return;
  }

  var feitos = rodada(t.id);
  var faltaram = ausentes(t.id);
  var vezes = contarParticipacoes(t);

  achados.slice(0, 12).forEach(function (a, i) {
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

    b.addEventListener('click', function () { juntarNoVarios(a.id); });
    caixa.appendChild(b);
  });
}

function contarVarios() {
  var c = { total: variosIds.length, marcados: 0, certo: 0, sem: 0 };
  variosIds.forEach(function (id) {
    var r = variosRes[id];
    if (!r) { c.sem++; return; }
    c.marcados++;
    if (r === 'certo') c.certo++;
  });
  return c;
}

function textoResumoVarios() {
  var c = contarVarios();
  if (!c.total) {
    return variosModo === 'sorteio'
      ? 'Ninguém sorteado ainda.'
      : 'Busque os nomes acima e toque para juntar na lista.';
  }
  if (!c.marcados) return 'Marque o que aconteceu com cada um (ou use os atalhos "Todos").';

  var partes = [c.marcados + (c.marcados === 1 ? ' vai ser lançado' : ' vão ser lançados')];
  if (c.certo) partes.push(c.certo + (c.certo === 1 ? ' acertou' : ' acertaram'));
  if (c.sem) partes.push(c.sem + (c.sem === 1 ? ' sem marca fica de fora' : ' sem marca ficam de fora'));
  return partes.join(' · ');
}

function renderVarios() {
  var t = turmaAtual();

  $$('#modoVarios .chip-peso').forEach(function (b) {
    b.classList.toggle('ativo', b.dataset.modo === variosModo);
  });
  $$('#qtdVarios .chip-peso').forEach(function (b) {
    b.classList.toggle('ativo', Number(b.dataset.qtd) === variosQtd);
  });
  $$('#pesoVarios .chip-peso').forEach(function (b) {
    b.classList.toggle('ativo', Number(b.dataset.mult) === multVarios);
  });
  $('#explicaPesoVarios').textContent = multVarios === 1
    ? 'conta como 1 participação'
    : 'conta como ' + multVarios + ' participações';

  $('#linhaSorteioVarios').classList.toggle('oculto', variosModo !== 'sorteio');
  $('#buscaVariosCaixa').classList.toggle('oculto', variosModo !== 'ofereceu');
  renderBuscaVarios();

  var caixa = $('#listaVarios');
  caixa.textContent = '';

  if (!variosIds.length) {
    caixa.appendChild(cria('p', 'vazio', variosModo === 'sorteio'
      ? 'Ninguém sorteado. Toque em "Sortear de novo".'
      : 'Nenhum nome na lista ainda.'));
  }

  variosIds.forEach(function (id) {
    var a = alunoPorId(t, id);
    if (!a) return;
    var marcado = variosRes[id] || null;

    var linha = cria('div', 'grupo-linha varios-linha' + (marcado ? ' marcado' : ''));

    var cabeca = cria('div', 'grupo-cabeca');
    var av = cria('span', 'avatar');
    pintarAvatar(av, a.nome);
    cabeca.appendChild(av);
    cabeca.appendChild(cria('span', 'grupo-nome', a.nome));

    var tirar = cria('button', 'tirar-varios', '✕');
    tirar.type = 'button';
    tirar.title = 'Tirar da lista (não registra nada)';
    tirar.addEventListener('click', function () { tirarDoVarios(id); });
    cabeca.appendChild(tirar);
    linha.appendChild(cabeca);

    var ops = cria('div', 'varios-ops');
    VARIOS_OPS.forEach(function (o) {
      var b = cria('button', 'ativ-op ' + o.classe + (marcado === o.chave ? ' ativo' : ''), o.glifo);
      b.type = 'button';
      b.title = o.titulo;
      b.addEventListener('click', function () {
        if (variosRes[id] === o.chave) delete variosRes[id];   // tocar de novo desmarca
        else variosRes[id] = o.chave;
        renderVarios();
      });
      ops.appendChild(b);
    });

    var falta = cria('button', 'ativ-op faltou', '↻');
    falta.type = 'button';
    falta.title = variosModo === 'sorteio'
      ? 'Faltou hoje (sorteia outro no lugar)'
      : 'Faltou hoje';
    falta.addEventListener('click', function () { faltouNoVarios(id); });
    ops.appendChild(falta);

    linha.appendChild(ops);
    caixa.appendChild(linha);
  });

  $('#resumoVarios').textContent = textoResumoVarios();
}

function lancarVarios() {
  var t = turmaAtual();
  var c = contarVarios();

  if (!c.marcados) {
    alert('Marque o que aconteceu com pelo menos um aluno antes de lançar.');
    return;
  }

  var aviso = c.marcados === 1 ? 'O aluno gasta a vez na rodada.'
                               : 'Os ' + c.marcados + ' gastam a vez na rodada.';
  if (c.sem) aviso += '\nQuem ficou sem marca não é lançado e não gasta a vez.';

  if (!confirm('Lançar para ' + c.marcados +
               (c.marcados === 1 ? ' aluno' : ' alunos') + ' com peso ×' + multVarios + '?\n\n' +
               textoResumoVarios() + '\n\n' + aviso)) return;

  var lote = novoId();
  var quando = new Date().toISOString();
  var novos = [];

  variosIds.forEach(function (id) {
    var resultado = variosRes[id];
    if (!resultado) return;
    if (!alunoPorId(t, id)) return;

    var reg = {
      id: novoId(),
      turmaId: t.id,
      per: periodoAtual(t).id,
      alunoId: id,
      resultado: resultado,
      data: quando,
      lote: lote
    };
    if (multVarios > 1) reg.mult = multVarios;
    if (variosModo === 'ofereceu') reg.ofereceu = true;   // a mão foi deles
    dados.registros.push(reg);

    if (rodada(t.id).indexOf(id) === -1) {
      rodada(t.id).push(id);
      novos.push(id);          // só estes voltam pro sorteio se você desfizer
    }
  });

  ultimaAcao = {
    tipo: 'varios', lote: lote, turmaId: t.id, novos: novos,
    total: c.marcados, acertos: c.certo, ofereceu: variosModo === 'ofereceu'
  };
  salvar();

  fecharJanela($('#dlgVarios'));

  sorteado = null;
  ofereceu = false;
  $('#palco').classList.remove('revelado');
  $('#palcoNome').textContent = c.marcados + (c.marcados === 1 ? ' aluno lançado' : ' alunos lançados');
  $('#palcoDica').textContent = (variosModo === 'ofereceu' ? '🔥 se ofereceram' : '🎲 sorteados') +
    (c.certo ? ' · ' + c.certo + (c.certo === 1 ? ' acertou' : ' acertaram') : '') +
    (multVarios > 1 ? ' · ⚡ ×' + multVarios : '');
  $('#acoesResultado').classList.add('oculto');
  $('#acoesSorteio').classList.remove('oculto');
  $('#btnSortear').disabled = false;

  comemorar(c.certo ? 'certo' : 'errou', c.certo, multVarios > 1);

  variosIds = [];
  variosRes = {};

  irPara('sortear');
  renderNotas();
}

/* ---------- períodos: zerar as notas sem perder nada ---------- */

function renderBlocoPeriodo(t) {
  var ps = periodosDe(t);
  var p = periodoAtual(t);
  var quantos = registrosAgora(t).length;

  $('#periodoAtualTexto').textContent = p.nome + ' · começou em ' + dataCurta(p.inicio) + ' · ' +
    (quantos === 0 ? 'nenhum registro ainda'
                   : quantos === 1 ? '1 registro' : quantos + ' registros');

  // voltar atrás só enquanto o período novo estiver vazio: nada se perde assim
  $('#btnVoltarPeriodo').classList.toggle('oculto', ps.length < 2 || quantos > 0);
}

function abrirPeriodo() {
  var t = turmaAtual();
  var p = periodoAtual(t);
  var regs = registrosAgora(t);

  var alunos = {};
  regs.forEach(function (r) { alunos[r.alunoId] = true; });
  var quantosAlunos = Object.keys(alunos).length;

  $('#resumoPeriodo').textContent = regs.length
    ? 'Vai ficar guardado em "' + p.nome + '": ' + regs.length +
      (regs.length === 1 ? ' registro' : ' registros') + ' de ' + quantosAlunos +
      (quantosAlunos === 1 ? ' aluno' : ' alunos') + '.'
    : 'O período de agora ainda não tem nenhum registro.';

  $('#nomePeriodoAntigo').value = p.nome;
  $('#nomePeriodoNovo').value = 'Período ' + (periodosDe(t).length + 1);
  $('#avisoBackupPeriodo').textContent =
    'Guarde o arquivo antes de virar o período. Ele serve para restaurar tudo se o aparelho der problema.';
  abrirJanela($('#dlgPeriodo'));
}

function comecarPeriodo() {
  var t = turmaAtual();
  var ps = periodosDe(t);
  var p = periodoAtual(t);

  var nomeAntigo = $('#nomePeriodoAntigo').value.replace(/\s+/g, ' ').trim() || p.nome;
  var nomeNovo = $('#nomePeriodoNovo').value.replace(/\s+/g, ' ').trim() ||
                 ('Período ' + (ps.length + 1));
  var quantos = registrosAgora(t).length;

  if (!confirm('Começar "' + nomeNovo + '" em ' + t.nome + '?\n\n' +
               'As notas voltam do zero. Os ' + quantos +
               (quantos === 1 ? ' registro fica guardado' : ' registros ficam guardados') +
               ' em "' + nomeAntigo + '" e você continua vendo em Notas.\n\n' +
               'Se ainda não baixou o backup, cancele e baixe primeiro.')) return;

  p.nome = nomeAntigo;
  p.fim = hoje();
  ps.push({ id: novoId(), nome: nomeNovo, inicio: hoje(), fim: null });

  dados.rodadas[t.id] = [];                                  // rodada do sorteio recomeça
  dados.ausencias[t.id] = { data: hoje(), ids: [] };          // faltas do dia zeram
  ultimaAcao = null;
  ultimoLote = null;
  sorteado = null;
  variosIds = [];
  variosRes = {};
  periodoVisto = 'atual';
  salvar();

  fecharJanela($('#dlgPeriodo'));
  repouso('Período novo', 'as notas voltaram do zero');
  renderTurma();
  irPara('notas');
}

function voltarPeriodo() {
  var t = turmaAtual();
  var ps = periodosDe(t);
  if (ps.length < 2) return;

  if (registrosAgora(t).length) {
    alert('O período de agora já tem registros. Para não perder nada, ele não pode ser desfeito.');
    return;
  }

  var atual = ps[ps.length - 1];
  var anterior = ps[ps.length - 2];
  if (!confirm('Voltar para "' + anterior.nome + '"?\n\n' +
               'O período "' + atual.nome + '" some (ele está vazio) e as notas de "' +
               anterior.nome + '" voltam a valer.')) return;

  ps.pop();
  anterior.fim = null;
  periodoVisto = 'atual';
  salvar();
  renderTurma();
  renderNotas();
}

/* ---------- tela de ajustes ---------- */

function renderAjustes() {
  renderTopo(turmaAtual());
  $('#versaoApp').textContent = VERSAO;
  Object.keys(PESOS_PADRAO).forEach(function (k) {
    $('#peso-' + k).value = num(dados.pesos[k]);
  });
  $('#ligaEfeitos').checked = dados.efeitos;
  $('#campoCodigoHub').value = hub.codigo;
  mostrarEstadoHub();
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

// data e hora no nome: baixar duas vezes no mesmo dia não cobre o arquivo antigo
function nomeArquivo(prefixo, ext) {
  var d = new Date();
  var dd = function (n) { return (n < 10 ? '0' : '') + n; };
  return prefixo + '-' + hoje() + '-' + dd(d.getHours()) + 'h' + dd(d.getMinutes()) + '.' + ext;
}

// o pedaço do nome da turma que entra no arquivo, sem acento e sem espaço
function apelidoTurma(turma) {
  var s = normalizar(turma.nome).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'turma';
}

// enquanto houver um período só, o nome do arquivo continua como sempre foi
function apelidoPeriodo(turma) {
  if (periodosDe(turma).length < 2) return '';
  if (periodoVisto === 'todos') return '-tudo';
  var p = periodoVendo(turma);
  var s = normalizar(p.nome).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s ? '-' + s : '';
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
  // o backup é de todas as turmas, mas leva o nome da que está aberta para
  // você reconhecer o arquivo na pasta de downloads
  baixar(nomeArquivo('sorteio-backup-' + apelidoTurma(turmaAtual()), 'json'),
         JSON.stringify(dados, null, 2), 'application/json');
}

function exportarNotas() {
  var t = turmaAtual();
  var linhas = [['Aluno', 'Oportunidades', 'Se ofereceu', 'Sendo de atividade',
                 'Certo', 'Errou', 'Nao sabe', 'Recusou', 'Com peso extra',
                 'Pontos', 'Nota (0 a 10)']];

  estatisticas(t)
    .sort(function (a, b) { return a.aluno.nome.localeCompare(b.aluno.nome, 'pt-BR'); })
    .forEach(function (s) {
      var c = { certo: 0, errou: 0, naoSabe: 0, recusou: 0 };
      var deAtividade = 0;
      s.registros.forEach(function (r) {
        if (c[r.resultado] !== undefined) c[r.resultado]++;
        if (r.atividade) deAtividade++;
      });
      linhas.push([
        s.aluno.nome, s.vezes, s.ofertas, deAtividade,
        c.certo, c.errou, c.naoSabe, c.recusou,
        s.dobros, num(s.soma), s.nota === null ? '' : num(s.nota)
      ]);
    });

  baixar(nomeArquivo('notas-' + apelidoTurma(t) + apelidoPeriodo(t), 'csv'),
         csv(linhas), 'text/csv;charset=utf-8');
}

function exportarRegistros() {
  var t = turmaAtual();
  var linhas = [['Data', 'Hora', 'Periodo', 'Aluno', 'Origem', 'Resultado', 'Marcou',
                 'Resposta certa', 'Peso', 'Pontos']];

  registrosDa(t)
    .sort(function (a, b) { return String(a.data).localeCompare(String(b.data)); })
    .forEach(function (r) {
      var aluno = alunoPorId(t, r.alunoId);
      var per = periodoPorId(t, r.per);
      var d = new Date(r.data);
      var m = multiploDe(r);
      linhas.push([
        isNaN(d) ? '' : d.toLocaleDateString('pt-BR'),
        isNaN(d) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        per ? per.nome : '',
        aluno ? aluno.nome : '(aluno removido)',
        r.atividade ? r.atividade
                    : (r.gabarito ? 'Pergunta para o grupo' : (r.ofereceu ? 'Se ofereceu' : 'Sorteio')),
        rotulo(r.resultado, r.atividade),
        r.alt || '',
        r.gabarito || '',
        'x' + m,
        num((dados.pesos[r.resultado] || 0) * m)
      ]);
    });

  baixar(nomeArquivo('registros-' + apelidoTurma(t) + apelidoPeriodo(t), 'csv'),
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
  if (typeof dados.zoom !== 'number' || isNaN(dados.zoom)) dados.zoom = 1;
  if (!dados.turmas.length) dados.turmas.push({ id: novoId(), nome: 'Turma 1', alunos: [] });
  if (!turmaAtual()) dados.turmaAtiva = dados.turmas[0].id;
  dados.turmas.forEach(function (t) { garantirPeriodos(t); });
  ultimaAcao = null;
  ultimoLote = null;
  sorteado = null;
  variosIds = [];
  variosRes = {};
  periodoVisto = 'atual';
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

  /* pergunta para o grupo */

  $('#btnGrupo').addEventListener('click', abrirGrupo);
  $('#btnGrupoCancelar').addEventListener('click', function () { fecharJanela($('#dlgGrupo')); });
  $('#btnGrupoLancar').addEventListener('click', lancarGrupo);
  $('#btnRessortear').addEventListener('click', function () { sortearGrupo(); });

  $$('#qtdGrupo .chip-peso').forEach(function (b) {
    b.addEventListener('click', function () {
      grupoQtd = Number(b.dataset.qtd) || 5;
      sortearGrupo();                 // mudou o tamanho: sorteia o grupo de novo
    });
  });

  $$('#pesoGrupo .chip-peso').forEach(function (b) {
    b.addEventListener('click', function () {
      multGrupo = Number(b.dataset.mult) || 1;
      renderGrupo();
    });
  });

  /* vários alunos de uma vez */

  $('#btnVarios').addEventListener('click', abrirVarios);
  $('#btnVariosCancelar').addEventListener('click', function () { fecharJanela($('#dlgVarios')); });
  $('#btnVariosLancar').addEventListener('click', lancarVarios);
  $('#btnRessortearVarios').addEventListener('click', ressortearVarios);

  $$('#modoVarios .chip-peso').forEach(function (b) {
    b.addEventListener('click', function () { trocarModoVarios(b.dataset.modo); });
  });

  $$('#qtdVarios .chip-peso').forEach(function (b) {
    b.addEventListener('click', function () {
      variosQtd = Number(b.dataset.qtd) || 3;
      ressortearVarios();               // mudou o tamanho: sorteia de novo
    });
  });

  $$('#pesoVarios .chip-peso').forEach(function (b) {
    b.addEventListener('click', function () {
      multVarios = Number(b.dataset.mult) || 1;
      renderVarios();
    });
  });

  $$('.todos-op[data-todos]').forEach(function (b) {
    b.addEventListener('click', function () {
      variosIds.forEach(function (id) { variosRes[id] = b.dataset.todos; });
      renderVarios();
    });
  });

  $('#btnLimparVarios').addEventListener('click', function () {
    variosRes = {};
    renderVarios();
  });

  $('#buscaVarios').addEventListener('input', renderBuscaVarios);

  // Enter junta o primeiro da busca, sem tirar a mão do teclado
  $('#buscaVarios').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    var primeiro = $('#listaBuscaVarios .linha-busca');
    if (primeiro) primeiro.click();
  });

  /* períodos */

  $('#btnNovoPeriodo').addEventListener('click', abrirPeriodo);
  $('#btnVoltarPeriodo').addEventListener('click', voltarPeriodo);
  $('#btnPeriodoCancelar').addEventListener('click', function () { fecharJanela($('#dlgPeriodo')); });
  $('#btnPeriodoConfirmar').addEventListener('click', comecarPeriodo);
  $('#btnBackupPeriodo').addEventListener('click', function () {
    exportarBackup();
    $('#avisoBackupPeriodo').textContent =
      'Backup baixado. Confira na pasta de downloads antes de continuar.';
  });

  $('#periodoNotas').addEventListener('change', function (e) {
    periodoVisto = e.target.value;
    renderNotas();
  });

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

  /* projetor */

  $('#btnProjetar').addEventListener('click', abrirProjetor);
  $('#projSair').addEventListener('click', fecharProjetor);
  $('#projMenor').addEventListener('click', function () { mudarZoom(-0.1); });
  $('#projMaior').addEventListener('click', function () { mudarZoom(0.1); });

  $$('#projOrdens .proj-chip').forEach(function (b) {
    b.addEventListener('click', function () { projOrdem = b.dataset.ordem; renderProjetor(); });
  });
  $$('#projCortes .proj-chip').forEach(function (b) {
    b.addEventListener('click', function () { projCorte = Number(b.dataset.corte); renderProjetor(); });
  });

  document.addEventListener('keydown', function (e) {
    if (projAberto && e.key === 'Escape') fecharProjetor();
  });

  // girar o aparelho ou ligar no projetor muda a largura: refaz as colunas
  window.addEventListener('resize', function () { if (projAberto) renderProjetor(); });

  /* atividades */

  $('#btnAtividade').addEventListener('click', abrirAtividade);
  $('#btnAtividadeCancelar').addEventListener('click', function () { fecharJanela($('#dlgAtividade')); });
  $('#btnAtividadeLancar').addEventListener('click', lancarAtividade);
  $('#btnDesfazerAtividade').addEventListener('click', desfazerAtividade);

  $$('#pesoAtividade .chip-peso').forEach(function (b) {
    b.addEventListener('click', function () {
      multAtiv = Number(b.dataset.mult) || 1;
      renderAtividade();
    });
  });

  $('#btnTodosFizeram').addEventListener('click', function () {
    turmaAtual().alunos.forEach(function (a) { marcasAtiv[a.id] = 'fez'; });
    renderAtividade();
  });

  $('#btnLimparAtividade').addEventListener('click', function () {
    marcasAtiv = {};
    renderAtividade();
  });

  /* turmas */

  $('#seletorTurma').addEventListener('change', function (e) {
    dados.turmaAtiva = e.target.value;
    ultimaAcao = null;
    ultimoLote = null;      // o desfazer da atividade era da turma anterior
    grupoIds = [];          // o grupo sorteado era da turma anterior
    variosIds = [];
    variosRes = {};
    periodoVisto = 'atual'; // cada turma tem os períodos dela
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

  ligarEventosVisto();
}

/* ---------- ligação com a página de questões ----------
   Com o código de acesso, o app guarda uma cópia dos dados no servidor do hub
   (é de lá que a página de questões tira a lista da turma) e, sempre que abre,
   busca o que foi marcado na página e lança aqui. Sem código, nada disso roda. */

// aberto pelo endereço de teste do computador, conversa com o servidor de teste
var HUB = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
  ? 'http://127.0.0.1:8787' : 'https://hub-escola.drakefrosst.workers.dev';
var CHAVE_HUB = 'sorteio-hub-codigo';
var hub = { codigo: lerCodigoHub(), timer: null, recebendo: false, ultimoEnvio: null, erro: null };

function lerCodigoHub() {
  try { return localStorage.getItem(CHAVE_HUB) || ''; } catch (e) { return ''; }
}

function hubPedir(metodo, caminho, corpo, codigo) {
  return fetch(HUB + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'X-Chave': codigo || hub.codigo },
    body: corpo ? JSON.stringify(corpo) : undefined,
    cache: 'no-store'
  }).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (j) {
      if (r.status === 401) { var e = new Error('codigo'); e.codigo = true; throw e; }
      if (!r.ok || !j.ok) throw new Error(j.motivo || 'erro');
      return j;
    });
  });
}

// espera uns segundos depois da última mudança, para mandar uma vez só
function agendarEnvioHub() {
  if (!hub || !hub.codigo) return;
  clearTimeout(hub.timer);
  hub.timer = setTimeout(enviarEstadoHub, 4000);
}

function enviarEstadoHub() {
  if (!hub.codigo) return;
  clearTimeout(hub.timer);
  var copia = dados;
  // se um dia passar do limite do servidor, vai só a lista das turmas
  if (JSON.stringify(dados).length > 1800000) {
    copia = Object.assign({}, dados, { registros: [], registrosDeFora: true });
  }
  hubPedir('PUT', '/api/sorteio/estado', { dados: copia }).then(function () {
    hub.ultimoEnvio = new Date();
    hub.erro = null;
    mostrarEstadoHub();
  }).catch(function (e) {
    hub.erro = e.codigo ? 'codigo' : 'rede';
    mostrarEstadoHub();
    if (!e.codigo) hub.timer = setTimeout(enviarEstadoHub, 60000);
  });
}

// dois canais: o das marcações da página de questões e o das turmas vindas do
// iSEduc (separado para que uma versão velha do app não aceite turma sem saber criar)
var CANAIS_HUB = ['sorteio', 'sorteio-turmas'];

function receberCanal(canal) {
  return hubPedir('GET', '/api/' + canal + '/lancamentos').then(function (r) {
    var itens = r.itens || [];
    if (!itens.length) return null;
    var n = aplicarLancamentos(itens);
    salvar();
    return hubPedir('POST', '/api/' + canal + '/lancamentos/aplicados', {
      ids: itens.map(function (i) { return i.id; }), ate: r.hora
    }).then(function () { return n; }, function () { return n; });
  });
}

function receberHub() {
  if (!hub.codigo || hub.recebendo) return;
  hub.recebendo = true;
  var total = { registros: 0, faltas: 0, turmas: 0, alunos: 0 };
  var fila = Promise.resolve();
  CANAIS_HUB.forEach(function (canal) {
    fila = fila.then(function () { return receberCanal(canal); }).then(function (n) {
      if (n) Object.keys(total).forEach(function (k) { total[k] += n[k] || 0; });
    });
  });
  fila.then(function () {
    if (total.registros || total.faltas || total.turmas || total.alunos) {
      avisarHub(total);
      renderSortear();
      if ($('#tela-notas').classList.contains('ativa')) renderNotas();
      if ($('#tela-turma').classList.contains('ativa')) renderTurma();
    }
  }).catch(function (e) {
    if (e && e.codigo) { hub.erro = 'codigo'; mostrarEstadoHub(); }
  }).then(function () { hub.recebendo = false; });
}

function diaDe(iso) {
  var d = new Date(iso);
  if (isNaN(d)) return '';
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/* Cada lançamento tem um id fixo. Se a página corrigir uma marcação, o mesmo id
   chega de novo e substitui o anterior, então lançar duas vezes não duplica. */
function aplicarLancamentos(itens) {
  var n = { registros: 0, faltas: 0, turmas: 0, alunos: 0 };
  itens.forEach(function (it) {
    if (it.tipo === 'turma') {
      var turma = null;
      if (it.turmaId) dados.turmas.forEach(function (x) { if (x.id === it.turmaId) turma = x; });
      // não procurar pelo número do iSEduc: duas disciplinas da mesma turma
      // (Inglês e IA do 3º DS) são turmas diferentes aqui
      if (!turma) dados.turmas.forEach(function (x) { if (x.nome === it.turmaNome) turma = x; });
      if (!turma) {
        turma = { id: novoId(), nome: it.turmaNome, alunos: [] };
        dados.turmas.push(turma);
        garantirPeriodos(turma);
        n.turmas++;
      }
      turma.iseduc = it.iseduc;
      if (!Array.isArray(turma.alunos)) turma.alunos = [];
      (it.alunos || []).forEach(function (itemAluno) {
        var existente = itemAluno.appId ? alunoPorId(turma, itemAluno.appId) : null;
        if (existente) {
          existente.pessoa = itemAluno.pessoa;
          if (existente.nome !== itemAluno.nome) existente.nome = itemAluno.nome;
        } else {
          var pessoaExistente = turma.alunos.some(function (a) { return a.pessoa === itemAluno.pessoa; });
          if (pessoaExistente) return;
          turma.alunos.push({ id: novoId(), nome: itemAluno.nome, pessoa: itemAluno.pessoa });
          n.alunos++;
        }
      });
      return;
    }
    var t = null;
    dados.turmas.forEach(function (x) { if (x.id === it.turmaId) t = x; });
    if (!t || !it.alunoId || !alunoPorId(t, it.alunoId)) return;

    dados.registros = dados.registros.filter(function (r) { return r.id !== it.id; });
    var ehHoje = diaDe(it.data) === hoje();
    var faltas = ausentes(t.id);

    if (it.tipo === 'registro' && ROTULOS[it.resultado]) {
      var reg = {
        id: it.id,
        turmaId: t.id,
        per: periodoPorId(t, it.per) ? it.per : periodoAtual(t).id,
        alunoId: it.alunoId,
        resultado: it.resultado,
        data: it.data || new Date().toISOString(),
        origem: 'questoes'
      };
      if (it.situacao && it.situacao !== 'participou') reg.obs = it.situacao;
      dados.registros.push(reg);
      if (rodada(t.id).indexOf(it.alunoId) === -1) rodada(t.id).push(it.alunoId);
      // estava na sala: se tinha falta marcada hoje, ela sai
      var k = faltas.indexOf(it.alunoId);
      if (ehHoje && k !== -1) faltas.splice(k, 1);
      n.registros++;
    } else if (it.tipo === 'falta') {
      if (ehHoje && faltas.indexOf(it.alunoId) === -1) faltas.push(it.alunoId);
      n.faltas++;
    }
  });
  return n;
}

function avisarHub(n) {
  var partes = [];
  if (n.registros) partes.push(n.registros + (n.registros === 1 ? ' registro' : ' registros'));
  if (n.faltas) partes.push(n.faltas + (n.faltas === 1 ? ' falta' : ' faltas'));
  var texto = partes.length ? 'Da página de questões: ' + partes.join(' e ') + ' lançados nas notas.' : '';
  var estrutura = [];
  if (n.turmas) estrutura.push(n.turmas + (n.turmas === 1 ? ' turma nova' : ' turmas novas'));
  if (n.alunos) estrutura.push(n.alunos + (n.alunos === 1 ? ' aluno novo' : ' alunos novos'));
  if (estrutura.length) texto += (texto ? ' ' : '') + 'Do hub: ' + estrutura.join(' e ') + '.';
  var el = $('#avisoHub');
  el.textContent = texto;
  el.classList.remove('oculto');
  clearTimeout(avisarHub.timer);
  avisarHub.timer = setTimeout(function () { el.classList.add('oculto'); }, 7000);
}

function mostrarEstadoHub() {
  var el = $('#estadoHub');
  if (!el) return;
  if (!hub.codigo) el.textContent = 'Desligado.';
  else if (hub.erro === 'codigo') el.textContent = 'O código não confere. Confira e salve de novo.';
  else if (hub.erro === 'rede') el.textContent = 'Ligado, mas sem internet agora. Tudo continua guardado aqui e segue quando a conexão voltar.';
  else if (hub.ultimoEnvio) el.textContent = 'Ligado. Turmas atualizadas às ' +
    String(hub.ultimoEnvio.getHours()).padStart(2, '0') + ':' + String(hub.ultimoEnvio.getMinutes()).padStart(2, '0') + '.';
  else el.textContent = 'Ligado.';
}

function salvarCodigoHub() {
  var codigo = $('#campoCodigoHub').value.trim().toLowerCase();
  var el = $('#estadoHub');
  if (!codigo) {
    try { localStorage.removeItem(CHAVE_HUB); } catch (e) {}
    hub.codigo = ''; hub.erro = null; hub.ultimoEnvio = null;
    mostrarEstadoHub();
    return;
  }
  el.textContent = 'Conferindo…';
  hubPedir('GET', '/api/ping', null, codigo).then(function () {
    try { localStorage.setItem(CHAVE_HUB, codigo); } catch (e) {}
    hub.codigo = codigo; hub.erro = null;
    enviarEstadoHub();
    receberHub();
  }).catch(function (e) {
    el.textContent = e.codigo ? 'O código não confere.' : 'Sem internet agora. Tente de novo com conexão.';
  });
}

function ligarHub() {
  $('#btnCodigoHub').addEventListener('click', salvarCodigoHub);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') receberHub();
  });
  window.addEventListener('online', function () { receberHub(); agendarEnvioHub(); });
  setInterval(function () {
    if (document.visibilityState === 'visible') receberHub();
  }, 60000);
  if (hub.codigo) { receberHub(); enviarEstadoHub(); }
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
ligarHub();
irPara('sortear');
abrirVistoPeloEndereco();
prepararOffline();

})();
