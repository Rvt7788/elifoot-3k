import { Fragment, useState } from "react";
import { useStore, MIN_SQUAD, MAX_SQUAD, squadWageBill, renewalCost } from "../store";
import { playerSalary } from "../game/seeder";
import { appAlert, appConfirm } from "./AppDialog";

const TIER_BADGE: Record<string, string> = {
  bagre: "", bom: "★", craque: "★★", extra: "💎",
};

const TIER_NAME: Record<string, string> = {
  bagre: "Mediano", bom: "Bom ★", craque: "Craque ★★", extra: "Gênio 💎",
};

export default function Squad() {
  const game = useStore((s) => s.game);
  const releasePlayer = useStore((s) => s.releasePlayer);
  const setPlayerNumber = useStore((s) => s.setPlayerNumber);
  const renewContract = useStore((s) => s.renewContract);
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!game) return null;
  const order = { GOL: 0, DEF: 1, MEI: 2, ATA: 3 };
  const squad = game.players
    .filter((p) => p.clubId === game.userClubId)
    .sort((a, b) => order[a.pos] - order[b.pos] || b.strength - a.strength);

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h2 className="mb-1 text-lg font-bold">
        Elenco · Orçamento: €{(game.budget / 1e6).toFixed(1)}M
      </h2>
      <p className="mb-3 text-xs text-zinc-500">
        {squad.length} jogadores (mínimo {MIN_SQUAD}, máximo {MAX_SQUAD}) · Folha
        salarial: €{(squadWageBill(game) / 1e3).toFixed(0)}k por rodada
      </p>
      <div className="overflow-x-auto">
      <table className="w-full text-[11px] sm:text-xs">
        <thead>
          <tr className="border-b border-zinc-700 text-left text-[9px] sm:text-[10px] uppercase tracking-wide text-zinc-400">
            <th className="py-1 px-1 text-center">Nº</th>
            <th className="px-1">Pos</th>
            <th className="px-1">Nome</th>
            <th className="px-1 text-center">Idade</th>
            <th className="px-1 text-center">Força</th>
            <th className="px-1 text-center">Energia</th>
            <th className="hidden px-1 sm:table-cell">Características</th>
            <th className="px-1 text-right">Valor</th>
            <th className="px-1 text-right">Salário</th>
          </tr>
        </thead>
        <tbody>
          {squad.map((p) => (
            <Fragment key={p.id}>
            <tr
              onClick={() => setExpanded(expanded === p.id ? null : p.id)}
              className={`cursor-pointer border-b border-zinc-800 ${expanded === p.id ? "bg-zinc-900/70" : "hover:bg-zinc-900/40"}`}
            >
              <td className="py-1 pr-2 text-center" onClick={(e) => e.stopPropagation()}>
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
              </td>
              <td className="pr-3 text-zinc-400">{p.pos}</td>
              <td>
                {/* nome + badges: cada badge nunca quebra no meio — se faltar
                    espaço, o badge inteiro desce para a linha de baixo,
                    mantendo o nome alinhado à coluna de posição */}
                <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
                  <span className="whitespace-nowrap">
                    {p.name} <span className="text-amber-400">{TIER_BADGE[p.tier]}</span>
                  </span>
                  {p.suspendedLeague && (
                    <span className="whitespace-nowrap rounded bg-red-950 px-1 text-[10px] text-red-400" title="Suspenso na liga: cumpre 1 rodada fora">
                      🟥 susp. liga
                    </span>
                  )}
                  {p.suspendedCup && (
                    <span className="whitespace-nowrap rounded bg-red-950 px-1 text-[10px] text-red-400" title="Suspenso na copa: cumpre 1 partida fora">
                      🟥 susp. copa
                    </span>
                  )}
                  {p.suspendedContinental && (
                    <span className="whitespace-nowrap rounded bg-red-950 px-1 text-[10px] text-red-400" title="Suspenso na continental: cumpre 1 partida fora">
                      🟥 susp. cont
                    </span>
                  )}
                </div>
              </td>
              <td className="text-center">{p.age}</td>
              <td className="text-center font-bold">{p.strength}</td>
              <td className={`text-center ${p.energy < 60 ? "text-red-400" : "text-emerald-400"}`}>
                {p.energy}%
              </td>
              <td className="hidden text-xs text-zinc-400 sm:table-cell">{p.traits.join(", ")}</td>
              <td className="text-right text-[10px] sm:text-xs">€{(p.value / 1e6).toFixed(2)}M</td>
              <td className="text-right text-[10px] sm:text-xs text-zinc-400">€{(playerSalary(p) / 1e3).toFixed(1)}k</td>
            </tr>
            {expanded === p.id && (
              <tr className="border-b border-zinc-800 bg-zinc-900/50">
                <td colSpan={9} className="px-3 py-2">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-zinc-400 sm:grid-cols-4">
                    <p>Nível: <span className="text-zinc-200">{TIER_NAME[p.tier]}</span></p>
                    <p>Pé: <span className="text-zinc-200 capitalize">{p.foot}</span></p>
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
                                `Renovar com ${p.name} por +2 temporadas? Luvas de €${(cost / 1e3).toFixed(0)}k.`,
                              )
                            ) {
                              const r = renewContract(p.id);
                              if (!r.ok) appAlert(r.message);
                            }
                          }}
                          className="rounded bg-emerald-800 px-2 py-0.5 text-[10px] font-semibold text-emerald-100 hover:bg-emerald-700"
                        >
                          Renovar +2 (€{(renewalCost(p) / 1e3).toFixed(0)}k)
                        </button>
                      )}
                    </p>
                    <p className="col-span-2 sm:col-span-4">
                      Características:{" "}
                      <span className="text-amber-400">
                        {p.traits.length ? p.traits.join(", ") : "nenhuma"}
                      </span>
                    </p>
                    <p className="col-span-2 sm:col-span-4">
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
                    </p>
                  </div>
                </td>
              </tr>
            )}
            </Fragment>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
