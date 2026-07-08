// Chavinha liga/desliga: deixa claro o estado atual (trilho colorido + knob deslizante),
// ao contrário dos antigos botões "ON/OFF" em que era difícil saber o que estava ativo.
export default function Toggle({
  checked,
  onChange,
  label,
  hint,
  color = "#10b981", // emerald-500
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: React.ReactNode;
  hint?: string;
  color?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      title={hint}
      className="flex w-full items-center justify-between gap-2 rounded bg-zinc-800/60 px-2 py-1.5 text-left text-sm hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span>{label}</span>
      <span
        className="relative inline-block h-4 w-8 shrink-0 rounded-full transition-colors"
        style={{ backgroundColor: checked ? color : "#3f3f46" }}
      >
        <span
          className="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform"
          style={{ transform: checked ? "translateX(18px)" : "translateX(2px)" }}
        />
      </span>
    </button>
  );
}
