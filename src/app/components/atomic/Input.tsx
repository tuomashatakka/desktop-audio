import type { InputHTMLAttributes } from 'react'


interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label?: string
  readonly error?: string
}

export function Input ({ label, error, id, ...props }: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <label data-state={error ? 'error' : undefined}>
      {label && <span>{label}</span>}
      <input id={inputId} {...props} />
      {error && <small>{error}</small>}
    </label>
  )
}
