# Declaração de Autoria — Elifoot 3K

**Titular:** Rvt7788 (rafaelvteixeira@gmail.com)
**Obra:** Elifoot 3K — jogo de gerenciamento de futebol (aplicação web)
**Natureza:** programa de computador e base de dados originais
**Licença:** proprietária, todos os direitos reservados (ver `LICENSE`)

---

## 1. Registro de criação

O desenvolvimento está registrado em repositório Git, cujo histórico é
encadeado criptograficamente: cada commit contém o hash do anterior, de modo
que qualquer alteração retroativa invalidaria todos os hashes seguintes.

| Item | Valor |
|---|---|
| Commit inicial | `79073e010eb546c1478501a77c2f911704bfccef` |
| Data do commit inicial | 2026-07-08T20:21:51−03:00 |
| Commit mais recente (nesta declaração) | `8852a833eef1413598cbe30b0f6cc2078908a1bb` |
| Data do commit mais recente | 2026-09-19T05:29:37−03:00 |
| Total de commits | 112 |
| Autor de 100% dos commits | Rvt7788 &lt;rafaelvteixeira@gmail.com&gt; |
| Arquivos versionados | 151 |
| Linhas de código em `src/` | 26.208 |

O histórico completo e verificável encontra-se em `AUTORIA-COMMITS.txt`, e os
hashes de cada arquivo em `AUTORIA-HASHES.txt`.

## 2. Declaração

Declaro, sob as penas da lei, que:

1. Concebi e desenvolvi integralmente o Software acima identificado, sendo
   dele o único autor.
2. O Software é obra original e não reproduz, no todo ou em parte, obra de
   terceiros protegida por direito autoral.
3. O motor de simulação, as regras de jogo, a modelagem de dados, a
   interface e a identidade visual foram por mim criados.
4. Nomes de clubes, competições e atletas eventualmente presentes são
   empregados em caráter meramente referencial, conforme o item 5 da
   `LICENSE`, sem reivindicação de direitos sobre eles.

## 3. Fundamento legal

No Brasil, a proteção ao programa de computador **independe de registro** e
nasce com a criação da obra (Lei nº 9.609/1998, art. 2º, c/c Lei nº
9.610/1998, art. 18). O registro no INPI é facultativo e serve como reforço
probatório, não como condição do direito.

A proteção internacional decorre da Convenção de Berna, da qual o Brasil é
signatário, e alcança os países membros independentemente de formalidade.

## 4. Verificação por terceiros

Para conferir a integridade desta declaração:

```sh
# confirma o histórico e a autoria
git log --format='%H %aI %an <%ae> %s'

# confirma que os arquivos não foram alterados
git ls-files | xargs sha256sum | diff - AUTORIA-HASHES.txt
```

Qualquer divergência indica alteração posterior a esta declaração.

---

_Documento gerado em 2026-09-19 a partir do histórico do repositório._
