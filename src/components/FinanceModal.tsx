import { useStore, squadWageBill, stadiumUpgradeCost, tvQuota, stadiumCapacity, STADIUM_MAX_LEVEL, STADIUM_SEATS_PER_LEVEL } from "../store";
import { appAlert } from "./AppDialog";
import { ScrollLock } from "./useLockBodyScroll";
import GameIcon from "./GameIcon";

const fmtM = (v: number) => `$${(v / 1e6).toFixed(2)}M`;
const fmtK = (v: number) => (v >= 1e6 ? fmtM(v) : `$${Math.round(v / 1e3)}k`);

// Detalhamento financeiro do clube: caixa da última rodada, folha, cota de TV
// e o investimento em arquibancadas. Aberto pelo painel Caixa da Home e pela
// aba Mercado ($).
export default function FinanceModal({ onClose }: { onClose: () => void }) {
  const game = useStore((s) => s.game);
  const upgradeStadium = useStore((s) => s.upgradeStadium);
  if (!game) return null;
  const club = game.clubs.find((c) => c.id === game.userClubId)!;
  const f = game.lastFinance;
  const wages = squadWageBill(game);
  const level = game.stadiumLevel ?? 0;
  const cost = stadiumUpgradeCost(game);
  const maxed = level >= STADIUM_MAX_LEVEL;

  const Row = ({ label, value, cls }: { label: string; value: string; cls?: string }) => (
    <div className="flex items-center justify-between border-b border-zinc-800 py-1.5 text-sm">
      <span className="text-zinc-400">{label}</span>
      <span className={`font-mono tabular-nums font-semibold ${cls ?? "text-zinc-200"}`}>{value}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <ScrollLock />
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-emerald-400"><GameIcon name="finance" size={18} /> Finanças do {club.name}</h2>
          <button onClick={onClose} className="rounded px-2 py-1 text-zinc-500 hover:bg-zinc-800">✕</button>
        </div>

        <Row label="Caixa atual" value={fmtM(game.budget)} cls={game.budget < 0 ? "text-red-400" : "text-emerald-400"} />
        <Row label="Folha salarial (por rodada)" value={`− ${fmtK(wages)}`} cls="text-red-400" />
        <Row label="Cota de TV e patrocínio (por rodada)" value={`+ ${fmtK(tvQuota(club.division))}`} cls="text-emerald-400" />

        {f && (
          <>
            <p className="mb-1 mt-4 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Última rodada</p>
            <Row label="Bilheteria" value={`+ ${fmtK(f.revenue)}`} cls={f.revenue > 0 ? "text-emerald-400" : "text-zinc-500"} />
            {(f.attendance ?? 0) > 0 && (
              <Row label="Público no estádio" value={`${(f.attendance ?? 0).toLocaleString("pt-BR")} torcedores`} />
            )}
            <Row label="TV e patrocínio" value={`+ ${fmtK(f.tv ?? 0)}`} cls={(f.tv ?? 0) > 0 ? "text-emerald-400" : "text-zinc-500"} />
            <Row label="Prêmios" value={`+ ${fmtK(f.prize)}`} cls={f.prize > 0 ? "text-emerald-400" : "text-zinc-500"} />
            <Row label="Salários" value={`− ${fmtK(f.wages ?? 0)}`} cls={(f.wages ?? 0) > 0 ? "text-red-400" : "text-zinc-500"} />
            <Row label="Bicho" value={`− ${fmtK(f.bicho)}`} cls={f.bicho > 0 ? "text-red-400" : "text-zinc-500"} />
            <Row
              label="Saldo da rodada"
              value={fmtK(f.revenue + (f.tv ?? 0) + f.prize - (f.wages ?? 0) - f.bicho)}
              cls={f.revenue + (f.tv ?? 0) + f.prize - (f.wages ?? 0) - f.bicho >= 0 ? "text-emerald-400" : "text-red-400"}
            />
          </>
        )}

        <p className="mb-1 mt-4 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Estádio</p>
        <Row label="Capacidade total" value={`${stadiumCapacity(game).toLocaleString("pt-BR")} lugares`} />
        <Row label="Arquibancadas compradas" value={`nível ${level} de ${STADIUM_MAX_LEVEL}`} />
        <Row label="Cada nível adiciona" value={`+${STADIUM_SEATS_PER_LEVEL.toLocaleString("pt-BR")} lugares`} cls="text-emerald-400" />
        <button
          onClick={async () => {
            if (!upgradeStadium()) {
              await appAlert(maxed ? "O estádio já está no nível máximo." : "Orçamento insuficiente para ampliar a arquibancada.");
            }
          }}
          disabled={maxed || game.budget < cost || game.fired}
          className="mt-3 w-full rounded bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
          title="A ocupação depende da fase do time — arquibancada só vale quando a torcida está lotando"
        >
          {maxed ? "Arquibancada no máximo" : `Comprar arquibancada (+${STADIUM_SEATS_PER_LEVEL.toLocaleString("pt-BR")} lugares) — ${fmtM(cost)}`}
        </button>
      </div>
    </div>
  );
}
