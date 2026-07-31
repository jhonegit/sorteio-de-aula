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

var dados = null;
var sorteado = null;     // id do aluno que está na tela
var ultimaAcao = null;   // guarda o que dá pra desfazer
var girando = false;
var ordemNotas = 'nome';
var armazenamentoOk = true;

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

/* ---------- guardar e ler ---------- */

function estruturaVazia() {
  return {
    versao: 1,
    turmaAtiva: null,
    pesos: Object.assign({}, PESOS_PADRAO),
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

function estatisticas(turma) {
  var regs = dados.registros.filter(function (r) { return r.turmaId === turma.id; });
  return turma.alunos.map(function (a) {
    var meus = regs.filter(function (r) { return r.alunoId === a.id; });
    var soma = meus.reduce(function (s, r) {
      var p = dados.pesos[r.resultado];
      return s + (typeof p === 'number' ? p : 0);
    }, 0);
    return {
      aluno: a,
      vezes: meus.length,
      soma: soma,
      nota: meus.length ? (soma / meus.length) * 10 : null,
      registros: meus
    };
  });
}

/* ---------- navegação ---------- */

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
  $('#btnSortear').disabled = false;
}

function renderSortear() {
  var t = turmaAtual();
  $('#nomeTurmaTopo').textContent = t.nome;

  var total = t.alunos.length;
  var jaForam = rodada(t.id).filter(function (id) { return alunoPorId(t, id); }).length;
  var faltaram = ausentes(t.id).filter(function (id) { return alunoPorId(t, id); });

  $('#barraPreenchida').style.width = total ? (jaForam / total * 100) + '%' : '0%';
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
    setTimeout(passo, 40 + 140 * p * p);   // vai desacelerando
  })();
}

function revelar(aluno, rodadaNova) {
  girando = false;
  sorteado = aluno.id;

  var palco = $('#palco');
  palco.classList.remove('girando');
  palco.classList.add('revelado');
  $('#palcoNome').textContent = aluno.nome;
  $('#palcoDica').textContent = rodadaNova
    ? 'rodada nova · todo mundo voltou pro sorteio'
    : 'o que aconteceu?';

  $('#acoesSorteio').classList.add('oculto');
  $('#acoesResultado').classList.remove('oculto');

  if (navigator.vibrate) { try { navigator.vibrate(30); } catch (e) {} }
  if (rodadaNova) salvar();
  renderSortear();
}

function registrar(resultado) {
  if (!sorteado || girando) return;
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
  dados.registros.push(reg);

  if (rodada(t.id).indexOf(aluno.id) === -1) rodada(t.id).push(aluno.id);

  ultimaAcao = {
    tipo: 'registro', registroId: reg.id, turmaId: t.id,
    alunoId: aluno.id, nome: aluno.nome, resultado: resultado
  };
  salvar();

  sorteado = null;
  $('#palco').classList.remove('revelado');
  $('#palcoNome').textContent = aluno.nome;
  $('#palcoDica').textContent = '✓ ' + ROTULOS[resultado] + ' · ' + comSinal(dados.pesos[resultado]);
  $('#acoesResultado').classList.add('oculto');
  $('#acoesSorteio').classList.remove('oculto');
  $('#btnSortear').disabled = false;

  renderSortear();
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
    : ultimaAcao.nome + ': ' + (ROTULOS[ultimaAcao.resultado] || 'registrado');
}

function desfazer() {
  if (!ultimaAcao) return;
  var a = ultimaAcao;

  if (a.tipo === 'registro') {
    dados.registros = dados.registros.filter(function (r) { return r.id !== a.registroId; });
    // volta o aluno pro sorteio: como ele não podia ter caído duas vezes
    // na mesma rodada, tirá-lo da lista de "já caíram" é sempre correto
    var r = rodada(a.turmaId);
    var pos = r.indexOf(a.alunoId);
    if (pos !== -1) r.splice(pos, 1);
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
  $('#nomeTurmaTopo').textContent = t.nome;

  var caixa = $('#listaNotas');
  caixa.textContent = '';

  var linhas = estatisticas(t);

  if (!linhas.length) {
    caixa.appendChild(cria('p', 'vazio', 'Nenhum aluno cadastrado nesta turma.'));
    return;
  }

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
    b.appendChild(cria('span', 'nome', l.aluno.nome));
    b.appendChild(cria('span', 'vezes', l.vezes === 1 ? '1 vez' : l.vezes + ' vezes'));
    b.appendChild(cria('span', l.nota === null ? 'nota vazia' : 'nota',
                       l.nota === null ? '—' : num(l.nota)));
    b.addEventListener('click', function () { abrirAluno(l.aluno.id); });
    caixa.appendChild(b);
  });
}

function abrirAluno(alunoId) {
  var t = turmaAtual();
  var aluno = alunoPorId(t, alunoId);
  if (!aluno) return;

  var stat = estatisticas(t).filter(function (s) { return s.aluno.id === alunoId; })[0];

  $('#dlgAlunoNome').textContent = aluno.nome;

  var contagem = { certo: 0, errou: 0, naoSabe: 0, recusou: 0 };
  stat.registros.forEach(function (r) { if (contagem[r.resultado] !== undefined) contagem[r.resultado]++; });

  var partes = [];
  Object.keys(contagem).forEach(function (k) {
    if (contagem[k]) partes.push(contagem[k] + ' × ' + ROTULOS[k].toLowerCase());
  });

  $('#dlgAlunoResumo').textContent = stat.vezes
    ? 'Nota ' + num(stat.nota) + ' · ' + stat.vezes + ' sorteios · ' + partes.join(', ')
    : 'Ainda não foi sorteado nenhuma vez.';

  var hist = $('#dlgAlunoHistorico');
  hist.textContent = '';

  stat.registros
    .slice()
    .sort(function (a, b) { return String(b.data).localeCompare(String(a.data)); })
    .forEach(function (r) {
      var linha = cria('div', 'item-hist');
      linha.appendChild(cria('span', 'data', dataCurta(r.data)));

      var sel = document.createElement('select');
      Object.keys(ROTULOS).forEach(function (k) {
        var op = document.createElement('option');
        op.value = k;
        op.textContent = ROTULOS[k] + ' (' + comSinal(dados.pesos[k]) + ')';
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
  $('#nomeTurmaTopo').textContent = t.nome;

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
  $('#nomeTurmaTopo').textContent = turmaAtual().nome;
  Object.keys(PESOS_PADRAO).forEach(function (k) {
    $('#peso-' + k).value = String(dados.pesos[k]).replace('.', ',');
  });
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
  var linhas = [['Aluno', 'Sorteios', 'Certo', 'Errou', 'Nao sabe', 'Recusou', 'Pontos', 'Nota (0 a 10)']];

  estatisticas(t)
    .sort(function (a, b) { return a.aluno.nome.localeCompare(b.aluno.nome, 'pt-BR'); })
    .forEach(function (s) {
      var c = { certo: 0, errou: 0, naoSabe: 0, recusou: 0 };
      s.registros.forEach(function (r) { if (c[r.resultado] !== undefined) c[r.resultado]++; });
      linhas.push([
        s.aluno.nome, s.vezes, c.certo, c.errou, c.naoSabe, c.recusou,
        num(s.soma), s.nota === null ? '' : num(s.nota)
      ]);
    });

  baixar(nomeArquivo('notas-' + normalizar(t.nome).replace(/[^a-z0-9]+/g, '-'), 'csv'),
         csv(linhas), 'text/csv;charset=utf-8');
}

function exportarRegistros() {
  var t = turmaAtual();
  var linhas = [['Data', 'Hora', 'Aluno', 'Resultado', 'Pontos']];

  dados.registros
    .filter(function (r) { return r.turmaId === t.id; })
    .sort(function (a, b) { return String(a.data).localeCompare(String(b.data)); })
    .forEach(function (r) {
      var aluno = alunoPorId(t, r.alunoId);
      var d = new Date(r.data);
      linhas.push([
        isNaN(d) ? '' : d.toLocaleDateString('pt-BR'),
        isNaN(d) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        aluno ? aluno.nome : '(aluno removido)',
        ROTULOS[r.resultado] || r.resultado,
        num(dados.pesos[r.resultado] || 0)
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
  if (!dados.turmas.length) dados.turmas.push({ id: novoId(), nome: 'Turma 1', alunos: [] });
  if (!turmaAtual()) dados.turmaAtiva = dados.turmas[0].id;
  ultimaAcao = null;
  sorteado = null;
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
    b.addEventListener('click', function () { registrar(b.dataset.res); });
  });

  $('#btnFaltou').addEventListener('click', marcarFalta);
  $('#btnDesfazer').addEventListener('click', desfazer);

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
      dados.pesos[k] = Math.round(v * 100) / 100;
      e.target.value = String(dados.pesos[k]).replace('.', ',');
      salvar();
    });
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
