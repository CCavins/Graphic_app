export type OrgIconName =
  | 'align-left'
  | 'align-center'
  | 'align-right'
  | 'align-top'
  | 'align-middle'
  | 'align-bottom'
  | 'distribute-h'
  | 'distribute-v'
  | 'flip-h'
  | 'flip-v'
  | 'group'
  | 'ungroup'
  | 'front'
  | 'forward'
  | 'backward'
  | 'back'

/** Original icons for the same arrange, group, and align commands Graphic puts in its Alignment pane. */
export function OrgIcon({ name }: { name: OrgIconName }) {
  const common = {
    viewBox: '0 0 24 24',
    width: 18,
    height: 18,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  const front = { fill: 'currentColor', stroke: 'currentColor' }
  const back = { fill: 'currentColor', stroke: 'currentColor', opacity: 0.35 }
  switch (name) {
    case 'align-left':
      return (
        <svg {...common}>
          <path d="M5 4v16" />
          <rect x="7" y="6" width="7" height="4.5" />
          <rect x="7" y="13" width="12" height="4.5" />
        </svg>
      )
    case 'align-center':
      return (
        <svg {...common}>
          <path d="M12 4v16" />
          <rect x="8.5" y="6" width="7" height="4.5" />
          <rect x="6" y="13" width="12" height="4.5" />
        </svg>
      )
    case 'align-right':
      return (
        <svg {...common}>
          <path d="M19 4v16" />
          <rect x="10" y="6" width="7" height="4.5" />
          <rect x="5" y="13" width="12" height="4.5" />
        </svg>
      )
    case 'align-top':
      return (
        <svg {...common}>
          <path d="M4 5h16" />
          <rect x="5" y="7" width="4.5" height="7" />
          <rect x="12" y="7" width="6" height="12" />
        </svg>
      )
    case 'align-middle':
      return (
        <svg {...common}>
          <path d="M4 12h16" />
          <rect x="5" y="8.5" width="4.5" height="7" />
          <rect x="12" y="6" width="6" height="12" />
        </svg>
      )
    case 'align-bottom':
      return (
        <svg {...common}>
          <path d="M4 19h16" />
          <rect x="5" y="10" width="4.5" height="7" />
          <rect x="12" y="5" width="6" height="12" />
        </svg>
      )
    case 'distribute-h':
      return (
        <svg {...common}>
          <rect x="4" y="7" width="3.2" height="10" />
          <rect x="10.4" y="5" width="3.2" height="14" />
          <rect x="16.8" y="8" width="3.2" height="8" />
        </svg>
      )
    case 'distribute-v':
      return (
        <svg {...common}>
          <rect x="7" y="4" width="10" height="3.2" />
          <rect x="5" y="10.4" width="14" height="3.2" />
          <rect x="8" y="16.8" width="8" height="3.2" />
        </svg>
      )
    case 'flip-h':
      return (
        <svg {...common}>
          <path d="M5 8.5 9.5 12 5 15.5Z" fill="currentColor" />
          <path d="M19 8.5 14.5 12 19 15.5Z" fill="currentColor" />
        </svg>
      )
    case 'flip-v':
      return (
        <svg {...common}>
          <path d="M8.5 5 12 9.5 15.5 5Z" fill="currentColor" />
          <path d="M8.5 19 12 14.5 15.5 19Z" fill="currentColor" />
        </svg>
      )
    case 'group':
      return (
        <svg {...common}>
          <rect x="4" y="4" width="9" height="9" />
          <rect x="11" y="11" width="9" height="9" />
        </svg>
      )
    case 'ungroup':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="8" height="8" />
          <rect x="13" y="13" width="8" height="8" />
        </svg>
      )
    case 'front':
      return (
        <svg {...common}>
          <rect x="8" y="8" width="11" height="11" {...back} />
          <rect x="4" y="4" width="11" height="11" {...front} />
        </svg>
      )
    case 'forward':
      return (
        <svg {...common}>
          <rect x="9" y="8" width="10" height="10" {...back} />
          <rect x="5" y="5" width="10" height="10" {...front} />
        </svg>
      )
    case 'backward':
      return (
        <svg {...common}>
          <rect x="5" y="5" width="10" height="10" {...back} />
          <rect x="9" y="8" width="10" height="10" {...front} />
        </svg>
      )
    case 'back':
      return (
        <svg {...common}>
          <rect x="4" y="4" width="11" height="11" {...back} />
          <rect x="8" y="8" width="11" height="11" {...front} />
        </svg>
      )
  }
}

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
