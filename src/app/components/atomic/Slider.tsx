import type { InputHTMLAttributes } from 'react'


interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  readonly label?: string
}

export function Slider ({ label, id, className = '', ...props }: SliderProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <label className='field'>
      {label && <span>{label}</span>}
      <input type='range' className={`slider ${className}`} id={inputId} {...props} />
    </label>
  )
}
