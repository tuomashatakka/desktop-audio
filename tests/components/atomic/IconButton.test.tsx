import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { IconButton } from '../../../src/app/components/atomic/IconButton'

describe('IconButton', () => {
  it('renders button with children', () => {
    render(<IconButton label='Play'>▶</IconButton>)
    expect(screen.getByRole('button')).toHaveTextContent('▶')
  })

  it('uses label as aria-label', () => {
    render(<IconButton label='Play'>▶</IconButton>)
    expect(screen.getByRole('button')).toHaveAccessibleName('Play')
  })

  it('renders with different sizes', () => {
    const { rerender } = render(<IconButton label='Small' size='sm'>S</IconButton>)
    expect(screen.getByRole('button')).toHaveClass('sm')

    rerender(<IconButton label='Large' size='lg'>L</IconButton>)
    expect(screen.getByRole('button')).toHaveClass('lg')
  })

  it('has icon class', () => {
    render(<IconButton label='Icon'>I</IconButton>)
    expect(screen.getByRole('button')).toHaveClass('icon')
  })

  it('is disabled when disabled prop is passed', () => {
    render(<IconButton label='Disabled' disabled>X</IconButton>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('applies additional props to button element', () => {
    render(<IconButton label='Test' type='button' name='icon-btn'>+</IconButton>)
    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('type', 'button')
    expect(button).toHaveAttribute('name', 'icon-btn')
  })
})
