# Plano: idades reais dos jogadores em rosters.json

## Objetivo

Adicionar a idade real de cada jogador em `src/data/rosters.json`, no formato já
suportado pelo jogo: `"Nome:idade"` (ex.: `"Hulk:39"`). O parser está em
[src/game/seeder.ts](../src/game/seeder.ts) — regex `^(.*):(\d{2})$` — então a
idade deve ter **exatamente 2 dígitos** (16–45 cobre qualquer caso real).
Nomes sem `:idade` continuam funcionando: o seeder sorteia idade 18–34.

## Estado atual (2026-07)

- 3.626 nomes em 320 clubes; **344 já têm idade** (~9.5%).
- **Concluídos (20 clubes)**: toda a Série A do Brasil (Athletico-PR, Atlético-MG,
  Bahia, Botafogo, Corinthians, Criciúma, Cruzeiro, Cuiabá, Flamengo, Fluminense,
  Fortaleza, Grêmio, Internacional, Juventude, Palmeiras, RB Bragantino, Santos,
  São Paulo, Vasco, Vitória).
- **Série B do Brasil (20 clubes)**: cobertura parcial (~54 idades de alta
  confiança, jogadores conhecidos). Vários nomes do levantamento são pouco
  conhecidos/ambíguos e a pesquisa via agentes foi pouco confiável (um chegou a
  confundir a "Série B" fictícia do jogo com a Série B real do Brasileirão
  2025, e outro alucinou resultados). Ficaram sem idade por falta de confiança
  — não foram forçados. Se quiser aumentar a cobertura depois, revisar
  `levantamento_elencos.md` e considerar se os nomes ali batem com uma
  temporada real específica antes de pesquisar mais.
- Checklist de referência: `levantamento_elencos.md` na raiz — os clubes feitos
  estão marcados `[x]` com as idades listadas. **Manter este arquivo em dia.**

## Regras

1. **Data de referência**: idade na temporada 2025/26 (mesma base dos 290 já
   feitos). Se souber só o ano de nascimento, use `2025 − ano`.
2. **Não alterar o nome**: apenas acrescentar `:NN` ao final. Nada de renomear,
   reordenar ou remover jogadores — a ordem das listas importa (o seeder consome
   na ordem).
3. **Jogador não encontrado / ambíguo** (nome genérico tipo "Erick" sem contexto
   suficiente): deixe **sem** idade em vez de chutar. O fallback aleatório do
   seeder cuida disso.
4. Idade sempre com 2 dígitos (um jogador de 9 anos não existe; se achar 15,
   escreva 16... na prática ninguém abaixo de 16 aparece nesses elencos).
5. JSON válido sempre: vírgulas, aspas, sem comentários.

## Ordem de trabalho (batches por liga)

Um batch = uma liga inteira; commit ao fim de cada batch. Ordem sugerida
(jogáveis primeiro, convidados por último):

1. Brasil Série B (20 clubes)
2. Inglaterra A e B (`ligainglaterra.json` como referência de quem são os clubes)
3. Espanha A e B
4. Itália A e B
5. Alemanha A e B
6. França A e B
7. Portugal A e B
8. Argentina A e B
9. Convidados continentais (`src/data/continental-guests.json` — clubes que só
   existem na copa; conferir se têm entrada em rosters.json)

## Método (importante — como a Série A foi feita)

**Use primeiro o seu próprio conhecimento, sem web.** Os elencos são de
jogadores reais da temporada 2025/26, quase todos conhecidos — foi assim que a
Série A do Brasil inteira foi preenchida. O fluxo por clube é:

1. Percorra a lista do clube e anote de memória o ano de nascimento de todos os
   jogadores que você conhece com confiança → `idade = 2025 − ano`.
2. Só os que sobrarem (desconhecidos ou incertos) entram numa fila de dúvidas.
3. **No máximo 1 busca na web por clube** (a página do elenco no
   Wikipedia/Transfermarkt resolve a fila inteira de uma vez). **Nunca** faça uma
   busca por jogador individual.
4. Se mesmo assim restar dúvida, deixe o nome sem idade (regra 3 acima) e siga
   em frente. Cobertura de ~90% por clube é sucesso; 100% não é a meta.

Edite o JSON em lotes (um clube inteiro por edição), não linha a linha.

## Validação (rodar após cada batch)

```bash
node -e "
const r = require('./src/data/rosters.json');
let names = 0, withAge = 0, bad = [];
for (const [club, byPos] of Object.entries(r))
  for (const list of Object.values(byPos))
    for (const n of list) {
      names++;
      const m = n.match(/:(\d{2})$/);
      if (m) { withAge++; const a = +m[1]; if (a < 16 || a > 45) bad.push(club + ': ' + n); }
      else if (/:/.test(n)) bad.push(club + ': ' + n); // ':' sem 2 dígitos = formato quebrado
    }
console.log('nomes:', names, '· com idade:', withAge, '· inválidos:', bad.length);
if (bad.length) console.log(bad.join('\n'));
"
```

Critérios: JSON parseia, zero inválidos, contagem `com idade` só cresce, e
`npx tsc --noEmit && npx vite build` continua passando (não deve ser afetado).

## Fora de escopo

- Não mexer em `makePlayer`/seeder — o suporte a `:idade` já existe.
- Não adicionar jogadores novos nem corrigir grafias (isso é outro trabalho).
- `value` e `salary` derivam da idade automaticamente; nada a fazer.
