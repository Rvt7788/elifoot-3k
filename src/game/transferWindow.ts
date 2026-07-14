import type { Club, Manager, Player, Position } from "../types";
import { chance, pick, randInt, type Rng } from "./rng";
import { canNegotiate } from "./market";
import { freeShirtNumber, makePlayer, playerValue, targetStrength } from "./seeder";

// =============================================================================
// Mercado dinâmico da IA: duas janelas por temporada (meio e entressafra), com
// dinheiro de verdade em vez de permuta seca. Cada clube ganha um poder de
// compra efêmero (função do porte + vendas feitas NA janela), põe à venda quem
// sobra ou quem não consegue segurar, e compra em rodadas de pregão ordenadas
// pelo caixa do momento — quem vende bem passa à frente de rico parado. O
// "índice de gestão" vem do técnico: técnico bom compra por eficiência
// (força ganha por real), técnico ruim compra o nome mais caro que couber.
// Clubes muito acima do nível da divisão atraem propostas do exterior que
// esvaziam campeões e financiam reconstruções — a hegemonia gira.
// =============================================================================

export const MIN_SQUAD_AI = 18;
export const MAX_SQUAD_AI = 25;

const STARTER_NEED: Record<Position, number> = { GOL: 1, DEF: 4, MEI: 4, ATA: 2 };
// piso por posição depois de vender: o clube nunca fica sem elenco jogável
const POS_FLOOR: Record<Position, number> = { GOL: 2, DEF: 5, MEI: 5, ATA: 3 };
const POSITIONS: Position[] = ["GOL", "DEF", "MEI", "ATA"];

export interface WindowHeadline {
  text: string;
  clubId?: string;
}

export interface WindowResult {
  news: WindowHeadline[];
  moves: number; // transferências internas concluídas
  abroad: number; // vendas para o exterior (jogador sai do universo)
}

interface SaleEntry {
  player: Player;
  price: number;
}

const fmtMoney = (v: number): string =>
  v >= 1e6 ? `$${(v / 1e6).toFixed(1).replace(".0", "")}M` : `$${Math.round(v / 1e3)}k`;

// preço pedido na janela: sobe com o tier (clube segura craque mais caro)
function windowPrice(p: Player, premium = 1): number {
  const tierMult = p.tier === "extra" ? 1.6 : p.tier === "craque" ? 1.4 : p.tier === "bom" ? 1.2 : 1.05;
  return Math.round((playerValue(p) * tierMult * premium) / 1000) * 1000;
}

// Roda uma janela de transferências entre os clubes da IA. Muta `players`
// (troca clubId, remove vendidos ao exterior, adiciona garotos da base) e
// devolve as manchetes. O clube do usuário não participa — propostas pelos
// craques dele são tratadas à parte no store (incomingOffer).
export function runTransferWindow(
  rng: Rng,
  phase: "mid" | "offseason",
  players: Player[],
  clubs: Club[],
  managers: Manager[] | undefined,
  userClubId: string,
  promotedIds?: Set<string>,
): WindowResult {
  const clubById = new Map(clubs.map((c) => [c.id, c]));
  const byClub = new Map<string, Player[]>();
  for (const p of players) byClub.set(p.clubId, [...(byClub.get(p.clubId) ?? []), p]);

  // percentil de orçamento por país (mesma régua do seeder) → força-alvo
  const power = new Map<string, number>();
  const byCountry = new Map<string, Club[]>();
  for (const c of clubs) byCountry.set(c.country, [...(byCountry.get(c.country) ?? []), c]);
  for (const list of byCountry.values()) {
    const sorted = [...list].sort((a, b) => a.baseBudget - b.baseBudget);
    sorted.forEach((c, i) => power.set(c.id, sorted.length > 1 ? i / (sorted.length - 1) : 0.5));
  }
  const target = (c: Club) => targetStrength(c.division, power.get(c.id) ?? 0.3);

  // índice de gestão derivado do técnico (reputação 5-99 → 0.2..1)
  const skillByClub = new Map<string, number>();
  for (const m of managers ?? []) {
    if (m.clubId) skillByClub.set(m.clubId, Math.max(0.2, Math.min(1, m.reputation / 99)));
  }
  const skill = (clubId: string) => skillByClub.get(clubId) ?? 0.5;

  const aiClubs = clubs.filter((c) => c.id !== userClubId);
  const squadOf = (id: string) => byClub.get(id) ?? [];
  const posCount = (id: string, pos: Position) => squadOf(id).filter((p) => p.pos === pos).length;

  const starterAvg = (id: string, pos: Position): number => {
    const list = squadOf(id).filter((p) => p.pos === pos).sort((a, b) => b.strength - a.strength);
    const top = list.slice(0, STARTER_NEED[pos]);
    return top.length ? top.reduce((s, p) => s + p.strength, 0) / top.length : 0;
  };
  const xiAvg = (id: string): number => {
    let sum = 0;
    for (const pos of POSITIONS) sum += starterAvg(id, pos) * STARTER_NEED[pos];
    return sum / 11;
  };
  // pode abrir mão deste jogador sem quebrar o elenco?
  const canRelease = (p: Player): boolean =>
    squadOf(p.clubId).length > MIN_SQUAD_AI - 1 && posCount(p.clubId, p.pos) > POS_FLOOR[p.pos];

  // ── poder de compra efêmero: porte × fase × gestão, com aporte de chegada ──
  const cash = new Map<string, number>();
  for (const c of aiClubs) {
    let base = c.baseBudget * (phase === "offseason" ? 0.3 : 0.15);
    base *= 0.8 + skill(c.id) * 0.4; // técnico bom convence a diretoria a investir
    if (phase === "offseason" && promotedIds?.has(c.id)) base *= 1.8; // aporte de chegada na A
    cash.set(c.id, Math.round(base));
  }
  const credit = (id: string, v: number) => cash.set(id, (cash.get(id) ?? 0) + v);
  const debit = (id: string, v: number) => cash.set(id, (cash.get(id) ?? 0) - v);

  const news: WindowHeadline[] = [];
  const bigMoves: { text: string; clubId: string; price: number }[] = [];
  let abroad = 0;
  let moves = 0;

  // ── vendas ao exterior: craques de clubes acima do nível atraem proposta de
  // fora; o clube some com o jogador e entra dinheiro grande (anti-hegemonia) ──
  const abroadChance = phase === "offseason" ? 0.3 : 0.15;
  for (const c of aiClubs) {
    const over = xiAvg(c.id) - target(c);
    const stars = squadOf(c.id)
      .filter((p) => p.strength >= 32 && (p.tier === "craque" || p.tier === "extra" || over > 3))
      .sort((a, b) => b.strength - a.strength);
    const star = stars[0];
    if (!star || !canRelease(star)) continue;
    // quanto mais acima do nível da divisão, mais tentadora fica a proposta
    const pull = abroadChance + Math.max(0, over) * 0.05;
    if (!chance(rng, Math.min(0.6, pull))) continue;
    const fee = Math.round((playerValue(star) * 1.5) / 1000) * 1000;
    byClub.set(c.id, squadOf(c.id).filter((p) => p.id !== star.id));
    players.splice(players.findIndex((p) => p.id === star.id), 1);
    credit(c.id, fee);
    abroad++;
    news.push({
      text: `✈️ ${star.name} deixa o ${c.name} rumo ao exterior por ${fmtMoney(fee)}.`,
      clubId: c.id,
    });
  }

  // ── lista de vendas: sobras de setor, clube pequeno vendendo caro e
  // regressão à média de quem está muito acima do nível ──
  const forSale: SaleEntry[] = [];
  const listed = new Set<string>();
  const list = (p: Player, premium: number) => {
    if (listed.has(p.id)) return;
    listed.add(p.id);
    forSale.push({ player: p, price: windowPrice(p, premium) });
  };
  for (const c of aiClubs) {
    const squad = squadOf(c.id);
    for (const pos of POSITIONS) {
      const ranked = squad.filter((p) => p.pos === pos).sort((a, b) => b.strength - a.strength);
      // sobras: quem está além de titulares + 2 reservas vai para a vitrine
      for (const p of ranked.slice(STARTER_NEED[pos] + 2)) list(p, 1);
    }
    // clube pequeno vende o craque caro para reinvestir em profundidade
    const isSmall = (power.get(c.id) ?? 0.5) < 0.45;
    const best = [...squad].sort((a, b) => b.strength - a.strength)[0];
    if (isSmall && best && best.strength >= target(c) + 5) list(best, 1.35);
    // muito acima do nível da divisão: o destaque fica "vendável" (regressão à média)
    if (best && xiAvg(c.id) > target(c) + 4) list(best, 1.25);
  }

  // ── pregão: rodadas de compra ordenadas pelo poder de compra do MOMENTO ──
  const rounds = phase === "offseason" ? 3 : 2;
  for (let round = 0; round < rounds; round++) {
    const order = [...aiClubs].sort((a, b) => (cash.get(b.id) ?? 0) - (cash.get(a.id) ?? 0));
    for (const buyer of order) {
      const squad = squadOf(buyer.id);
      if (squad.length >= MAX_SQUAD_AI) continue;
      const myCash = cash.get(buyer.id) ?? 0;
      if (myCash <= 0) continue;

      // necessidade: setor titular mais defasado do alvo OU banco muito abaixo do titular
      const needs: { pos: Position; kind: "starter" | "depth"; gap: number }[] = [];
      for (const pos of POSITIONS) {
        const avg = starterAvg(buyer.id, pos);
        needs.push({ pos, kind: "starter", gap: target(buyer) - avg });
        const ranked = squad.filter((p) => p.pos === pos).sort((a, b) => b.strength - a.strength);
        const bestReserve = ranked[STARTER_NEED[pos]];
        needs.push({ pos, kind: "depth", gap: (avg - (bestReserve?.strength ?? 0)) - 6 });
      }
      needs.sort((a, b) => b.gap - a.gap);
      const need = needs[0];
      if (!need || need.gap <= 0) continue;

      const ranked = squad.filter((p) => p.pos === need.pos).sort((a, b) => b.strength - a.strength);
      const floorStr = need.kind === "starter"
        ? (ranked[STARTER_NEED[need.pos] - 1]?.strength ?? 0)
        : (ranked[STARTER_NEED[need.pos]]?.strength ?? 0);

      const options = forSale.filter(({ player: p, price }) => {
        if (p.clubId === buyer.id || p.pos !== need.pos) return false;
        if (price > myCash) return false;
        const seller = clubById.get(p.clubId);
        if (!seller || seller.country !== buyer.country) return false;
        if (!canNegotiate(buyer.division, seller.division)) return false;
        if (!canRelease(p)) return false;
        return p.strength >= floorStr + 2;
      });
      if (options.length === 0) continue;

      // gestão: técnico bom compra eficiência (força ganha por real);
      // técnico fraco compra o nome mais forte que o caixa alcança
      let choice: SaleEntry;
      if (chance(rng, skill(buyer.id))) {
        choice = options.reduce((best, o) =>
          (o.player.strength - floorStr) / o.price > (best.player.strength - floorStr) / best.price
            ? o : best);
      } else {
        const flashy = [...options].sort((a, b) => b.player.strength - a.player.strength).slice(0, 4);
        choice = pick(rng, flashy);
      }

      const { player: signing, price } = choice;
      const seller = clubById.get(signing.clubId)!;
      byClub.set(seller.id, squadOf(seller.id).filter((p) => p.id !== signing.id));
      signing.clubId = buyer.id;
      byClub.set(buyer.id, [...squadOf(buyer.id), signing]);
      signing.number = freeShirtNumber(
        squadOf(buyer.id).filter((p) => p.id !== signing.id), signing.pos,
      );
      debit(buyer.id, price);
      credit(seller.id, price); // lucro da venda vira poder de compra ainda nesta janela
      forSale.splice(forSale.indexOf(choice), 1);
      moves++;
      if (signing.strength >= 28 || price >= 800_000) {
        bigMoves.push({
          text: `💸 ${signing.name} troca o ${seller.name} pelo ${buyer.name} por ${fmtMoney(price)}.`,
          clubId: buyer.id,
          price,
        });
      }
    }
  }

  // ── reposição por base: quem vendeu demais promove garotos até o mínimo ──
  const maxIdNum = new Map<string, number>();
  for (const p of players) {
    const m = p.id.match(/^(.*)_p(\d+)$/);
    if (m) maxIdNum.set(m[1], Math.max(maxIdNum.get(m[1]) ?? 0, parseInt(m[2], 10)));
  }
  for (const c of aiClubs) {
    let guard = 0;
    while (guard++ < 10) {
      const squad = squadOf(c.id);
      const lowPos = POSITIONS.find((pos) => posCount(c.id, pos) < POS_FLOOR[pos]);
      const pos = lowPos ?? (squad.length < MIN_SQUAD_AI
        ? POSITIONS.reduce((a, b) =>
            posCount(c.id, a) - POS_FLOOR[a] < posCount(c.id, b) - POS_FLOOR[b] ? a : b)
        : null);
      if (!pos) break;
      const idNum = (maxIdNum.get(c.id) ?? 0) + 1;
      maxIdNum.set(c.id, idNum);
      const kid = makePlayer(rng, c.id, c.country, pos, target(c), idNum, true);
      kid.number = freeShirtNumber(squad, pos);
      players.push(kid);
      byClub.set(c.id, [...squad, kid]);
    }
  }

  // manchetes: exterior primeiro, depois os negócios mais caros da janela
  bigMoves.sort((a, b) => b.price - a.price);
  for (const m of bigMoves.slice(0, 5)) news.push({ text: m.text, clubId: m.clubId });

  return { news, moves, abroad };
}

// Proposta da janela pelo elenco do usuário: a IA cobiça um destaque e oferece
// acima do valor de mercado. Sorteio pesado pela força ao quadrado — quanto
// melhor o jogador, mais chance de a proposta ser por ele.
export function windowOfferForUser(
  rng: Rng,
  players: Player[],
  clubs: Club[],
  userClubId: string,
): { clubId: string; playerId: string; amount: number } | undefined {
  const userClub = clubs.find((c) => c.id === userClubId);
  if (!userClub) return undefined;
  const squad = players.filter((p) => p.clubId === userClubId);
  if (squad.length <= MIN_SQUAD_AI) return undefined;
  const buyers = clubs.filter(
    (c) => c.id !== userClubId && canNegotiate(c.division, userClub.division),
  );
  if (buyers.length === 0) return undefined;
  const weights = squad.map((p) => p.strength * p.strength);
  const total = weights.reduce((s, w) => s + w, 0);
  let roll = rng() * total;
  let sTarget = squad[0];
  for (let i = 0; i < squad.length; i++) {
    roll -= weights[i];
    if (roll <= 0) { sTarget = squad[i]; break; }
  }
  const buyer = buyers[randInt(rng, 0, buyers.length - 1)];
  // janela aquece o mercado: proposta de 1.15× a 1.6× do valor
  const amount = Math.round((sTarget.value * (1.15 + rng() * 0.45)) / 1000) * 1000;
  return { clubId: buyer.id, playerId: sTarget.id, amount };
}
