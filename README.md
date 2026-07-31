# Sorteio de alunos

Sorteia um aluno da turma durante a aula e registra o que aconteceu: respondeu
certo, respondeu mas errou, disse que não sabe, se recusou a responder, ou faltou.

Funciona no celular, instalado como aplicativo, e abre sem internet.

## Como funciona

- O sorteio não repete: um aluno só volta a ser sorteado depois que a turma
  inteira passou. Quando todos passam, a rodada recomeça sozinha.
- Quem faltou sai do sorteio daquele dia e não gasta a vez dele na rodada.
  No dia seguinte volta sozinho.
- A nota de cada aluno é a média dos pontos dele multiplicada por 10, então
  quem caiu mais vezes não é prejudicado nem beneficiado.
- Quanto vale cada resultado é ajustável dentro do app, em Ajustes.

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
