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
- No ranking, a nota manda: quem tem 10 nunca aparece abaixo de quem tem 9.
  Entre os que empatam, sobe quem participou mais; empatando de novo, quem
  mais se ofereceu. É só a ordem da lista: nenhuma nota muda por causa disso.
- Vários alunos de uma vez: quando meia turma levanta a mão, dá para juntar os
  nomes na busca e lançar todos de um golpe, cada um com o resultado dele. No
  mesmo lugar dá para sortear de 2 a 6 alunos em vez de escolher. O atalho
  "Todos" marca a lista inteira com um toque, e quem ficar sem marca não é
  lançado nem gasta a vez. Quem foi escolhido por vontade própria leva o 🔥;
  quem saiu no sorteio, não.
- Aluno sorteado que não está na sala: o ↻ na linha dele marca a falta do dia,
  tira ele do grupo e sorteia outro no lugar, sem parar a aula. Serve no
  "vários de uma vez" e na pergunta para o grupo.
- Começar um novo período: em Turmas, o botão 🔄 zera as notas da turma para um
  bimestre, uma disciplina ou uma prova nova. Nada é apagado: o que já foi
  registrado fica guardado no período que termina, e volta na tela de Notas
  quando você escolher ele na lista do alto. A janela lembra de baixar o backup
  antes e tem o botão ali mesmo. Enquanto o período novo estiver vazio, dá para
  voltar atrás. A rodada do sorteio e as faltas do dia recomeçam junto.
- Pergunta para o grupo: sorteia até 5 de uma vez para a mesma questão de
  múltipla escolha. Marque a letra que cada um respondeu, marque a resposta
  certa e lance tudo junto: quem bateu leva "respondeu certo", o resto leva
  "respondeu, mas errou". Quem ficar sem letra entra como quem errou, porque
  gastou a vez do mesmo jeito. A pergunta pode valer ×1, ×2 ou ×3, e o grupo
  inteiro pode ser desfeito no botão de sempre. Todos gastam a vez na rodada;
  se ela acabar no meio do grupo, recomeça ali mesmo.
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

## Visto no caderno

Toque em 📷, aponte a câmera para o QR da pessoa e marque Completo (1,0) ou
Metade (0,7). O visto é salvo na hora; ao encerrar, dá para lançar zero para
quem ficou sem visto e não faltou. Os adesivos novos usam
`https://jhonegit.github.io/sorteio-de-aula/#p=<pessoa>`. O código `pessoa` é
um identificador compartilhado pela mesma pessoa nas turmas, com 10 letras ou
números minúsculos; assim, o QR não depende do id local do aluno. O formato
antigo `#v=<id-do-aluno>` continua aceito, assim como `#p=`, `p=`, `#v=`, `v=` e
somente o id. Se a pessoa estiver em mais de uma turma e nenhuma delas for a
turma ativa, escolha a turma no cartão. Essa escolha vale para a sessão do visto
quando o mesmo QR aparecer de novo com a mesma combinação de turmas.

Antes de marcar, escolha de 1 a 5 atividades; o contador soma os registros, e
uma nova marcação para a mesma pessoa substitui o grupo anterior, que pode ser
desfeito inteiro.

## Onde ficam os dados

Tudo é guardado no próprio aparelho. Nenhum nome de aluno está no código e nada
é enviado para a internet.

Em Ajustes há três downloads: o backup completo (para restaurar depois), a
planilha de notas e a planilha de registros. Todo arquivo baixado leva o nome
da turma, a data e a hora, então um download nunca cobre o outro. O backup é
sempre de todas as turmas e de todos os períodos; o nome da turma serve só para
achar o arquivo. As duas planilhas saem do período que estiver escolhido na
tela de Notas, e o nome do período entra no nome do arquivo.

Para mostrar na sala sem copiar nada, ligue o próprio celular no projetor
(adaptador USB-C para HDMI, ou espelhamento na TV) e use o 📽 da tela de Notas.
Para usar o computador da sala, baixe o backup no celular, mande o arquivo
para você mesmo e restaure no computador. Restaurar substitui o que estiver
guardado lá, e os dois aparelhos não se conversam depois: registre sempre no
mesmo.

Limpar os dados do navegador apaga tudo. Baixar o backup de vez em quando
resolve.

## Página de questões

Com o código de acesso salvo em Ajustes, o app manda uma cópia dos dados para
o servidor do hub (`hub-escola.drakefrosst.workers.dev`, outro projeto, com
banco D1 no Cloudflare) e, sempre que abre, busca o que foi marcado na página
de questões e lança nas notas: participou e acertou vale "respondeu certo",
participou e errou vale "errou", não quis, dormindo e fora da sala valem
"se recusou", e faltou marca a falta do dia. Cada lançamento tem id fixo, então
abrir o app duas vezes não duplica, e uma correção feita na página substitui o
lançamento anterior. Sem o código, nada disso roda e o app segue só no aparelho.
O hub também pode enviar turmas e alunos do iSEduc para acrescentar ou atualizar
a lista local, mantendo os registros existentes.

## Instalar no celular

Abrir o endereço no Chrome, tocar no menu de três pontinhos e escolher
"Instalar aplicativo".

## Mexer no código

São quatro arquivos: `index.html`, `styles.css`, `app.js` e `sw.js`.
Ao alterar qualquer um deles, trocar o número em `var CACHE = 'sorteio-v1'`
dentro do `sw.js`, senão o celular continua abrindo a versão antiga.
