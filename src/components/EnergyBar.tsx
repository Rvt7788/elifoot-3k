// Escala ÚNICA de cor por energia, em 5 faixas — usada tanto na barra quanto nos
// pins do campo, para o mesmo nível de energia ter sempre a mesma cor em todo lugar.
export function energyStepColors(value: number): { bg: string; border: string } {
  if (value >= 80) return { bg: "#10b981", border: "#6ee7b7" }; // emerald
  if (value >= 60) return { bg: "#84cc16", border: "#bef264" }; // lime
  if (value >= 40) return { bg: "#f59e0b", border: "#fcd34d" }; // amber
  if (value >= 20) return { bg: "#f97316", border: "#fdba74" }; // orange
  return { bg: "#ef4444", border: "#fca5a5" }; // red
}

// Barra de energia em 5 células físicas, mas o preenchimento de cor tem resolução
// de 10 passos (1 por 10% de energia): cada célula pode ficar meia-cheia, mostrando
// o nível com o dobro de precisão sem multiplicar o número de divisões visuais.
// Cor acompanha o nível: verde (cheio) → vermelho (esgotado).
export default function EnergyBar({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const steps = Math.max(0, Math.min(10, Math.round(value / 10))); // 0..10 (1 por 10%)
  const color = energyStepColors(value).bg;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-[2px] ${className ?? ""}`}
      title={`Energia: ${Math.round(value)}%`}
    >
      {[0, 1, 2, 3, 4].map((i) => {
        const cellSteps = Math.max(0, Math.min(2, steps - i * 2)); // 0, 1 ou 2 sub-passos
        const fill = cellSteps * 50; // 0%, 50% ou 100% da célula
        return (
          <span
            key={i}
            className="relative h-2 w-1.5 overflow-hidden rounded-[1px]"
            style={{ background: "#3f3f46" }}
          >
            <span
              className="absolute inset-y-0 left-0"
              style={{ width: `${fill}%`, background: color }}
            />
          </span>
        );
      })}
    </span>
  );
}
