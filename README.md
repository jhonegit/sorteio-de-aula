# Sorteio de alunos

Sorteia um aluno da turma durante a aula e registra o que aconteceu: respondeu
certo, respondeu mas errou, disse que não sabe, se recusou a responder, ou faltou.

Funciona no celular, instalado como aplicativo, e abre sem internet.

## Como funciona

- O sorteio não repete: um aluno só volta a ser sorteado depois que a turma
  inteira passou. Quando todos passam, a rodada recomeça sozinha.
- Dá para chamar alguém fora do sorteio, para quem se oferece. A busca acha o
  nome pelo som: "cami" encontra "Kamila". Quem é chamado assim conta como se
  tivesse caído no sorteio e só volta a ser sorteável na rodada seguinte.
- Quem se oferece ganha o selo 🔥 com a contagem, na lista de notas e no
  projetor. É só reconhecimento: a nota não muda por causa dele. Serve para o
  aluno que participa muito ser visto, já que a média não distingue quem
  acertou 5 de quem acertou 15.
- Sorteou sem querer? Com o nome na tela ainda dá para cancelar, ou trocar
  direto por quem se ofereceu. Nada é registrado e ninguém gasta a vez, porque o
  aluno só entra na lista de "já caíram" quando um resultado é registrado.
- Cada turma tem a própria rodada. Trocar de turma no meio do dia não atrapalha:
  cada uma continua de onde parou.
- Quem faltou sai do sorteio daquele dia e não gasta a vez dele na rodada.
  No dia seguinte volta sozinho.
- A nota de cada aluno é a média dos pontos dele multiplicada por 10, então
  quem caiu mais vezes não é prejudicado nem beneficiado.
- Pergunta mais difícil pode valer o dobro: em vez de tocar no botão do
  resultado, segurar ele por 1 segundo. O botão vai enchendo de dourado, treme,
  estoura em fumaça no fim e aquela resposta conta como duas participações na
  média. Toque rápido segue valendo o normal.
- Atividade fora do sorteio: em Turmas dá para lançar uma de uma vez para a
  turma inteira, marcando quem fez, quem fez em parte e quem faltou. Quem não
  for marcado entra como "não fez": vale zero, mas fica registrado que teve a
  chance. A atividade pode valer ×1, ×2 ou ×3, cai na mesma nota do sorteio e
  não gasta a vez de ninguém na rodada. O lançamento inteiro pode ser desfeito.
- Modo projetor: o 📽 na tela de Notas põe a lista em tela cheia, com letra
  grande, legenda dos símbolos e as duas ordens (ranking ou A a Z). Por padrão
  só aparece quem está acima de 6, e o corte muda ali na hora (todos, 5+, 6+,
  7+, 8+), então ninguém é exposto no telão. O tamanho da letra tem − A + e
  fica guardado. Não altera nada: só mostra.
- Quanto vale cada resultado é ajustável dentro do app, em Ajustes. Os mesmos
  valores servem para as atividades: fez vale o de "respondeu certo", fez em
  parte o de "errou", não fez o de "se recusou".
- Confete no acerto, vibração e sequência de acertos da turma. Dá para desligar
  tudo isso em Ajustes se o dia pedir algo mais discreto.

## Onde ficam os dados

Tudo é guardado no próprio aparelho. Nenhum nome de aluno está no código e nada
é enviado para a internet.

Em Ajustes há três downloads: o backup completo (para restaurar depois), a
planilha de notas e a planilha de registros.

Limpar os dados do navegador apaga tudo. Baixar o backup de vez em quando
resolve.

## Instalar no celular

Abrir o endereço no Chrome, tocar no menu de três pontinhos e escolher
"Instalar aplicativo".

## Mexer no código

São quatro arquivos: `index.html`, `styles.css`, `app.js` e `sw.js`.
Ao alterar qualquer um deles, trocar o número em `var CACHE = 'sorteio-v1'`
dentro do `sw.js`, senão o celular continua abrindo a versão antiga.
