/**
 * The single icon set for the whole site. One 24px stroke family
 * (stroke="currentColor", strokeWidth 2, round caps/joins) plus a few
 * filled 20px status glyphs (checkCircle / xCircle / checkFilled) and the
 * filled 24px lock used on badge art.
 *
 * Do not define local icon components in pages — import from here.
 */

export type IconName =
  | 'check'
  | 'lock'
  | 'clock'
  | 'arrowRight'
  | 'arrowLeft'
  | 'medal'
  | 'home'
  | 'map'
  | 'menu'
  | 'x'
  | 'chevronDown'
  | 'external'
  | 'sun'
  | 'moon'
  | 'monitor'
  | 'play'
  | 'checkCircle'
  | 'xCircle'
  | 'checkFilled'
  | 'lockFilled';

const FILLED_20 = new Set<IconName>(['checkCircle', 'xCircle', 'checkFilled']);
const FILLED_24 = new Set<IconName>(['lockFilled', 'play']);

function paths(name: IconName): React.ReactNode {
  switch (name) {
    case 'check':
      return <path d="M5 13l4 4L19 7" />;
    case 'lock':
      return (
        <>
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 018 0v4" />
        </>
      );
    case 'clock':
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </>
      );
    case 'arrowRight':
      return <path d="M5 12h14M13 6l6 6-6 6" />;
    case 'arrowLeft':
      return <path d="M19 12H5M11 6l-6 6 6 6" />;
    case 'medal':
      return (
        <>
          <circle cx="12" cy="15" r="6" />
          <path d="M15.5 9.5L20 3h-4l-2.5 5M8.5 9.5L4 3h4l2.5 5" />
        </>
      );
    case 'home':
      return (
        <>
          <path d="M3 11l9-8 9 8" />
          <path d="M5 10v10h5v-6h4v6h5V10" />
        </>
      );
    case 'map':
      return (
        <>
          <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
          <path d="M9 4v14M15 6v14" />
        </>
      );
    case 'menu':
      return <path d="M4 7h16M4 12h16M4 17h16" />;
    case 'x':
      return <path d="M6 6l12 12M18 6L6 18" />;
    case 'chevronDown':
      return <path d="M6 9l6 6 6-6" />;
    case 'external':
      return (
        <>
          <path d="M14 5h5v5" />
          <path d="M19 5l-8 8" />
          <path d="M19 13v6a1 1 0 01-1 1H6a1 1 0 01-1-1V7a1 1 0 011-1h6" />
        </>
      );
    case 'sun':
      return (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </>
      );
    case 'moon':
      return <path d="M20 13.5A8 8 0 1110.5 4 6.5 6.5 0 0020 13.5Z" />;
    case 'monitor':
      return (
        <>
          <rect x="3" y="4" width="18" height="12" rx="2" />
          <path d="M9 20h6M12 16v4" />
        </>
      );
    case 'play':
      return <path d="M8 5.5v13l11-6.5-11-6.5Z" />;
    case 'checkCircle':
      return (
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16Zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4Z"
          clipRule="evenodd"
        />
      );
    case 'xCircle':
      return (
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16ZM8.3 7.3a1 1 0 011.4 0L10 7.6l.3-.3a1 1 0 111.4 1.4L11.4 9l.3.3a1 1 0 11-1.4 1.4L10 10.4l-.3.3a1 1 0 11-1.4-1.4l.3-.3-.3-.3a1 1 0 010-1.4Z"
          clipRule="evenodd"
        />
      );
    case 'checkFilled':
      return (
        <path
          fillRule="evenodd"
          d="M16.7 5.3a1 1 0 011 0l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.6l7.3-7.3a1 1 0 011 0Z"
          clipRule="evenodd"
        />
      );
    case 'lockFilled':
      return (
        <path
          fillRule="evenodd"
          d="M12 2a5 5 0 00-5 5v3H6a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2v-8a2 2 0 00-2-2h-1V7a5 5 0 00-5-5Zm-3 8V7a3 3 0 116 0v3H9Z"
          clipRule="evenodd"
        />
      );
  }
}

export function Icon({ name, className = 'h-4 w-4' }: { name: IconName; className?: string }) {
  const filled = FILLED_20.has(name) || FILLED_24.has(name);
  return (
    <svg
      viewBox={FILLED_20.has(name) ? '0 0 20 20' : '0 0 24 24'}
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={filled ? undefined : 2}
      strokeLinecap={filled ? undefined : 'round'}
      strokeLinejoin={filled ? undefined : 'round'}
      aria-hidden="true"
      className={className}
    >
      {paths(name)}
    </svg>
  );
}
