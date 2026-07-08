import { useMemo, useState } from "react";
import clubsData from "../data/clubs.json";
import type { Club } from "../types";
import { useStore } from "../store";

const COUNTRIES: Record<string, string> = {
  BR: "🇧🇷 Brasil", AR: "🇦🇷 Argentina", EN: "🏴 Inglaterra",
  ES: "🇪🇸 Espanha", DE: "🇩🇪 Alemanha", FR: "🇫🇷 França", PT: "🇵🇹 Portugal",
};

export default function NewGame() {
  const startGame = useStore((s) => s.startGame);
  const clubs = clubsData as Club[];
  const [country, setCountry] = useState("BR");
  const [clubId, setClubId] = useState<string | null>(null);

  const list = useMemo(
    () =>
      clubs
        .filter((c) => c.country === country)
        .sort((a, b) =>
          a.division === b.division
            ? b.baseBudget - a.baseBudget
            : a.division.localeCompare(b.division),
        ),
    [country, clubs],
  );

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-1 text-3xl font-bold tracking-tight">Retro Manager 2026</h1>
      <p className="mb-6 text-zinc-400">Escolha seu clube para iniciar a temporada.</p>

      <div className="mb-4 flex flex-wrap gap-2">
        {Object.entries(COUNTRIES).map(([code, label]) => (
          <button
            key={code}
            onClick={() => { setCountry(code); setClubId(null); }}
            className={`rounded px-3 py-1.5 text-sm ${
              country === code ? "bg-emerald-600" : "bg-zinc-800 hover:bg-zinc-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {list.map((c) => (
          <button
            key={c.id}
            onClick={() => setClubId(c.id)}
            className={`rounded-lg border p-3 text-left ${
              clubId === c.id
                ? "border-emerald-500 bg-zinc-800"
                : "border-zinc-800 bg-zinc-900 hover:bg-zinc-800"
            }`}
          >
            <div className="mb-1 flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 rounded-full border border-zinc-600"
                style={{ background: c.primaryColor }}
              />
              <span className="text-xs text-zinc-500">{c.division}</span>
            </div>
            <div className="text-sm font-semibold">{c.name}</div>
            <div className="text-xs text-zinc-400">
              €{(c.baseBudget / 1e6).toFixed(1)}M
            </div>
          </button>
        ))}
      </div>

      <button
        disabled={!clubId}
        onClick={() => clubId && startGame(Date.now() >>> 0, clubId)}
        className="mt-6 w-full rounded-lg bg-emerald-600 py-3 font-bold disabled:opacity-40 hover:bg-emerald-500"
      >
        Começar carreira
      </button>
    </div>
  );
}
