import { useState } from 'react'
import type { FormEvent } from 'react'
import { Dialog } from './Dialog'
import { Input } from './Input'
import { Button } from './Button'


interface PromptDialogProps {
  readonly open:        boolean
  readonly title:       string
  readonly placeholder: string
  readonly onConfirm:   (value: string) => void
  readonly onClose:     () => void
}

export function PromptDialog ({ open, title, placeholder, onConfirm, onClose }: PromptDialogProps) {
  const [ value, setValue ] = useState('')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!value.trim())
      return
    onConfirm(value.trim())
    setValue('')
    onClose()
  }

  const handleClose = () => {
    setValue('')
    onClose()
  }

  return (
    <Dialog open={open} onClose={handleClose} title={title}>
      <form onSubmit={handleSubmit} className='prompt-form'>
        <Input
          placeholder={placeholder}
          value={value}
          onChange={e =>
            setValue(e.target.value)}
          autoFocus
        />

        <div className='prompt-actions'>
          <Button variant='ghost' type='button' onClick={handleClose}>Cancel</Button>
          <Button variant='primary' type='submit' disabled={!value.trim()}>OK</Button>
        </div>
      </form>
    </Dialog>
  )
}
