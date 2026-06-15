import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const base = (props: IconProps) => ({
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  ...props,
});

export const IconDashboard = (props: IconProps) => (
  <svg {...base(props)}>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </svg>
);

export const IconBuilding = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
    <path d="M16 8h2a2 2 0 0 1 2 2v11" />
    <path d="M9 9h2M9 13h2M9 17h2" />
    <path d="M3 21h18" />
  </svg>
);

export const IconLayers = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M12 3 2 8l10 5 10-5-10-5z" />
    <path d="m2 13 10 5 10-5" />
    <path d="m2 18 10 5 10-5" />
  </svg>
);

export const IconDoor = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
    <path d="M3 21h18" />
    <circle cx="15" cy="12" r="0.8" fill="currentColor" />
  </svg>
);

export const IconBed = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M3 10v9" />
    <path d="M3 14h18v5" />
    <path d="M21 14V8a2 2 0 0 0-2-2H11v8" />
    <circle cx="7" cy="11" r="2" />
  </svg>
);

export const IconTag = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
    <circle cx="7" cy="7" r="1.4" fill="currentColor" stroke="none" />
  </svg>
);

export const IconUsers = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

export const IconClipboard = (props: IconProps) => (
  <svg {...base(props)}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
    <path d="M8 11h8M8 15h5" />
  </svg>
);

export const IconDocument = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6M8 13h8M8 17h5" />
  </svg>
);

export const IconCard = (props: IconProps) => (
  <svg {...base(props)}>
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path d="M2 10h20" />
    <path d="M6 15h3" />
  </svg>
);

export const IconChart = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M3 3v18h18" />
    <path d="M7 15l3-4 4 3 5-7" />
  </svg>
);

export const IconSettings = (props: IconProps) => (
  <svg {...base(props)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

export const IconSearch = (props: IconProps) => (
  <svg {...base(props)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

export const IconBell = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);

export const IconMenu = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M3 6h18M3 12h18M3 18h18" />
  </svg>
);

export const IconClose = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export const IconDatabase = (props: IconProps) => (
  <svg {...base(props)}>
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M3 5v6c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    <path d="M3 11v6c0 1.66 4 3 9 3s9-1.34 9-3v-6" />
  </svg>
);

export const IconCheckCircle = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <path d="m9 11 3 3L22 4" />
  </svg>
);

export const IconAlertTriangle = (props: IconProps) => (
  <svg {...base(props)}>
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
);

export const IconLogo = (props: IconProps) => (
  <svg {...base({ ...props, strokeWidth: 2 })}>
    <path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
  </svg>
);
