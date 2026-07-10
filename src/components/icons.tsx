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
      {/* engrenagem de verdade (dentes + miolo vazado), não círculo com raios */}
      <path
        d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
        fill="currentColor"
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
