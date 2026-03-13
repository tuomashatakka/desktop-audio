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
  ...props
}: IconButtonProps) {
  return (
    <button
      aria-label={label}
      data-icon
      data-size={size}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}
