import type { ReactNode, SVGProps } from 'react'
import type { IconName } from '../../services/types'


const DRAWING: Record<IconName, ReactNode> = {
  'add':             <path d='M12 5v14M5 12h14' />,
  'chevron-right':   <path d='m9 18 6-6-6-6' />,
  'close':           <path d='M6 6l12 12M18 6 6 18' />,
  'density-compact': <path d='M5 8h14M5 12h14M5 16h14' />,
  'density-normal':  <path d='M5 7h14M5 12h14M5 17h14' />,
  'density-relaxed': <path d='M5 6h14M5 12h14M5 18h14' />,
  'edit':            <path d='m4 20 4.4-1 10.2-10.2-3.4-3.4L5 15.6 4 20Zm9.7-13.1 3.4 3.4' />,
  'grid-lg':         <path d='M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z' />,
  'grid-sm':         <path d='M4 4h4v4H4V4Zm6 0h4v4h-4V4Zm6 0h4v4h-4V4ZM4 10h4v4H4v-4Zm6 0h4v4h-4v-4Zm6 0h4v4h-4v-4ZM4 16h4v4H4v-4Zm6 0h4v4h-4v-4Zm6 0h4v4h-4v-4Z' />,
  'library':         <path d='M6 4v16M10 4v16M14 6v14M18 8v12M4 4h8M4 20h16' />,
  'lyrics':          <path d='M5 6h14M5 10h14M5 14h9M5 18h7' />,
  'maximize':        <rect x='5' y='5' width='14' height='14' rx='1' />,
  'menu':            <path d='M4 7h16M4 12h16M4 17h16' />,
  'minimize':        <path d='M5 12h14' />,
  'music':           <path d='M9 18V6l10-2v12M9 9l10-2M6.5 21A2.5 2.5 0 1 0 6.5 16 2.5 2.5 0 0 0 6.5 21Zm10-2A2.5 2.5 0 1 0 16.5 14a2.5 2.5 0 0 0 0 5Z' />,
  'next':            <path d='M6 5l9 7-9 7V5Zm10 0v14' />,
  'pause':           <path d='M8 5v14M16 5v14' />,
  'play':            <path d='m8 5 11 7-11 7V5Z' />,
  'previous':        <path d='m18 5-9 7 9 7V5ZM8 5v14' />,
  'repeat':          <path d='m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3' />,
  'search':          <path d='m21 21-4.4-4.4M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z' />,
  'settings':        <path d='M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm0-13v2m0 15v2m9-9h-2m-14 0H3m15.4-6.4-1.4 1.4M7 17l-1.4 1.4m12.8 0L17 17M7 7 5.6 5.6' />,
  'shuffle':         <path d='M4 7h3c5 0 5 10 10 10h3m-3-3 3 3-3 3M4 17h3c2.1 0 3.3-1.8 4.4-3.8M14 8.6C15 7.7 15.9 7 17 7h3m-3-3 3 3-3 3' />,
  'star':            <path d='m12 3.5 2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8L12 3.5Z' />,
  'waveform':        <path d='M3 12h3l2-6 4 12 2-6h7' />,
}

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  readonly name: IconName
}

/** One lightweight inline SVG vocabulary for every decorative app icon. */
export function Icon ({ name, className = '', ...props }: IconProps) {
  return <svg
    className={ `icon ${className}`.trim() }
    aria-hidden='true'
    viewBox='0 0 24 24'
    fill='none'
    stroke='currentColor'
    strokeWidth='1.8'
    strokeLinecap='round'
    strokeLinejoin='round'
    focusable='false'
    { ...props }>
    {DRAWING[name]}
  </svg>
}
