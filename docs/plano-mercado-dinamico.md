# Plano — Mercado dinâmico da IA (2 janelas/ano)

> Objetivo: acabar com o universo "parado". Times ricos brigam por destaques,
> pequenos vendem para se reforçar em profundidade, e o algoritmo premia quem
> **negocia bem** — não sempre os mesmos campeões. Novos clubes devem surgir
> fortes e conseguir resultados.

Status: **implementado em 2026-07-14** (`src/game/transferWindow.ts`). Decisões
fechadas: caixa **efêmero (B)**; índice de gestão **derivado do técnico**;
janela do meio **faz propostas** pelos craques do usuário (aceita/recusa);
vendas ao **exterior** habilitadas; elencos da IA em 18–25; bônus de confiança
em campo pela reputação do técnico (IA de jogo mais dura).

---

## 1. Diagnóstico do que existe hoje

- **Uma única movimentação por ano**, na entressafra: `aiOffseasonTransfers`
  ([seeder.ts:459](../src/game/seeder.ts#L459)), chamada em
  [store.ts:689](../src/store.ts#L689).
- É **permuta seca** (1-por-1, sem dinheiro): o comprador pega um reserva melhor
  de outro clube e manda seu titular mais fraco no lugar. Elencos nunca mudam de
  tamanho.
- **A IA não tem caixa.** Só existe `baseBudget` (estático, define porte/força-alvo
  e receitas). O caixa dinâmico (`budget`) é só do usuário.
- Só ~60% dos clubes se mexem por ano, e cada um faz **um** movimento, mirando
  apenas o setor mais fraco.
- Resultado: força relativa dos clubes fica **congelada**; só muda por
  envelhecimento/aposentadoria ([processSeasonTransitions](../src/game/seeder.ts#L534)).
- **Reservas fracos**: `makePlayer` gera o elenco com dispersão em torno da
  força-alvo do clube ([seeder.ts:139](../src/game/seeder.ts#L139)); os reservas
  ficam bem abaixo dos titulares e nunca são reforçados. Daí a sensação de
  "titular bom, banco fraco" que você notou.

### Modelo econômico atual (para calibrar)
- `playerValue` = `strength² × 1600 × ageFactor` — curva quadrática: topo é caro
  ([seeder.ts:111](../src/game/seeder.ts#L111)).
- `playerSalary` = `0.6%` do valor/semana ([seeder.ts:122](../src/game/seeder.ts#L122)).
- `seasonRevenue` = `25%` do baseBudget ([store.ts:214](../src/store.ts#L214)).
- `matchdayRevenue` (bilheteria) = `1.5%` do baseBudget/jogo em casa.
- Força-alvo: Série A 27–40, Série B 15–25 ([seeder.ts:86](../src/game/seeder.ts#L86)).

---

## 2. Princípios de design (o que você pediu)

1. **Duas janelas por temporada** — uma no meio, uma na entressafra.
2. **Dinheiro de verdade**: cada clube da IA ganha um **caixa** próprio; compra
   debita, venda credita.
3. **Ricos caçam destaques**; **pequenos vendem craques** para reforçar a
   **profundidade** (vários reservas decentes em vez de um titular caro).
4. **Mérito de gestão**: o algoritmo deve **recompensar boas vendas/compras** —
   um clube pequeno que vende bem e reinveste sobe de nível ao longo das
   temporadas. Isso quebra a hegemonia dos ricos.
5. **Rotatividade de campeões**: introduzir variância e "ciclos" de clubes para
   que os vencedores mudem entre temporadas.
6. **Profundidade de elenco**: elencos passam a ter reservas à altura; o mercado
   deve preencher buracos de banco, não só o XI titular.

---

## 3. Arquitetura proposta

### 3.1 Caixa dinâmico da IA (fundação)
Hoje a IA não tem `budget`. Duas opções:

- **(A) Adicionar `cash` a cada Club** (persistido no save): inicializa em
  ~`seasonRevenue(baseBudget)`, cresce com receitas/vendas, cai com
  compras/salários. É o mais fiel, mas exige migração de saves e um "orçamento
  operacional" por clube.
- **(B) Caixa efêmero por janela**: no momento da janela, cada clube recebe um
  "poder de compra" = função do `baseBudget` + saldo de vendas da janela. Não
  persiste entre janelas. Bem mais simples, sem migração de save.

**Recomendação:** começar com **(B)** para validar a dinâmica rápido; migrar para
**(A)** depois se quisermos que gestão ruim leve clube à decadência financeira.
→ *decisão a refinar (ver §6).*

### 3.2 A janela do meio da temporada
- Encaixar na virada do turno para o returno. Com 38 rodadas, o meio é a
  **rodada 19 → 20**. Em semana de calendário, é o fim da rodada 19 da liga
  ([weekInfo](../src/game/cup.ts#L95) devolve `type:"league", round`).
- Gatilho: no avanço de semana, quando concluímos a rodada de liga 19, roda o
  `runTransferWindow("mid")` antes de montar a rodada 20.
- A janela da entressafra reusa o mesmo motor com `runTransferWindow("offseason")`,
  substituindo o atual `aiOffseasonTransfers`.

### 3.3 Motor de mercado `runTransferWindow(phase)`
Substitui a permuta seca por um mercado com dinheiro em **rodadas de pregão**:

1. **Avaliar necessidades** de cada clube:
   - buraco no XI titular (setor com pior média — como hoje);
   - **profundidade**: setor cujo *melhor reserva* está muito abaixo do titular
     (novo — resolve o "banco fraco");
   - excesso: setor com titulares sobrando (candidatos a venda).
2. **Lista de vendas**: cada clube põe à venda quem sobra e/ou craques que não
   pode segurar (clube pequeno prioriza vender caro; clube em crise financeira
   vende para equilibrar caixa). Preço-pedido reusa `askingPrice`
   ([market.ts:68](../src/game/market.ts#L68)).
3. **Ordem de compra**: clubes ordenados por **poder de compra** (não só
   baseBudget) — assim um pequeno que vendeu bem passa à frente de um rico
   parado. **Este é o coração do "privilegiar quem sabe negociar".**
4. **Casamento comprador↔alvo**: comprador escolhe o alvo que mais melhora seu
   elenco dentro do caixa; paga; jogador troca de clube; caixa dos dois ajusta.
5. **Sem permuta obrigatória**: elencos variam de tamanho dentro de
   `[MIN_SQUAD, MAX_SQUAD]`. Quem vende demais precisa repor (comprando barato ou
   promovendo/gerando base).
6. **Reposição por base**: buracos que o mercado não preenche viram jogador da
   base gerado (`makePlayer(..., young)`), garantindo tamanho mínimo de elenco.

### 3.4 "Privilegiar quem sabe vender e comprar"
Mecanismos concretos para o mérito de gestão emergir:
- **Lucro de revenda vira poder de compra**: vender acima do valor de mercado
  gera caixa extra proporcional ao lucro → reinveste em mais peças.
- **Eficiência por ponto de força**: a IA compradora prefere o alvo com melhor
  *força ganha por real gasto*, não o mais caro — clubes que compram com esse
  critério sobem de nível organicamente.
- **Scout/acerto variável**: cada clube tem um "índice de gestão" (poderia
  derivar do técnico via [managers.ts](../src/game/managers.ts)) que enviesa a
  qualidade das decisões — uns acertam mais que outros, criando divergência.
  → *decisão a refinar: atrelar ao técnico ou sortear por clube?*

### 3.5 Rotatividade de campeões / anti-hegemonia
- **Regressão à média**: clubes muito acima da força-alvo da divisão "perdem"
  peças (venda tentadora que aceitam) na janela; clubes abaixo têm bônus de
  acerto. Mantém a liga competitiva sem randomizar cegamente.
- **Ciclos**: um clube que ganha muito atrai propostas grandes por seus craques
  (de clubes ricos e do exterior/continental), e às vezes vende — abrindo espaço
  para novos campeões.
- **Novos clubes fortes**: promovidos da B/C podem receber um "aporte de
  chegada" (poder de compra extra na 1ª janela na A) para montarem elenco
  competitivo rápido — combinado com o [[carreira-comeca-de-baixo]], vale
  também para dar cor à disputa entre IAs.

### 3.6 Profundidade de elenco (banco à altura)
- Nova métrica de necessidade: **gap titular×reserva** por setor.
- Na geração inicial e nas reposições, elevar levemente o piso dos reservas
  (menos cauda para baixo em `makePlayer`) para Séries A/B.
- Alvo: todo clube de Série A deve ter pelo menos 1 reserva por setor a ≤ X
  pontos do titular. → *X a definir.*

---

## 4. Notícias e visibilidade

- A janela gera **manchetes de transferência** ("Fulano deixa o Ciclano rumo ao
  Beltrano por $Xм"), no mesmo feed das notícias da rodada
  ([store.ts:177](../src/store.ts#L177)) e/ou no resumo de temporada
  (`seasonNews`, [store.ts:710](../src/store.ts#L710)).
- Destaque para movimentos que envolvem o clube do usuário e para os
  "bombásticos" (craques trocando de time).
- Opcional: uma telinha "Janela de transferências" ao ser disparada no meio da
  temporada, resumindo as principais movimentações da liga do usuário.

---

## 5. Fases de implementação (incremental, cada uma testável)

1. **Fundação econômica**: caixa da IA (opção B efêmera) + refatorar
   `aiOffseasonTransfers` para `runTransferWindow("offseason")` com dinheiro,
   mantendo comportamento parecido. *Sem quebrar saves.*
2. **Compra/venda reais + tamanho de elenco variável** (`MIN/MAX_SQUAD`,
   reposição por base).
3. **Janela do meio de temporada** (gatilho na rodada 19→20) reusando o motor.
4. **Mérito de gestão**: ordenação por poder de compra, lucro de revenda,
   eficiência por real. *Aqui aparece a quebra de hegemonia.*
5. **Profundidade de banco**: métrica de gap titular×reserva + piso de reservas.
6. **Anti-hegemonia/ciclos**: regressão à média, propostas por craques de
   campeões, aporte de chegada para promovidos.
7. **Notícias/UI** da janela.

Cada fase é um commit isolado, verificável no jogo antes de seguir.

---

## 6. Decisões abertas (preciso do seu refino)

1. **Caixa da IA persistente (A) ou efêmero por janela (B)?** Recomendo começar
   em B. Persistente dá decadência financeira real, mas exige migração de save.
2. **Índice de gestão** por **técnico** (usa o carrossel de técnicos existente)
   ou **sorteado por clube**?
3. **Intensidade da regressão à média** — quão agressivo pode ser sem parecer que
   "punimos" o campeão? (ex.: só craques acima da força-alvo ficam "vendáveis".)
4. **Tamanho de elenco**: `MIN/MAX_SQUAD` (ex.: 18–26?).
5. **Escopo geográfico**: só clubes do mesmo país (como hoje,
   [seeder.ts:502](../src/game/seeder.ts#L502)) ou permitir vendas para o
   exterior/continental (esvazia campeões, gera caixa)?
6. **A janela do meio mexe no elenco do usuário?** (Não — só IA — mantendo o
   usuário no controle; mas a IA pode **fazer propostas** pelos craques do
   usuário, que ele aceita/recusa. Vale a pena?)
7. **Quantos movimentos por clube por janela** (hoje 1; subir para N?).

---

## 7. Riscos / cuidados

- **Inflação/deflação**: dinheiro entrando sem sair descontrola valores. O caixa
  efêmero (B) evita isso naturalmente; o persistente (A) precisa de salários
  drenando caixa.
- **Equilíbrio competitivo**: mérito de gestão forte demais pode fazer um clube
  pequeno virar gigante rápido demais — calibrar por temporada.
- **Saves existentes**: opção A quebra saves sem migração; opção B não.
- **Performance**: a janela varre todos os clubes × candidatos; hoje já é O(n²)
  em `aiOffseasonTransfers` e roda 1×/ano. Com 2 janelas e mais lógica, manter
  isso enxuto (pré-indexar por posição).
- Ligação com o [[motor-roadmap]] (química/táticas) — o mercado alimenta os
  elencos que o motor usa.
