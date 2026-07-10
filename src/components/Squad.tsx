import { Fragment, useState } from "react";
import { useStore, MIN_SQUAD, MAX_SQUAD, squadWageBill, renewalCost } from "../store";
import { playerSalary } from "../game/seeder";
import { appAlert, appConfirm } from "./AppDialog";
import { askingPrice } from "../game/market";

const TIER_BADGE: Record<string, string> = {
  bagre: "", bom: "★", craque: "★★", extra: "💎",
};

const TIER_NAME: Record<string, string> = {
  bagre: "Mediano", bom: "Bom ★", craque: "Craque ★★", extra: "Gênio 💎",
};

function playerBirthDate(playerId: string, age: number, currentSeason: number): string {
  let hash = 0;
  for (let i = 0; i < playerId.length; i++) {
    hash = playerId.charCodeAt(i) + ((hash << 5) - hash);
  }
  hash = Math.abs(hash);
  const month = (hash % 12) + 1;
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const day = (hash % daysInMonth[month - 1]) + 1;
  const birthYear = (2025 + currentSeason) - age;
  const dStr = day.toString().padStart(2, "0");
  const mStr = month.toString().padStart(2, "0");
  return `${dStr}/${mStr}/${birthYear}`;
}

export default function Squad() {
  const game = useStore((s) => s.game);
  const releasePlayer = useStore((s) => s.releasePlayer);
  const setPlayerNumber = useStore((s) => s.setPlayerNumber);
  const renewContract = useStore((s) => s.renewContract);
  const sellPlayer = useStore((s) => s.sellPlayer);
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!game) return null;
  const order = { GOL: 0, DEF: 1, MEI: 2, ATA: 3 };
  const squad = game.players
    .filter((p) => p.clubId === game.userClubId)
    .sort((a, b) => order[a.pos] - order[b.pos] || b.strength - a.strength);

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h2 className="mb-1 text-lg font-bold">
        Elenco · Orçamento: ${(game.budget / 1e6).toFixed(1)}M
      </h2>
      <p className="mb-3 text-xs text-zinc-500">
        {squad.length} jogadores (mínimo {MIN_SQUAD}, máximo {MAX_SQUAD}) · Folha
        salarial: ${(squadWageBill(game) / 1e3).toFixed(0)}k por rodada
      </p>
      <div className="w-full select-none">
        {/* Cabeçalho do Grid Flex */}
        <div className="flex w-full border-b border-zinc-700 py-1 uppercase tracking-wide text-zinc-400 text-[9px] min-[375px]:text-[10px] sm:text-[11px] font-semibold">
          <div className="w-[8%] sm:w-[6%] shrink-0 text-center">Nº</div>
          <div className="w-[10%] sm:w-[7%] shrink-0 pl-1 text-center sm:text-left">Pos</div>
          <div className="flex-1 min-w-0 pr-1">Nome</div>
          <div className="w-[8%] sm:w-[6%] shrink-0 text-center">Id.</div>
          <div className="w-[8%] sm:w-[6%] shrink-0 text-center">For.</div>
          <div className="w-[10%] sm:w-[8%] shrink-0 text-center">Ene.</div>
          <div className="hidden sm:block sm:w-[25%] shrink-0 pr-1">Características</div>
          <div className="w-[20%] sm:w-[15%] shrink-0 text-right">Valor</div>
          <div className="w-[16%] sm:w-[12%] shrink-0 text-right">Salário</div>
        </div>

        {/* Linhas do Grid Flex */}
        <div className="flex flex-col">
          {squad.map((p) => (
            <Fragment key={p.id}>
              <div className={`border-b border-zinc-800 ${game.starters.includes(p.id) ? "bg-emerald-950/45 hover:bg-emerald-900/35" : "hover:bg-zinc-900/40"}`}>
                <div
                  onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                  className="flex w-full items-center py-1.5 cursor-pointer text-[2.7vw] min-[350px]:text-[2.9vw] sm:text-xs text-zinc-200"
                >
                  {/* Nº */}
                  <div className="w-[8%] sm:w-[6%] shrink-0 text-center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={p.number}
                      onChange={(e) => {
                        const n = e.target.valueAsNumber;
                        if (!Number.isNaN(n) && n >= 1 && n <= 99) setPlayerNumber(p.id, n);
                      }}
                      className="w-8 sm:w-10 rounded bg-zinc-800 px-0.5 sm:px-1 py-0.5 text-center text-[10px] sm:text-xs"
                    />
                  </div>
                  {/* Pos */}
                  <div className="w-[10%] sm:w-[7%] shrink-0 pl-1 text-center sm:text-left text-zinc-400">{p.pos}</div>
                  {/* Nome */}
                  <div className="flex-1 min-w-0 pr-1 flex flex-wrap items-center gap-x-1 gap-y-0.5">
                    <span className="whitespace-nowrap truncate">
                      {p.name} <span className="text-amber-400">{TIER_BADGE[p.tier]}</span>
                    </span>
                    {p.suspendedLeague && (
                      <span className="whitespace-nowrap rounded bg-red-950 px-1 text-[9px] sm:text-[10px] text-red-400" title="Suspenso na liga: cumpre 1 rodada fora">
                        🟥 susp. liga
                      </span>
                    )}
                    {p.suspendedCup && (
                      <span className="whitespace-nowrap rounded bg-red-950 px-1 text-[9px] sm:text-[10px] text-red-400" title="Suspenso na copa: cumpre 1 partida fora">
                        🟥 susp. copa
                      </span>
                    )}
                    {p.suspendedContinental && (
                      <span className="whitespace-nowrap rounded bg-red-950 px-1 text-[9px] sm:text-[10px] text-red-400" title="Suspenso na continental: cumpre 1 partida fora">
                        🟥 susp. cont
                      </span>
                    )}
                  </div>
                  {/* Idade */}
                  <div className="w-[8%] sm:w-[6%] shrink-0 text-center">{p.age}a</div>
                  {/* Força */}
                  <div className="w-[8%] sm:w-[6%] shrink-0 text-center font-bold">{p.strength}</div>
                  {/* Energia */}
                  <div className={`w-[10%] sm:w-[8%] shrink-0 text-center ${p.energy < 60 ? "text-red-400" : "text-emerald-400"}`}>
                    {p.energy}%
                  </div>
                  {/* Características */}
                  <div className="hidden sm:block sm:w-[25%] shrink-0 text-zinc-400 truncate pr-1">{p.traits.join(", ")}</div>
                  {/* Valor */}
                  <div className="w-[20%] sm:w-[15%] shrink-0 text-right">${(p.value / 1e6).toFixed(2)}M</div>
                  {/* Salário */}
                  <div className="w-[16%] sm:w-[12%] shrink-0 text-right text-zinc-400">${(playerSalary(p) / 1e3).toFixed(1)}k</div>
                </div>
                {expanded === p.id && (
                  <div className="bg-zinc-900/50 px-3 py-2 border-t border-zinc-800">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-zinc-400 sm:grid-cols-4">
                      <p>Nível: <span className="text-zinc-200">{TIER_NAME[p.tier]}</span></p>
                      <p>Pé: <span className="text-zinc-200 capitalize">{p.foot}</span></p>
                      <p className="col-span-2">Nascimento: <span className="text-zinc-200">{playerBirthDate(p.id, p.age, game.season)}</span></p>
                      <p>Gols: <span className="text-zinc-200">{p.goals}</span></p>
                      <p>Assistências: <span className="text-zinc-200">{p.assists}</span></p>
                      <p>Cartões: <span className="text-zinc-200">🟨 {p.yellows} · 🟥 {p.reds}</span></p>
                      <p title="Amarelos acumulados por competição (3 = suspensão)">
                        Amarelos: <span className="text-zinc-200">Liga {p.yellowsLeague} · Copa {p.yellowsCup} · Cont {p.yellowsContinental}</span>
                      </p>
                      <p>Evolução no ano: <span className={p.gained > 0 ? "text-emerald-400" : "text-zinc-200"}>{p.gained > 0 ? `+${p.gained}` : p.gained}</span></p>
                      <p>Treino: <span className="text-zinc-200 capitalize">{p.training}</span></p>
                      <p>Títulos: <span className="text-amber-400">{p.titles ?? 0} 🏆</span></p>
                      <p className="col-span-2 sm:col-span-4 flex items-center gap-2">
                        Contrato:{" "}
                        <span className={(p.contract ?? 1) <= 1 ? "font-bold text-amber-400" : "text-zinc-200"}>
                          {p.contract ?? 1} temporada{(p.contract ?? 1) > 1 ? "s" : ""}
                        </span>
                        {(p.contract ?? 1) < 5 && (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              const cost = renewalCost(p);
                              if (
                                await appConfirm(
                                  `Renovar com ${p.name} por +2 temporadas? Luvas de $${(cost / 1e3).toFixed(0)}k.`,
                                )
                              ) {
                                const r = renewContract(p.id);
                                if (!r.ok) appAlert(r.message);
                              }
                            }}
                            className="rounded bg-emerald-800 px-2 py-0.5 text-[10px] font-semibold text-emerald-100 hover:bg-emerald-700"
                          >
                            Renovar +2 (${(renewalCost(p) / 1e3).toFixed(0)}k)
                          </button>
                        )}
                      </p>
                      <p className="col-span-2 sm:col-span-4">
                        Características:{" "}
                        <span className="text-amber-400">
                          {p.traits.length ? p.traits.join(", ") : "nenhuma"}
                        </span>
                      </p>
                      <p className="col-span-2 sm:col-span-4 flex flex-wrap gap-2">
                        <button
                          disabled={squad.length <= MIN_SQUAD}
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (await appConfirm(`Dispensar ${p.name}? O jogador sai de graça.`))
                              releasePlayer(p.id);
                          }}
                          className="rounded bg-red-950/70 px-3 py-1 text-[11px] font-semibold text-red-400 hover:bg-red-900 disabled:opacity-30"
                          title={
                            squad.length <= MIN_SQUAD
                              ? `Elenco no mínimo de ${MIN_SQUAD}`
                              : "Dispensar jogador: sai de graça para outro clube"
                          }
                        >
                          ✕ Dispensar jogador
                        </button>
                        <button
                          disabled={squad.length <= MIN_SQUAD}
                          onClick={async (e) => {
                            e.stopPropagation();
                            const price = askingPrice(game, p);
                            if (await appConfirm(`Vender ${p.name} por $${(price / 1e6).toFixed(2)}M?`)) {
                              const res = sellPlayer(p.id);
                              if (res.ok) {
                                appAlert(`${p.name} vendido por $${((res.amount ?? 0) / 1e6).toFixed(2)}M.`);
                              } else {
                                appAlert("Não foi possível vender o jogador.");
                              }
                            }
                          }}
                          className="rounded bg-emerald-950/70 px-3 py-1 text-[11px] font-semibold text-emerald-400 hover:bg-emerald-900 disabled:opacity-30"
                          title={
                            squad.length <= MIN_SQUAD
                              ? `Elenco no mínimo de ${MIN_SQUAD}`
                              : `Vender jogador por $${(askingPrice(game, p) / 1e6).toFixed(2)}M`
                          }
                        >
                          $ Vender jogador
                        </button>
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
