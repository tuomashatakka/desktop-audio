import type { ButtonHTMLAttributes, ReactNode } from 'react'


interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'
  readonly size?:    'sm' | 'lg'
  readonly loading?: boolean
  readonly icon?:    boolean
  readonly children: ReactNode
}

export function Button ({
  variant = 'primary',
  size,
  loading = false,
  icon = false,
  children,
  disabled,
  className = '',
  ...props
}: ButtonProps) {
  const classes = [
    'button',
    variant,
    size,
    icon ? 'icon' : '',
    loading ? 'loading' : '',
    className,
  ].filter(Boolean).join(' ')

  return <button
    className={ classes }
    disabled={ disabled || loading }
    { ...props }>
    {children}
  </button>
}
