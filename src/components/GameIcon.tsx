// Ícones do jogo: PNGs metálicos (estilo da logo Elifoot 3k) recortados da
// spritesheet, servidos de /icons. Substituem os emojis genéricos por arte
// própria e consistente. Uso: <GameIcon name="goal" size={16} />.
//
// As chaves batem com os nomes dos arquivos em public/icons/*.png.
export type GameIconName =
  | "goal" | "yellow" | "red" | "sub" | "net" | "glove" | "deal" | "reject"
  | "shield" | "balance" | "offense" | "allout" | "light" | "tight" | "extreme" | "aggression"
  | "wasting" | "stats" | "siren" | "injury" | "dice" | "genius" | "search" | "whistle"
  | "trophy" | "globe" | "stadium" | "scorers" | "assists" | "medal" | "champion" | "crown"
  | "invite" | "proposal" | "contract" | "finance" | "bankruptcy" | "settings" | "save" | "load"
  | "roster" | "training" | "board" | "home";

export default function GameIcon({
  name,
  size = 16,
  className,
  title,
}: {
  name: GameIconName;
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <img
      src={`/icons/${name}.png`}
      alt={title ?? name}
      title={title}
      width={size}
      height={size}
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", objectFit: "contain" }}
      draggable={false}
    />
  );
}
