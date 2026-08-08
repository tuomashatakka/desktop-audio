import type { InputHTMLAttributes, ReactNode } from 'react'


interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label?:          string
  readonly error?:          string
  readonly wrapperClass?:   string
  readonly startAdornment?: ReactNode
}

export function Input ({
  label,
  error,
  id,
  className = '',
  wrapperClass = '',
  startAdornment,
  ...props
}: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <label className={`field ${error ? 'error' : ''} ${wrapperClass}`.trim()}>
      {label && <span>{label}</span>}
      {startAdornment}
      <input id={inputId} className={className || undefined} {...props} />
      {error && <small>{error}</small>}
    </label>
  )
}
