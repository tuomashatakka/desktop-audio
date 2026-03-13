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
  ...props
}: ButtonProps) {
  return (
    <button
      data-variant={variant}
      data-size={size}
      data-icon={icon || undefined}
      data-loading={loading || undefined}
      disabled={disabled || loading}
      {...props}
    >
      {children}
    </button>
  )
}
