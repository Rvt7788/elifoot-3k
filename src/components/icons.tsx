// Ícones SVG line-art, traço fino, no espírito do circuito/neon da logo Elifoot 3k.
// Todos aceitam className para herdar cor via currentColor e tamanho via text-*/w-*/h-*.

type IconProps = { className?: string };

export function IconClub({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M4 21V10.5L12 4l8 6.5V21" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 21v-6h6v6" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="12" cy="10.5" r="1.3" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

export function IconBall({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 7.2 15.6 9.8 14.3 14 9.7 14 8.4 9.8 12 7.2Z"
        stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"
      />
      <path d="M12 7.2V4.2M15.6 9.8l2.7-1.9M14.3 14l1 2.8M9.7 14l-1 2.8M8.4 9.8 5.7 7.9"
        stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

export function IconTable({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 9.5h17M8.5 4.5v15" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

export function IconSquad({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 20c0-3.6 2.5-6 5.5-6s5.5 2.4 5.5 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="17" cy="7" r="2.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M15.2 20c-.1-2.9 1.6-5.2 3.9-5.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function IconMarket({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M4 8h16l-1.5 10.5a1.5 1.5 0 0 1-1.5 1.3H7a1.5 1.5 0 0 1-1.5-1.3L4 8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8 8V6a4 4 0 0 1 8 0v2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function IconTraining({ className }: IconProps) {
  // apito de treinador
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M13.5 9.5h5.5a1 1 0 0 1 1 1v1.2a5.7 5.7 0 1 1-8.4-5.1l1.9 3.9Z"
        stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
      />
      <circle cx="11.4" cy="14.2" r="1.3" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 6.5l4.8 2.6M6.5 3.5l3.4 3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function IconGear({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M17.7 6.3l-1.6 1.6M7.9 16.1l-1.6 1.6M17.7 17.7l-1.6-1.6M7.9 7.9 6.3 6.3"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
      />
    </svg>
  );
}

export function IconPlay({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M7 5.5v13l11-6.5-11-6.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" fill="currentColor" fillOpacity="0.12" />
    </svg>
  );
}

export function IconLive({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="3" fill="currentColor" />
      <path d="M7.5 8.5a6.5 6.5 0 0 0 0 7M16.5 8.5a6.5 6.5 0 0 1 0 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M4.5 5.5a11 11 0 0 0 0 13M19.5 5.5a11 11 0 0 1 0 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}
