import type { ReactNode } from "react";

const I = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

export const Icon = {
  sidebar: () => (
    <I>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M9 4v16" />
    </I>
  ),
  refresh: () => (
    <I>
      <path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" />
      <path d="M4 4v4h4" />
      <path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" />
      <path d="M20 20v-4h-4" />
    </I>
  ),
  home: () => (
    <I>
      <path d="M4 11l8-6 8 6" />
      <path d="M6 10v9h12v-9" />
    </I>
  ),
  file: () => (
    <I>
      <path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v5h5" />
    </I>
  ),
  typ: () => (
    <I>
      <path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M10 12h5M12.5 12v6" />
    </I>
  ),
  folder: () => (
    <I>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </I>
  ),
  folderOpen: () => (
    <I>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v1" />
      <path d="M3 19l2.5-8h16L19 19z" />
    </I>
  ),
  image: () => (
    <I>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M21 16l-5-5-9 9" />
    </I>
  ),
  pdf: () => (
    <I>
      <path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M9 17h6M9 13h6" />
    </I>
  ),
  plus: () => (
    <I>
      <path d="M12 5v14M5 12h14" />
    </I>
  ),
  export: () => (
    <I>
      <path d="M12 3v12M7 8l5-5 5 5" />
      <path d="M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" />
    </I>
  ),
  search: () => (
    <I>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4-4" />
    </I>
  ),
  settings: () => (
    <I>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </I>
  ),
  zoomIn: () => (
    <I>
      <path d="M12 6v12M6 12h12" />
    </I>
  ),
  zoomOut: () => (
    <I>
      <path d="M6 12h12" />
    </I>
  ),
  fit: () => (
    <I>
      <path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" />
    </I>
  ),
  chevron: () => (
    <I>
      <path d="M9 6l6 6-6 6" />
    </I>
  ),
  chevronDown: () => (
    <I>
      <path d="M6 9l6 6 6-6" />
    </I>
  ),
  table: () => (
    <I>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18M9 5v14M15 5v14" />
    </I>
  ),
  math: () => (
    <I>
      <path d="M5 6h8l-5 6 5 6H5" />
      <path d="M15 10l5 5M20 10l-5 5" />
    </I>
  ),
  code: () => (
    <I>
      <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" />
    </I>
  ),
  command: () => (
    <I>
      <path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z" />
    </I>
  ),
  check: () => (
    <I>
      <path d="M5 12l5 5 9-10" />
    </I>
  ),
  alert: () => (
    <I>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6M12 16.5v.5" />
    </I>
  ),
  eye: () => (
    <I>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </I>
  ),
  star: () => (
    <I>
      <path d="M12 4l2.4 5 5.6.6-4.2 3.8 1.2 5.5L12 16l-5 2.9 1.2-5.5L4 9.6 9.6 9z" />
    </I>
  ),
  bolt: () => (
    <I>
      <path d="M13 3L5 14h6l-1 7 8-11h-6z" />
    </I>
  ),
  book: () => (
    <I>
      <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z" />
      <path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3" />
      <path d="M9 7h6" />
    </I>
  ),
  chart: () => (
    <I>
      <path d="M4 4v16h16" />
      <path d="M7 15c2-5 4-7 6-4s3 1 5-5" />
    </I>
  ),
  outline: () => (
    <I>
      <path d="M4 6h16M8 12h12M12 18h8" />
    </I>
  ),
};
