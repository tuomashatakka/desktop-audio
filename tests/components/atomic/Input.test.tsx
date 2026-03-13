import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Input } from '../../../src/app/components/atomic/Input'

describe('Input', () => {
  it('renders input element', () => {
    render(<Input />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('renders with label', () => {
    render(<Input label='Username' />)
    expect(screen.getByText('Username')).toBeInTheDocument()
  })

  it('renders with error message', () => {
    render(<Input error='This field is required' />)
    expect(screen.getByText('This field is required')).toBeInTheDocument()
  })

  it('sets error state on label when error is provided', () => {
    render(<Input label='Email' error='Invalid email' />)
    const label = screen.getByText('Email').closest('label')
    expect(label).toHaveAttribute('data-state', 'error')
  })

  it('generates id from label if not provided', () => {
    render(<Input label='First Name' />)
    expect(screen.getByRole('textbox')).toHaveAttribute('id', 'first-name')
  })

  it('uses provided id', () => {
    render(<Input id='custom-id' label='Custom' />)
    expect(screen.getByRole('textbox')).toHaveAttribute('id', 'custom-id')
  })

  it('passes additional props to input element', () => {
    render(<Input placeholder='Enter text' value='test' readOnly />)
    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('placeholder', 'Enter text')
    expect(input).toHaveValue('test')
    expect(input).toHaveAttribute('readonly')
  })
})
