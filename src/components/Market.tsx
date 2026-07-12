import { Fragment, useMemo, useState } from "react";
import { useStore, MIN_SQUAD, MAX_SQUAD } from "../store";
import { aiAcceptChance, askingPrice, filterMarket, quickSellPrice, type MarketFilters } from "../game/market";
import { appConfirm } from "./AppDialog";
import FinanceModal from "./FinanceModal";
import type { Player, Position, Trait } from "../types";
import { ScrollLock } from "./useLockBodyScroll";
import { userSquadRoles } from "../game/roles";
import { RoleBadges } from "./icons";

const POSITIONS: (Position | "ALL")[] = ["ALL", "GOL", "DEF", "MEI", "ATA"];
const TRAITS: (Trait | "ALL")[] = ["ALL", "Goleador", "Paredão", "Veloz", "Criativo", "Raçudo", "Líder"];
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

type SortKey = "strength" | "age" | "value" | "goals" | "assists" | "name";

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
      <ScrollLock />
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

// Última busca feita no mercado: sobrevive à navegação entre telas (módulo vive
// enquanto a aba estiver aberta), então voltar ao mercado reabre a mesma pesquisa.
let lastSearch: { filters: MarketFilters; appliedFilters: MarketFilters | null } | null = null;

export default function Market() {
  const { game, buyPlayer, sellPlayer } = useStore();
  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const emptyFilters: MarketFilters = {
    position: "ALL",
    minStrength: 1,
    maxStrength: 50,
    trait: "ALL",
    minValue: null,
    maxValue: null,
    minAge: null,
    maxAge: null,
    minGoals: null,
    minAssists: null,
    query: "",
  };
  const [filters, setFiltersRaw] = useState<MarketFilters>(lastSearch?.filters ?? emptyFilters);
  const [appliedFilters, setAppliedFiltersRaw] = useState<MarketFilters | null>(lastSearch?.appliedFilters ?? null);
  const setFilters = (f: MarketFilters) => {
    lastSearch = { filters: f, appliedFilters: lastSearch?.appliedFilters ?? null };
    setFiltersRaw(f);
  };
  const setAppliedFilters = (f: MarketFilters | null) => {
    lastSearch = { filters: lastSearch?.filters ?? filters, appliedFilters: f };
    setAppliedFiltersRaw(f);
  };
  const [offers, setOffers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("strength");
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedSell, setExpandedSell] = useState<string | null>(null);
  const [financeOpen, setFinanceOpen] = useState(false);
  const [sellSort, setSellSort] = useState<"value" | "name" | "age" | "strength" | "apps" | "goals">("value");
  const [sellAsc, setSellAsc] = useState(false);

  if (!game) return null;
  const squad = game.players.filter((p) => p.clubId === game.userClubId);
  const roles = userSquadRoles(game);

  const updateFilters = (patch: Partial<MarketFilters>) => setFilters({ ...filters, ...patch });

  const handleSortClick = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === "age" || key === "name");
    }
  };

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) return "";
    return sortAsc ? " ↑" : " ↓";
  };

  const results = useMemo(() => {
    if (tab !== "buy" || !appliedFilters) return [];
    const list = filterMarket(game, appliedFilters);
    const key = (p: Player) => {
      if (sortKey === "value") return askingPrice(game, p);
      if (sortKey === "name") return p.name;
      return p[sortKey as Exclude<SortKey, "value" | "name">];
    };
    return list.sort((a, b) => {
      const valA = key(a);
      const valB = key(b);
      if (typeof valA === "string" && typeof valB === "string") {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortAsc ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    });
  }, [game.players, game.userClubId, appliedFilters, tab, sortKey, sortAsc]);

  const clubName = (id: string) => game.clubs.find((c) => c.id === id)?.name ?? "?";

  // oferta digitada em $M (vazio = valor pedido)
  const offerValue = (p: Player) => {
    const raw = offers[p.id];
    return raw ? Number(raw) * 1e6 : askingPrice(game, p);
  };

  const doBuy = (p: Player) => {
    const res = buyPlayer(p.id, offerValue(p));
    setResult({ ok: res.ok, message: res.message });
  };

  const doSell = async (p: Player) => {
    if (!(await appConfirm(`Venda rápida de ${p.name} por $${(quickSellPrice(p) / 1e6).toFixed(2)}M (abaixo do valor de mercado)?`))) return;
    const res = sellPlayer(p.id);
    setResult({
      ok: res.ok,
      message: res.ok
        ? `${p.name} vendido por $${((res.amount ?? 0) / 1e6).toFixed(2)}M.`
        : "Não foi possível vender.",
    });
  };

  return (
    <div className="mx-auto max-w-4xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold">Mercado de Transferências</h2>
        <button
          onClick={() => setFinanceOpen(true)}
          className="rounded px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-800"
          title="Ver o detalhamento financeiro completo do clube"
        >
          Orçamento: <b className="text-emerald-400">${(game.budget / 1e6).toFixed(1)}M</b> ›
        </button>
      </div>
      {financeOpen && <FinanceModal onClose={() => setFinanceOpen(false)} />}

      {/* abas em linha cheia: Contratar de um lado, Vender do outro */}
      <div className="mb-3 flex w-full gap-2">
        <button
          onClick={() => setTab("buy")}
          className={`flex-1 rounded px-3 py-1.5 text-sm font-semibold ${tab === "buy" ? "bg-emerald-600" : "bg-zinc-800 hover:bg-zinc-700"}`}
        >
          🔍 Contratar
        </button>
        <button
          onClick={() => setTab("sell")}
          className={`flex-1 rounded px-3 py-1.5 text-sm font-semibold ${tab === "sell" ? "bg-emerald-600" : "bg-zinc-800 hover:bg-zinc-700"}`}
        >
          💰 Vender
        </button>
      </div>

      {result && <OfferResultModal result={result} onClose={() => setResult(null)} />}

      {tab === "buy" && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 rounded-lg border border-zinc-800 bg-zinc-900 p-3 sm:grid-cols-3 lg:grid-cols-6">
            <label className="text-xs text-zinc-400">
              Posição
              <select
                value={filters.position}
                onChange={(e) => updateFilters({ position: e.target.value })}
                className="mt-0.5 w-full rounded bg-zinc-800 px-2 py-1 text-sm font-semibold text-zinc-100"
              >
                {POSITIONS.map((p) => <option key={p} value={p}>{p === "ALL" ? "Todas" : p}</option>)}
              </select>
            </label>
            <label className="text-xs text-zinc-400">
              Característica
              <select
                value={filters.trait}
                onChange={(e) => updateFilters({ trait: e.target.value })}
                className="mt-0.5 w-full rounded bg-zinc-800 px-2 py-1 text-sm font-semibold text-zinc-100"
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
                  className="w-1/2 rounded bg-zinc-800 px-2 py-1 text-sm text-zinc-100"
                />
                <input
                  type="number" min={1} max={50}
                  value={Number.isNaN(filters.maxStrength) ? "" : filters.maxStrength}
                  onChange={(e) => updateFilters({ maxStrength: e.target.valueAsNumber })}
                  className="w-1/2 rounded bg-zinc-800 px-2 py-1 text-sm text-zinc-100"
                />
              </div>
            </label>
            <label className="text-xs text-zinc-400">
              Valor mín–máx ($M)
              <div className="mt-0.5 flex gap-1">
                <input
                  type="number" min={0} step={0.1}
                  placeholder="mín"
                  value={filters.minValue !== null ? filters.minValue / 1e6 : ""}
                  onChange={(e) => updateFilters({ minValue: e.target.value === "" ? null : e.target.valueAsNumber * 1e6 })}
                  className="w-1/2 rounded bg-zinc-800 px-2 py-1 text-sm text-zinc-100"
                />
                <input
                  type="number" min={0} step={0.1}
                  placeholder="máx"
                  value={filters.maxValue !== null ? filters.maxValue / 1e6 : ""}
                  onChange={(e) => updateFilters({ maxValue: e.target.value === "" ? null : e.target.valueAsNumber * 1e6 })}
                  className="w-1/2 rounded bg-zinc-800 px-2 py-1 text-sm text-zinc-100"
                />
              </div>
            </label>
            <label className="text-xs text-zinc-400">
              Idade mín–máx
              <div className="mt-0.5 flex gap-1">
                <input
                  type="number" min={15} max={42}
                  placeholder="mín"
                  value={filters.minAge ?? ""}
                  onChange={(e) => updateFilters({ minAge: e.target.value === "" ? null : e.target.valueAsNumber })}
                  className="w-1/2 rounded bg-zinc-800 px-2 py-1 text-sm text-zinc-100"
                />
                <input
                  type="number" min={15} max={42}
                  placeholder="máx"
                  value={filters.maxAge ?? ""}
                  onChange={(e) => updateFilters({ maxAge: e.target.value === "" ? null : e.target.valueAsNumber })}
                  className="w-1/2 rounded bg-zinc-800 px-2 py-1 text-sm text-zinc-100"
                />
              </div>
            </label>
            <label className="text-xs text-zinc-400">
              Nome (opcional)
              <input
                type="text" value={filters.query} placeholder="buscar por nome..."
                onChange={(e) => updateFilters({ query: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && setAppliedFilters(filters)}
                className="mt-0.5 w-full rounded bg-zinc-800 px-2 py-1 text-sm text-zinc-100"
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
              {appliedFilters ? `${results.length} jogadores disponíveis (clubes de divisão compatível)` : ""}
            </p>

            {/* Seletor de ordenação visível APENAS no mobile */}
            {appliedFilters && results.length > 0 && (
              <div className="flex sm:hidden items-center gap-1.5 text-xs text-zinc-400 bg-zinc-900/60 p-2 rounded-lg border border-zinc-800 w-full justify-between mt-2">
                <span>Ordenar por:</span>
                <div className="flex items-center gap-1">
                  <select
                    value={sortKey}
                    onChange={(e) => handleSortClick(e.target.value as SortKey)}
                    className="rounded bg-zinc-800 px-1.5 py-1 text-zinc-200 font-semibold text-xs border border-zinc-700"
                  >
                    <option value="strength">Força</option>
                    <option value="age">Idade</option>
                    <option value="value">Preço</option>
                    <option value="goals">Gols</option>
                    <option value="assists">Assistências</option>
                    <option value="name">Nome</option>
                  </select>
                  <button
                    onClick={() => setSortAsc(!sortAsc)}
                    className="rounded bg-zinc-800 px-2.5 py-1 text-zinc-300 hover:text-zinc-100 border border-zinc-700 font-bold"
                    title={sortAsc ? "Crescente" : "Decrescente"}
                  >
                    {sortAsc ? "↑" : "↓"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {appliedFilters && results.length > 0 && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-500 border-b border-zinc-800/80 mb-2">
              {/* cabeçalho na MESMA ordem das colunas da linha: pos, nome, clube,
                  força, preço, idade, gols/assist., características, negociação */}
              <span className="w-8 shrink-0">Pos</span>
              <button
                onClick={() => handleSortClick("name")}
                className={`min-w-[120px] flex-1 text-left hover:text-zinc-300 transition-colors ${sortKey === "name" ? "text-amber-400" : ""}`}
              >
                Nome{renderSortIcon("name")}
              </button>
              <span className="w-24 shrink-0 text-left">Clube</span>
              <button
                onClick={() => handleSortClick("strength")}
                className={`w-10 shrink-0 text-center hover:text-zinc-300 transition-colors ${sortKey === "strength" ? "text-amber-400" : ""}`}
              >
                For{renderSortIcon("strength")}
              </button>
              <button
                onClick={() => handleSortClick("value")}
                className={`w-20 shrink-0 text-right hover:text-zinc-300 transition-colors ${sortKey === "value" ? "text-amber-400" : ""}`}
              >
                Preço{renderSortIcon("value")}
              </button>
              <button
                onClick={() => handleSortClick("age")}
                className={`w-10 shrink-0 text-center hover:text-zinc-300 transition-colors ${sortKey === "age" ? "text-amber-400" : ""}`}
              >
                Ida{renderSortIcon("age")}
              </button>
              <div className="w-16 shrink-0 flex items-center justify-center gap-1">
                <button
                  onClick={() => handleSortClick("goals")}
                  className={`hover:text-zinc-300 transition-colors ${sortKey === "goals" ? "text-amber-400" : ""}`}
                  title="Ordenar por Gols"
                >
                  G{renderSortIcon("goals")}
                </button>
                <span>/</span>
                <button
                  onClick={() => handleSortClick("assists")}
                  className={`hover:text-zinc-300 transition-colors ${sortKey === "assists" ? "text-amber-400" : ""}`}
                  title="Ordenar por Assistências"
                >
                  A{renderSortIcon("assists")}
                </button>
              </div>
              <span className="w-24 shrink-0 text-left">Caract.</span>
              <span className="w-[110px] shrink-0 text-center">Negociação</span>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            {results.slice(0, 60).map((p) => {
              const price = askingPrice(game, p);
              // mobile: card de 2 linhas; desktop (sm:): os wrappers viram
              // "contents" e tudo volta a ser uma linha única de colunas
              return (
                <div key={p.id} className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm sm:flex sm:flex-nowrap sm:items-center sm:gap-2">
                  <div className="flex items-center gap-2 sm:contents">
                    <span className="w-8 shrink-0 text-zinc-400">{p.pos}</span>
                    <span className="min-w-0 flex-1 flex items-center gap-1.5 sm:min-w-[120px]">
                      <span className="overflow-hidden whitespace-nowrap [text-overflow:clip]">{p.name}</span>
                      <span className="text-amber-400 shrink-0">{TIER_BADGE[p.tier]}</span>
                      <ChanceBar chance={aiAcceptChance(game, p, offerValue(p), () => 0.5)} />
                    </span>
                    <span className="max-w-[110px] shrink-0 truncate text-xs text-zinc-500 sm:w-24 sm:max-w-none">{clubName(p.clubId)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs sm:contents">
                    <span className="font-bold text-sm sm:w-10 sm:shrink-0 sm:text-center">
                      {p.strength}
                      {p.strength < p.cap && (
                        <span className="ml-0.5 text-emerald-400" title={`Potencial até ${p.cap}`}>▲</span>
                      )}
                    </span>
                    <span className="font-mono text-emerald-400 text-xs sm:w-20 sm:shrink-0 sm:text-right">${(price / 1e6).toFixed(2)}M</span>
                    <span className="text-zinc-400 text-xs sm:w-10 sm:shrink-0 sm:text-center">{p.age}a</span>
                    <span className="font-mono text-zinc-500 text-xs sm:w-16 sm:shrink-0 sm:text-center" title="Gols / Assistências nesta temporada">
                      {p.goals}/{p.assists}
                    </span>
                    <span className="min-w-0 truncate text-zinc-400 text-xs sm:w-24 sm:shrink-0">{p.traits.join(", ") || "—"}</span>
                    <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:ml-0 sm:w-[110px] sm:justify-end">
                      {/* clique seleciona tudo para digitar o valor novo; apagar e sair
                          volta ao valor pedido (placeholder), mesmo padrão do Nº do elenco */}
                      <input
                        type="number"
                        placeholder={`${(price / 1e6).toFixed(1)}`}
                        value={offers[p.id] ?? ""}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setOffers({ ...offers, [p.id]: e.target.value })}
                        className="w-12 shrink-0 rounded bg-zinc-800 px-1 py-0.5 text-xs text-zinc-100 text-center"
                        title="Sua oferta em $M (vazio = valor pedido)"
                      />
                      <button
                        onClick={() => doBuy(p)}
                        className="shrink-0 rounded bg-emerald-700 px-1.5 py-0.5 text-xs hover:bg-emerald-600 text-white font-semibold"
                      >
                        Propor
                      </button>
                    </div>
                  </div>
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
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-zinc-500">
              {squad.length} jogadores (mínimo {MIN_SQUAD}, máximo {MAX_SQUAD})
            </p>
            <div className="flex flex-wrap gap-1">
              {([
                ["value", "Valor"],
                ["name", "Nome"],
                ["age", "Idade"],
                ["strength", "Força"],
                ["apps", "Jogos"],
                ["goals", "Gols"],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => {
                    if (sellSort === key) setSellAsc(!sellAsc);
                    else { setSellSort(key); setSellAsc(key === "name" || key === "age"); }
                  }}
                  className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                    sellSort === key ? "bg-emerald-600 text-white" : "bg-zinc-800/60 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {label}{sellSort === key ? (sellAsc ? " ↑" : " ↓") : ""}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            {[...squad]
              .sort((a, b) => {
                const key = (p: Player) =>
                  sellSort === "value" ? quickSellPrice(p)
                  : sellSort === "name" ? p.name
                  : sellSort === "apps" ? (p.apps ?? 0)
                  : p[sellSort];
                const va = key(a);
                const vb = key(b);
                if (typeof va === "string" && typeof vb === "string")
                  return sellAsc ? va.localeCompare(vb) : vb.localeCompare(va);
                return sellAsc ? (va as number) - (vb as number) : (vb as number) - (va as number);
              })
              .map((p) => (
                <Fragment key={p.id}>
                  <div
                    onClick={() => setExpandedSell(expandedSell === p.id ? null : p.id)}
                    className="flex flex-wrap sm:flex-nowrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm cursor-pointer hover:bg-zinc-800/20"
                  >
                    <span className="w-8 shrink-0 text-zinc-400">{p.pos}</span>
                    <span className="min-w-[120px] flex-1 truncate">
                      <span className="inline-flex items-center gap-1">
                        {p.name} <span className="text-amber-400">{TIER_BADGE[p.tier]}</span>
                        <RoleBadges penalty={p.id === roles.penaltyTakerId} captain={p.id === roles.captainId} />
                        {game.starters.includes(p.id) && (
                          <span className="shrink-0 rounded bg-emerald-950 px-1 text-[10px] text-emerald-400">titular</span>
                        )}
                      </span>
                    </span>
                    <span className="w-10 shrink-0 text-center font-bold">
                      {p.strength}
                      {p.strength < p.cap && (
                        <span className="ml-0.5 text-emerald-400" title={`Potencial até ${p.cap}`}>▲</span>
                      )}
                    </span>
                    <span className="w-10 shrink-0 text-center text-xs text-zinc-400">{p.age}a</span>
                    <span className="w-28 shrink-0 text-right text-xs text-emerald-400 font-mono">
                      ${(quickSellPrice(p) / 1e6).toFixed(2)}M
                    </span>
                    <button
                      disabled={squad.length <= MIN_SQUAD}
                      onClick={(e) => {
                        e.stopPropagation();
                        doSell(p);
                      }}
                      className="shrink-0 rounded bg-red-800 px-2 py-1 text-xs hover:bg-red-700 disabled:opacity-30"
                    >
                      Vender
                    </button>
                  </div>
                  {expandedSell === p.id && (
                    <div className="bg-[#0c131d] px-4 py-3 border-x border-b border-zinc-800 rounded-b-lg -mt-2 mb-1.5 shadow-inner">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-zinc-400 sm:grid-cols-4">
                        <p>Nível: <span className="text-zinc-200">{TIER_NAME[p.tier] || p.tier}</span></p>
                        <p>Pé: <span className="text-zinc-200 capitalize">{p.foot}</span></p>
                        <p className="col-span-2">Nascimento: <span className="text-zinc-200">{playerBirthDate(p.id, p.age, game.season)}</span></p>
                        <p>Jogos: <span className="text-zinc-200">{p.apps ?? 0}</span></p>
                        <p>Gols: <span className="text-zinc-200">{p.goals}</span></p>
                        <p>Assistências: <span className="text-zinc-200">{p.assists}</span></p>
                        <p>Cartões: <span className="text-zinc-200">🟨 {p.yellows} · 🟥 {p.reds}</span></p>
                        <p>Evolução no ano: <span className={p.gained > 0 ? "text-emerald-400" : "text-zinc-200"}>{p.gained > 0 ? `+${p.gained}` : p.gained}</span></p>
                        <p>Treino: <span className="text-zinc-200 capitalize">{p.training}</span></p>
                        <p>Títulos: <span className="text-amber-400">{p.titles ?? 0} 🏆</span></p>
                        <p className="col-span-2">
                          Contrato:{" "}
                          <span className={(p.contract ?? 1) <= 1 ? "font-bold text-amber-400" : "text-zinc-200"}>
                            {p.contract ?? 1} temporada{(p.contract ?? 1) > 1 ? "s" : ""}
                          </span>
                        </p>
                        <p className="col-span-2 sm:col-span-4">
                          Características:{" "}
                          <span className="text-amber-400">
                            {p.traits.length ? p.traits.join(", ") : "nenhuma"}
                          </span>
                        </p>
                      </div>
                    </div>
                  )}
                </Fragment>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
