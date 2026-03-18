import type { InputHTMLAttributes } from 'react'


interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label?: string
  readonly error?: string
}

export function Input ({ label, error, id, className = '', ...props }: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <label className={`field ${error ? 'error' : ''}`}>
      {label && <span>{label}</span>}
      <input id={inputId} className={`input ${className}`} {...props} />
      {error && <small>{error}</small>}
    </label>
  )
}
