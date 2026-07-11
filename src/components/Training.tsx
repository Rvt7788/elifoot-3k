import { useState } from "react";
import { useStore } from "../store";
import type { TrainingIntensity } from "../types";
import { ageFactor, weeklyXp, xpNeeded, RECOVERY, XP_MATCH, XP_TRAINING } from "../game/training";
import { ScrollLock } from "./useLockBodyScroll";

const TIER_BADGE: Record<string, string> = {
  bagre: "", bom: "★", craque: "★★", extra: "💎",
};

const INTENSITIES: TrainingIntensity[] = ["leve", "normal", "pesada"];

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <ScrollLock />
      <div
        className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-5 text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold">Como funciona o treinamento</h3>
          <button onClick={onClose} className="rounded px-2 text-zinc-400 hover:bg-zinc-800">✕</button>
        </div>
        <div className="space-y-3 text-zinc-300">
          <p>
            Todo o elenco acumula XP semana a semana. Ao encher a barra de progresso,
            o jogador ganha <b>+1 de força</b> — até o limite do seu potencial oculto.
          </p>
          <p>
            <b>Jogar vale muito mais:</b> quem entra em campo ganha +{XP_MATCH} XP de
            partida (marcado com ⚽). Reservas evoluem só com o treino, bem mais devagar.
          </p>
          <p>
            <b>Regime individual:</b> cada jogador tem seu ritmo de treino, com um
            trade-off entre evolução e descanso:
          </p>
          <ul className="ml-4 list-disc space-y-1 text-zinc-400">
            <li><b className="text-zinc-200">Leve</b>: +{XP_TRAINING.leve} XP/semana · recupera {Math.round(RECOVERY.leve * 100)}% da energia</li>
            <li><b className="text-zinc-200">Normal</b>: +{XP_TRAINING.normal} XP/semana · recupera {Math.round(RECOVERY.normal * 100)}%</li>
            <li><b className="text-zinc-200">Pesada</b>: +{XP_TRAINING.pesada} XP/semana · recupera {Math.round(RECOVERY.pesada * 100)}% (chega mais cansado à rodada)</li>
          </ul>
          <p>
            <b>Idade:</b> jovens evoluem rápido (▲▲ até 24 anos), adultos em ritmo
            normal (▲) e, a partir dos 30, quase param (▽). Quem atinge o teto mostra
            <b> POTENCIAL MÁXIMO</b> e não evolui mais.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Training() {
  const game = useStore((s) => s.game);
  const lastResults = useStore((s) => s.lastResults);
  const setPlayerTraining = useStore((s) => s.setPlayerTraining);
  const setAllTraining = useStore((s) => s.setAllTraining);
  const [helpOpen, setHelpOpen] = useState(false);
  // último regime aplicado em massa: o clique no cabeçalho cicla leve→normal→pesada
  const [allIntensity, setAllIntensity] = useState<TrainingIntensity>("normal");
  if (!game) return null;

  const order = { GOL: 0, DEF: 1, MEI: 2, ATA: 3 };
  const squad = game.players
    .filter((p) => p.clubId === game.userClubId)
    .sort((a, b) => order[a.pos] - order[b.pos] || b.strength - a.strength);

  // quem entrou em campo na última rodada encerrada (ganhou XP extra de jogo)
  const playedLast = new Set<string>();
  if (lastResults)
    for (const m of lastResults)
      for (const lp of [...m.homeLineup, ...m.awayLineup])
        if (lp.onField || lp.subbedOut || lp.sentOff) playedLast.add(lp.playerId);

  return (
    <div className="mx-auto max-w-2xl p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-lg font-bold">Treinamento</h2>
        <button
          onClick={() => setHelpOpen(true)}
          className="flex h-5 w-5 items-center justify-center rounded-full border border-zinc-600 text-xs text-zinc-400 hover:bg-zinc-800"
          title="Como funciona o treinamento"
        >
          ?
        </button>
      </div>

      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}

      <div className="overflow-x-auto">
      <table className="w-full text-[11px] sm:text-xs">
        <thead>
          <tr className="border-b border-zinc-700 text-left text-[9px] sm:text-[10px] uppercase tracking-wide text-zinc-400">
            <th className="py-1 px-1 text-center">Nº</th>
            <th className="px-1">Pos</th>
            <th className="px-1">Nome</th>
            <th className="hidden px-1 text-center sm:table-cell">Idade</th>
            <th className="px-1 text-center">Força</th>
            <th className="px-1 text-center" title="Força ganha nesta temporada">Evol.</th>
            <th className="w-16 px-1 sm:w-28">Progresso</th>
            <th className="hidden px-1 text-center sm:table-cell" title="Ritmo de evolução pela idade">Ritmo</th>
            <th className="px-1 text-center">
              {/* clicar cicla o regime de TODO o elenco: leve → normal → pesada */}
              <button
                onClick={() => {
                  const next = INTENSITIES[(INTENSITIES.indexOf(allIntensity) + 1) % INTENSITIES.length];
                  setAllIntensity(next);
                  setAllTraining(next);
                }}
                className="uppercase tracking-wide text-zinc-400 hover:text-zinc-200"
                title="Muda o regime de todos os jogadores de uma vez"
              >
                Regime ▾
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {squad.map((p) => {
            const atCap = p.strength >= p.cap;
            const need = xpNeeded(p.strength);
            const pct = atCap ? 100 : Math.min(100, Math.round(((p.xp ?? 0) / need) * 100));
            const training = p.training ?? "normal";
            const weekly = weeklyXp(p, playedLast.has(p.id), training);
            const played = playedLast.has(p.id);
            return (
              <tr key={p.id} className={`border-b border-zinc-800 ${played ? "bg-emerald-950/45 hover:bg-emerald-900/35" : "hover:bg-zinc-900/40"}`}>
                <td className="py-1.5 pr-2 text-center tabular-nums text-zinc-500">{p.number}</td>
                <td className="pr-3 text-zinc-400">{p.pos}</td>
                <td>
                  {p.name} <span className="text-amber-400">{TIER_BADGE[p.tier]}</span>
                </td>
                <td className="hidden text-center sm:table-cell">{p.age}</td>
                <td className="text-center font-bold">{p.strength}</td>
                <td className="text-center">
                  {(p.gained ?? 0) > 0 ? (
                    <span className="rounded bg-emerald-950 px-1.5 text-xs font-bold text-emerald-400">
                      +{p.gained}
                    </span>
                  ) : (
                    <span className="text-zinc-600">—</span>
                  )}
                </td>
                <td>
                  {atCap ? (
                    <span className="text-[10px] font-semibold text-amber-500" title="Atingiu o limite do seu potencial">
                      POTENCIAL MÁXIMO
                    </span>
                  ) : (
                    <div className="h-2 w-full overflow-hidden rounded bg-zinc-800" title={`${p.xp ?? 0}/${need} XP · +${weekly} XP na última semana`}>
                      <div className="h-full rounded bg-emerald-500" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </td>
                <td className="hidden text-center text-xs sm:table-cell">
                  {atCap ? (
                    <span className="text-zinc-600">—</span>
                  ) : ageFactor(p.age) >= 1.3 ? (
                    <span className="text-emerald-400" title="Jovem: evolui rápido">▲▲</span>
                  ) : ageFactor(p.age) >= 1 ? (
                    <span className="text-emerald-600" title="Evolui em ritmo normal">▲</span>
                  ) : (
                    <span className="text-zinc-500" title="Veterano: evolui devagar">▽</span>
                  )}
                </td>
                <td className="pl-2 text-center">
                  <select
                    value={training}
                    onChange={(e) => setPlayerTraining(p.id, e.target.value as TrainingIntensity)}
                    className="rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-[10px] sm:text-xs capitalize"
                  >
                    {INTENSITIES.map((i) => (
                      <option key={i} value={i}>{i}</option>
                    ))}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
