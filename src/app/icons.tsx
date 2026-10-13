export function ToolIcon({ name }: { name: string }) {
  const common = {
    viewBox: '0 0 24 24',
    width: 18,
    height: 18,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  switch (name) {
    case 'select':
      return (
        <svg {...common}>
          <path d="M5 3.5 19 12l-6.2.8L10 19.5 5 3.5Z" />
        </svg>
      )
    case 'pathSelect':
      return (
        <svg {...common}>
          <path d="M5 16c3-7 11-7 14 0" />
          <path d="M8 8h.01M12 6h.01M16 8h.01" />
        </svg>
      )
    case 'pen':
      return (
        <svg {...common}>
          <path d="M4 20c2.5-6 4-8 8-12l3 3c-4 4-6 5.5-12 8l1 1Z" />
          <path d="m13 7 3 3" />
        </svg>
      )
    case 'pencil':
      return (
        <svg {...common}>
          <path d="M4 20 15.5 8.5 18 11 6.5 22.5 4 20Z" />
          <path d="m14 7 3 3" />
        </svg>
      )
    case 'brush':
      return (
        <svg {...common}>
          <path d="M5 19c2 0 3-1 3-3 2-4 8-9 11-11-1 4-4 10-8 12-2 0-3 1-3 2 0 2-1 2-3 0Z" />
        </svg>
      )
    case 'line':
      return (
        <svg {...common}>
          <path d="M5 19 19 5" />
        </svg>
      )
    case 'arc':
      return (
        <svg {...common}>
          <path d="M5 18c8 0 13-5 13-13" />
        </svg>
      )
    case 'rect':
      return (
        <svg {...common}>
          <rect x="5" y="6" width="14" height="12" rx="1" />
        </svg>
      )
    case 'roundRect':
      return (
        <svg {...common}>
          <rect x="5" y="6" width="14" height="12" rx="4" />
        </svg>
      )
    case 'ellipse':
      return (
        <svg {...common}>
          <ellipse cx="12" cy="12" rx="7" ry="5.5" />
        </svg>
      )
    case 'polygon':
      return (
        <svg {...common}>
          <path d="M12 4.5 19 9.2 16.4 17.5H7.6L5 9.2 12 4.5Z" />
        </svg>
      )
    case 'star':
      return (
        <svg {...common}>
          <path d="m12 4 1.8 4.6H19l-4 3.1 1.6 4.8L12 13.8 7.4 16.5 9 11.7 5 8.6h5.2L12 4Z" />
        </svg>
      )
    case 'text':
      return (
        <svg {...common}>
          <path d="M6 6h12M12 6v12M9 18h6" />
        </svg>
      )
    case 'hand':
      return (
        <svg {...common}>
          <path d="M8 11V6.5a1.5 1.5 0 0 1 3 0V11M11 10V5.5a1.5 1.5 0 0 1 3 0V11M14 10.5V7.5a1.5 1.5 0 0 1 3 0V13c0 4-2 7-6 7-3 0-5-2-6-4l-1.2-2.2a1.4 1.4 0 0 1 2.4-1.4L8 14" />
        </svg>
      )
    case 'eraser':
      return (
        <svg {...common}>
          <path d="m4 15 8-8 6 6-5 5H9l-5-3Z" />
          <path d="M9 18h11" />
        </svg>
      )
    case 'scissors':
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="2.5" />
          <circle cx="7" cy="17" r="2.5" />
          <path d="m9 8.5 11 7M9 15.5l11-7" />
        </svg>
      )
    case 'addAnchor':
      return (
        <svg {...common}>
          <path d="M4 16c4-8 12-8 16 0" />
          <path d="M12 7v6M9 10h6" />
        </svg>
      )
    case 'gradient':
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="14" rx="1" />
          <path d="M8 5v14M12 5v14M16 5v14" opacity="0.5" />
        </svg>
      )
    default:
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="5.5" />
          <path d="m15.5 15.5 4 4" />
        </svg>
      )
  }
}
