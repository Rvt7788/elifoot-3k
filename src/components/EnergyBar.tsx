// Barra de energia em 5 células: substitui o número % nas escalações e pranchetas.
// Cor acompanha o nível: verde (cheio) → vermelho (esgotado).
export default function EnergyBar({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const cells = Math.max(0, Math.min(5, Math.ceil(value / 20)));
  const color =
    value >= 80 ? "#10b981" // emerald-500
    : value >= 60 ? "#84cc16" // lime-500
    : value >= 40 ? "#f59e0b" // amber-500
    : value >= 20 ? "#f97316" // orange-500
    : "#ef4444"; // red-500
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-[2px] ${className ?? ""}`}
      title={`Energia: ${Math.round(value)}%`}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="h-2 w-1.5 rounded-[1px]"
          style={{ background: i < cells ? color : "#3f3f46" }}
        />
      ))}
    </span>
  );
}
