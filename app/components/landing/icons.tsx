// Small inline icons. All are decorative: the control that holds one always has a text label.

type P = { size?: number };

export function ChevronLeft({ size = 18 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M11.5 3.5 6 9l5.5 5.5" />
    </svg>
  );
}

export function ChevronRight({ size = 18 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M6.5 3.5 12 9l-5.5 5.5" />
    </svg>
  );
}

export function Pause({ size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <rect x="3" y="2" width="3.6" height="12" rx="1.2" fill="currentColor" />
      <rect x="9.4" y="2" width="3.6" height="12" rx="1.2" fill="currentColor" />
    </svg>
  );
}

export function Play({ size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M4 2.6v10.8c0 .8.9 1.3 1.6.9l8.6-5.4c.6-.4.6-1.4 0-1.8L5.6 1.7C4.9 1.3 4 1.8 4 2.6z" fill="currentColor" />
    </svg>
  );
}

export function ArrowUpRight({ size = 14 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M4 10 10 4M5 4h5v5" />
    </svg>
  );
}

export function Mic({ size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 22" aria-hidden="true" focusable="false">
      <rect x="4" y="1" width="8" height="13" rx="4" fill="currentColor" />
      <path d="M1.5 10a6.5 6.5 0 0 0 13 0M8 16.5V21" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function GitHub({ size = 18 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
  );
}
