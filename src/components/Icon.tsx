import type { ReactNode, SVGProps } from 'react';

type IconName =
  | 'play'
  | 'pause'
  | 'restart'
  | 'radio'
  | 'volume'
  | 'volumeOff'
  | 'eye'
  | 'eyeOff'
  | 'shield'
  | 'info'
  | 'left'
  | 'right'
  | 'ball'
  | 'goal'
  | 'card'
  | 'sub'
  | 'close'
  | 'expand'
  | 'shrink'
  | 'search'
  | 'calendar'
  | 'spark'
  | 'chevron'
  | 'whistle'
  | 'layers';

const paths: Record<IconName, ReactNode> = {
  play: <path d="M8 5.5v13l10-6.5-10-6.5Z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <path d="M7 5.5h3.5v13H7zM13.5 5.5H17v13h-3.5z" fill="currentColor" stroke="none" />
    </>
  ),
  restart: (
    <>
      <path d="M4.5 11a7.5 7.5 0 1 1 2.2 5.3" />
      <path d="M4.5 5.5V11H10" />
    </>
  ),
  radio: (
    <>
      <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
      <path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2" />
    </>
  ),
  volume: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z" />
      <path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" />
    </>
  ),
  volumeOff: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z" />
      <path d="m16 9 5 6M21 9l-5 6" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M3 3l18 18M10.6 6.2A10.7 10.7 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3.1 3.7M6.4 7.4A16 16 0 0 0 2.5 12s3.5 6 9.5 6a10 10 0 0 0 4.2-.9" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.5 19 6v5.2c0 4.6-3 7.5-7 9.3-4-1.8-7-4.7-7-9.3V6l7-2.5Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.5v.4" />
    </>
  ),
  left: <path d="m14.5 6-6 6 6 6" />,
  right: <path d="m9.5 6 6 6-6 6" />,
  ball: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m12 7.5 4 3-1.5 4.7h-5L8 10.5l4-3Z" />
    </>
  ),
  goal: (
    <>
      <path d="M3.5 17V8.5h17V17M3.5 17h17M7 17v-6.5M12 17v-6.5M17 17v-6.5M3.5 10.5h17" />
    </>
  ),
  card: <path d="M8 4.5h8v15H8z" fill="currentColor" stroke="none" />,
  sub: (
    <>
      <path d="M4 8h13l-3-3M20 16H7l3 3" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  expand: <path d="M8.5 4.5h-4v4M15.5 4.5h4v4M8.5 19.5h-4v-4M15.5 19.5h4v-4" />,
  shrink: <path d="M4.5 8.5h4v-4M19.5 8.5h-4v-4M4.5 15.5h4v4M19.5 15.5h-4v4" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="5.5" />
      <path d="m15 15 4.5 4.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5.5" width="16" height="14" rx="2" />
      <path d="M4 10h16M8 3.5v4M16 3.5v4" />
    </>
  ),
  spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  whistle: (
    <>
      <path d="M14 8h5.5a2 2 0 0 1 2 2v1H16" />
      <path d="M14 8 9.5 5.5H4v5h5.5A4.5 4.5 0 1 0 14 8Z" />
      <circle cx="9.5" cy="13.5" r="2.8" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 8 4.5-8 4.5-8-4.5L12 3Z" />
      <path d="m4 12 8 4.5 8-4.5M4 16.5 12 21l8-4.5" />
    </>
  ),
};

export function Icon({ name, size = 18, ...props }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
