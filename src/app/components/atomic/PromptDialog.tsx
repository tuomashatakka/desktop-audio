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

  const handleSubmit = (event: FormEvent) => {
    if (!value.trim()) {
      event.preventDefault()
      return
    }

    onConfirm(value.trim())
    setValue('')
  }

  const handleClose = () => {
    setValue('')
    onClose()
  }

  return <Dialog open={ open } title={ title } onClose={ handleClose }>
    <form className='prompt-form' method='dialog' onSubmit={ handleSubmit }>
      <Input
        placeholder={ placeholder }
        required
        value={ value }
        autoFocus
        onChange={ e =>
          setValue(e.target.value) } />

      <div className='prompt-actions'>
        <Button variant='ghost' type='button' onClick={ handleClose }>Cancel</Button>
        <Button variant='primary' type='submit' disabled={ !value.trim() }>OK</Button>
      </div>
    </form>
  </Dialog>
}
