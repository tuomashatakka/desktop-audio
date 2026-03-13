import type { InputHTMLAttributes } from 'react'


interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  readonly label?: string
}

export function Slider ({ label, id, ...props }: SliderProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <label>
      {label && <span>{label}</span>}
      <input type='range' data-slider id={inputId} {...props} />
    </label>
  )
}
