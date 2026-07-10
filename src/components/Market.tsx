import { useMemo, useState } from "react";
import { useStore, MIN_SQUAD, MAX_SQUAD } from "../store";
import { aiAcceptChance, askingPrice, filterMarket, type MarketFilters } from "../game/market";
import { appConfirm } from "./AppDialog";
import type { Player, Position, Trait } from "../types";

const POSITIONS: (Position | "ALL")[] = ["ALL", "GOL", "DEF", "MEI", "ATA"];
const TRAITS: (Trait | "ALL")[] = ["ALL", "Goleador", "Paredão", "Veloz", "Criativo", "Raçudo"];
const TIER_BADGE: Record<string, string> = {
  bagre: "", bom: "★", craque: "★★", extra: "💎",
};

type SortKey = "strength" | "age" | "value";
const SORT_LABELS: Record<SortKey, string> = { strength: "Força", age: "Idade", value: "Valor" };

// Chance de contratação em 5 barrinhas: verde (quase certa) → vermelho (quase impossível)
function ChanceBar({ chance }: { chance: number }) {
  const cells = Math.max(0, Math.min(5, Math.round(chance * 5)));
  const color =
    chance >= 0.8 ? "#10b981"
    : chance >= 0.6 ? "#84cc16"
    : chance >= 0.4 ? "#f59e0b"
    : chance >= 0.2 ? "#f97316"
    : "#ef4444";
  return (
    <span
      className="inline-flex shrink-0 items-center gap-[2px]"
      title={`Chance de o clube aceitar: ~${Math.round(chance * 100)}%`}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="h-2.5 w-1.5 rounded-[1px]"
          style={{ background: i < cells ? color : "#3f3f46" }}
        />
      ))}
    </span>
  );
}

// Modal com o desfecho da proposta (aceita ou recusada)
function OfferResultModal({
  result, onClose,
}: { result: { ok: boolean; message: string }; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-900 p-5 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-2 text-4xl">{result.ok ? "🤝" : "❌"}</p>
        <p className={`mb-1 text-base font-bold ${result.ok ? "text-emerald-400" : "text-red-400"}`}>
          {result.ok ? "Proposta aceita!" : "Proposta recusada"}
        </p>
        <p className="mb-4 text-sm text-zinc-300">{result.message}</p>
        <button
          onClick={onClose}
          className={`w-full rounded py-2 text-sm font-bold ${
            result.ok ? "bg-emerald-600 hover:bg-emerald-500" : "bg-zinc-700 hover:bg-zinc-600"
          }`}
        >
          OK
        </button>
      </div>
    </div>
  );
}

export default function Market() {
  const { game, buyPlayer, sellPlayer } = useStore();
  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const emptyFilters: MarketFilters = {
    position: "ALL", minStrength: 1, maxStrength: 50, trait: "ALL", maxValue: null, query: "",
  };
  const [filters, setFilters] = useState<MarketFilters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<MarketFilters | null>(null);
  const [offers, setOffers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("strength");
  const [sortAsc, setSortAsc] = useState(false);

  if (!game) return null;
  const squad = game.players.filter((p) => p.clubId === game.userClubId);

  const updateFilters = (patch: Partial<MarketFilters>) => setFilters({ ...filters, ...patch });

  const results = useMemo(() => {
    if (tab !== "buy" || !appliedFilters) return [];
    const list = filterMarket(game, appliedFilters);
    const key = (p: Player) =>
      sortKey === "value" ? askingPrice(game, p) : p[sortKey];
    return list.sort((a, b) => (sortAsc ? key(a) - key(b) : key(b) - key(a)));
  }, [game.players, game.userClubId, appliedFilters, tab, sortKey, sortAsc]);

  const clubName = (id: string) => game.clubs.find((c) => c.id === id)?.name ?? "?";

  // oferta digitada em €M (vazio = valor pedido)
  const offerValue = (p: Player) => {
    const raw = offers[p.id];
    return raw ? Number(raw) * 1e6 : askingPrice(game, p);
  };

  const doBuy = (p: Player) => {
    const res = buyPlayer(p.id, offerValue(p));
    setResult({ ok: res.ok, message: res.message });
  };

  const doSell = async (p: Player) => {
    if (!(await appConfirm(`Vender ${p.name} por €${(askingPrice(game, p) / 1e6).toFixed(2)}M?`))) return;
    const res = sellPlayer(p.id);
    setResult({
      ok: res.ok,
      message: res.ok
        ? `${p.name} vendido por €${((res.amount ?? 0) / 1e6).toFixed(2)}M.`
        : "Não foi possível vender.",
    });
  };

  return (
    <div className="mx-auto max-w-4xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold">Mercado de Transferências</h2>
        <p className="text-sm text-zinc-400">
          Orçamento: <b className="text-emerald-400">€{(game.budget / 1e6).toFixed(1)}M</b>
        </p>
      </div>

      <div className="mb-3 flex gap-2">
        <button
          onClick={() => setTab("buy")}
          className={`rounded px-3 py-1.5 text-sm ${tab === "buy" ? "bg-emerald-600" : "bg-zinc-800 hover:bg-zinc-700"}`}
        >
          🔍 Contratar
        </button>
        <button
          onClick={() => setTab("sell")}
          className={`rounded px-3 py-1.5 text-sm ${tab === "sell" ? "bg-emerald-600" : "bg-zinc-800 hover:bg-zinc-700"}`}
        >
          💰 Vender do meu elenco
        </button>
      </div>

      {result && <OfferResultModal result={result} onClose={() => setResult(null)} />}

      {tab === "buy" && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 rounded-lg border border-zinc-800 bg-zinc-900 p-3 sm:grid-cols-4">
            <label className="text-xs text-zinc-400">
              Posição
              <select
                value={filters.position}
                onChange={(e) => updateFilters({ position: e.target.value })}
                className="mt-0.5 w-full rounded bg-zinc-800 px-2 py-1 text-sm"
              >
                {POSITIONS.map((p) => <option key={p} value={p}>{p === "ALL" ? "Todas" : p}</option>)}
              </select>
            </label>
            <label className="text-xs text-zinc-400">
              Característica
              <select
                value={filters.trait}
                onChange={(e) => updateFilters({ trait: e.target.value })}
                className="mt-0.5 w-full rounded bg-zinc-800 px-2 py-1 text-sm"
              >
                {TRAITS.map((t) => <option key={t} value={t}>{t === "ALL" ? "Todas" : t}</option>)}
              </select>
            </label>
            <label className="text-xs text-zinc-400">
              Força mín–máx
              <div className="mt-0.5 flex gap-1">
                <input
                  type="number" min={1} max={50}
                  value={Number.isNaN(filters.minStrength) ? "" : filters.minStrength}
                  onChange={(e) => updateFilters({ minStrength: e.target.valueAsNumber })}
                  className="w-1/2 rounded bg-zinc-800 px-2 py-1 text-sm"
                />
                <input
                  type="number" min={1} max={50}
                  value={Number.isNaN(filters.maxStrength) ? "" : filters.maxStrength}
                  onChange={(e) => updateFilters({ maxStrength: e.target.valueAsNumber })}
                  className="w-1/2 rounded bg-zinc-800 px-2 py-1 text-sm"
                />
              </div>
            </label>
            <label className="text-xs text-zinc-400">
              Nome (opcional)
              <input
                type="text" value={filters.query} placeholder="buscar por nome..."
                onChange={(e) => updateFilters({ query: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && setAppliedFilters(filters)}
                className="mt-0.5 w-full rounded bg-zinc-800 px-2 py-1 text-sm"
              />
            </label>
          </div>

          <button
            onClick={() => setAppliedFilters(filters)}
            className="mb-3 w-full rounded bg-emerald-600 py-2 text-sm font-bold hover:bg-emerald-500 sm:w-auto sm:px-6"
          >
            🔍 Buscar
          </button>

          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-zinc-500">
              {appliedFilters
                ? `${results.length} jogadores disponíveis (clubes de divisão compatível)`
                : "Preencha os filtros acima e clique em Buscar para ver os jogadores disponíveis."}
            </p>
            {appliedFilters && results.length > 0 && (
              <div className="flex items-center gap-1 text-xs text-zinc-400">
                Ordenar:
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  className="rounded bg-zinc-800 px-1.5 py-1"
                >
                  {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                    <option key={k} value={k}>{SORT_LABELS[k]}</option>
                  ))}
                </select>
                <button
                  onClick={() => setSortAsc(!sortAsc)}
                  className="rounded bg-zinc-800 px-2 py-1 hover:bg-zinc-700"
                  title={sortAsc ? "Crescente" : "Decrescente"}
                >
                  {sortAsc ? "↑" : "↓"}
                </button>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            {results.slice(0, 60).map((p) => {
              const price = askingPrice(game, p);
              return (
                <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm">
                  <span className="w-6 shrink-0 text-right tabular-nums text-zinc-500">{p.number}</span>
                  <span className="w-8 shrink-0 text-zinc-400">{p.pos}</span>
                  <span className="min-w-[120px] flex-1 truncate">
                    {p.name} <span className="text-amber-400">{TIER_BADGE[p.tier]}</span>
                  </span>
                  <span className="w-32 shrink-0 truncate text-xs text-zinc-500">{clubName(p.clubId)}</span>
                  <span className="w-10 shrink-0 text-center font-bold">
                    {p.strength}
                    {p.strength < p.cap && (
                      <span className="ml-0.5 text-emerald-400" title={`Potencial até ${p.cap}`}>▲</span>
                    )}
                  </span>
                  <span className="w-10 shrink-0 text-center text-xs text-zinc-400">{p.age}a</span>
                  <span className="w-40 shrink-0 truncate text-xs text-zinc-400">{p.traits.join(", ") || "—"}</span>
                  <span className="w-24 shrink-0 text-right text-xs text-zinc-400">
                    pede €{(price / 1e6).toFixed(2)}M
                  </span>
                  <ChanceBar chance={aiAcceptChance(game, p, offerValue(p), () => 0.5)} />
                  <input
                    type="number"
                    placeholder={`${(price / 1e6).toFixed(1)}`}
                    value={offers[p.id] ?? ""}
                    onChange={(e) => setOffers({ ...offers, [p.id]: e.target.value })}
                    className="w-20 shrink-0 rounded bg-zinc-800 px-1 py-1 text-xs"
                    title="Sua oferta em €M (vazio = valor pedido)"
                  />
                  <button
                    onClick={() => doBuy(p)}
                    className="shrink-0 rounded bg-emerald-700 px-2 py-1 text-xs hover:bg-emerald-600"
                  >
                    Propor
                  </button>
                </div>
              );
            })}
            {appliedFilters && results.length === 0 && (
              <p className="text-sm text-zinc-500">Nenhum jogador encontrado com esses filtros.</p>
            )}
          </div>
        </>
      )}

      {tab === "sell" && (
        <>
          <p className="mb-2 text-xs text-zinc-500">
            {squad.length} jogadores (mínimo {MIN_SQUAD}, máximo {MAX_SQUAD})
          </p>
          <div className="flex flex-col gap-1.5">
            {squad
              .sort((a, b) => b.value - a.value)
              .map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm">
                  <span className="w-6 shrink-0 text-right tabular-nums text-zinc-500">{p.number}</span>
                  <span className="w-8 shrink-0 text-zinc-400">{p.pos}</span>
                  <span className="min-w-[120px] flex-1 truncate">
                    {p.name} <span className="text-amber-400">{TIER_BADGE[p.tier]}</span>
                  </span>
                  <span className="w-10 shrink-0 text-center font-bold">
                    {p.strength}
                    {p.strength < p.cap && (
                      <span className="ml-0.5 text-emerald-400" title={`Potencial até ${p.cap}`}>▲</span>
                    )}
                  </span>
                  <span className="w-10 shrink-0 text-center text-xs text-zinc-400">{p.age}a</span>
                  <span className="w-28 shrink-0 text-right text-xs text-emerald-400">
                    €{(askingPrice(game, p) / 1e6).toFixed(2)}M
                  </span>
                  <button
                    disabled={squad.length <= MIN_SQUAD}
                    onClick={() => doSell(p)}
                    className="shrink-0 rounded bg-red-800 px-2 py-1 text-xs hover:bg-red-700 disabled:opacity-30"
                  >
                    Vender
                  </button>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
