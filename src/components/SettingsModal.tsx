import { useRef } from "react";
import { useStore } from "../store";
import type { GameState } from "../types";

const SPEEDS = [
  { v: 0.5, label: "0.5×" },
  { v: 1, label: "1×" },
  { v: 2, label: "2×" },
  { v: 4, label: "4×" },
];

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const { game, settings, setSettings, loadGame, resetGame } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);

  const saveToFile = () => {
    if (!game) return;
    const club = game.clubs.find((c) => c.id === game.userClubId)!;
    const blob = new Blob([JSON.stringify(game)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `retromanager-${club.shortName}-T${game.season}-S${game.week}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const loadFromFile = (file: File) => {
    file.text().then((txt) => {
      try {
        const g = JSON.parse(txt) as GameState;
        if (!g.userClubId || !g.players || !g.clubs) throw new Error("inválido");
        loadGame(g);
        onClose();
      } catch {
        alert("Arquivo de save inválido.");
      }
    });
  };

  const Toggle = ({
    label, value, onChange,
  }: { label: string; value: boolean; onChange: (v: boolean) => void }) => (
    <button
      onClick={() => onChange(!value)}
      className={`flex w-full items-center justify-between rounded px-3 py-2 text-sm ${
        value ? "bg-emerald-900/60" : "bg-zinc-800"
      }`}
    >
      <span>{label}</span>
      <span className={value ? "text-emerald-400" : "text-zinc-500"}>
        {value ? "ON" : "OFF"}
      </span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">⚙ Configurações</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">✕</button>
        </div>

        <p className="mb-1 text-xs text-zinc-500">VELOCIDADE DOS JOGOS</p>
        <div className="mb-4 flex gap-2">
          {SPEEDS.map((s) => (
            <button
              key={s.v}
              onClick={() => setSettings({ speed: s.v })}
              className={`flex-1 rounded px-2 py-1.5 text-sm ${
                settings.speed === s.v ? "bg-emerald-600" : "bg-zinc-800 hover:bg-zinc-700"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <p className="mb-1 text-xs text-zinc-500">ALERTAS SONOROS</p>
        <div className="mb-4 flex flex-col gap-2">
          <Toggle
            label="⚽ Som de gol"
            value={settings.soundGoal}
            onChange={(v) => setSettings({ soundGoal: v })}
          />
          <Toggle
            label="🟥 Som de cartão vermelho"
            value={settings.soundRed}
            onChange={(v) => setSettings({ soundRed: v })}
          />
        </div>

        <p className="mb-1 text-xs text-zinc-500">PARTIDA SALVA</p>
        <div className="flex flex-col gap-2">
          <button
            onClick={saveToFile}
            disabled={!game}
            className="rounded bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700 disabled:opacity-40"
          >
            💾 Salvar jogo (baixar arquivo)
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="rounded bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700"
          >
            📂 Carregar jogo
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) loadFromFile(f);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => {
              if (confirm("Apagar o save atual e começar um novo jogo?")) {
                resetGame();
                onClose();
              }
            }}
            className="rounded bg-red-900/60 px-3 py-2 text-sm text-red-300 hover:bg-red-900"
          >
            🗑 Novo jogo
          </button>
        </div>
      </div>
    </div>
  );
}
