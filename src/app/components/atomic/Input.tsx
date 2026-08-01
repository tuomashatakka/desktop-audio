import type { InputHTMLAttributes } from 'react'


interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label?:        string
  readonly error?:        string
  readonly wrapperClass?: string
}

export function Input ({ label, error, id, className = '', wrapperClass = '', ...props }: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <label className={`field ${error ? 'error' : ''} ${wrapperClass}`.trim()}>
      {label && <span>{label}</span>}
      <input id={inputId} className={className || undefined} {...props} />
      {error && <small>{error}</small>}
    </label>
  )
}
