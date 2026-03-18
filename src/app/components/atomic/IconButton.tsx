import type { ButtonHTMLAttributes, ReactNode } from 'react'


interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly label:    string
  readonly size?:    'sm' | 'lg'
  readonly children: ReactNode
}

export function IconButton ({
  label,
  size,
  children,
  disabled,
  className = '',
  ...props
}: IconButtonProps) {
  const classes = [
    'button icon',
    size,
    className,
  ].filter(Boolean).join(' ')

  return (
    <button
      aria-label={label}
      className={classes}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}
