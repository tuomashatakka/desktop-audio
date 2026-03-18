import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button } from '../../../src/app/components/atomic/Button'

describe('Button', () => {
  it('renders button with children', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByRole('button')).toHaveTextContent('Click me')
  })

  it('renders with different variants', () => {
    const { rerender } = render(<Button variant='primary'>Primary</Button>)
    expect(screen.getByRole('button')).toHaveClass('primary')

    rerender(<Button variant='secondary'>Secondary</Button>)
    expect(screen.getByRole('button')).toHaveClass('secondary')

    rerender(<Button variant='danger'>Danger</Button>)
    expect(screen.getByRole('button')).toHaveClass('danger')

    rerender(<Button variant='ghost'>Ghost</Button>)
    expect(screen.getByRole('button')).toHaveClass('ghost')

    rerender(<Button variant='outline'>Outline</Button>)
    expect(screen.getByRole('button')).toHaveClass('outline')
  })

  it('renders with different sizes', () => {
    const { rerender } = render(<Button size='sm'>Small</Button>)
    expect(screen.getByRole('button')).toHaveClass('sm')

    rerender(<Button size='lg'>Large</Button>)
    expect(screen.getByRole('button')).toHaveClass('lg')
  })

  it('renders as icon button when icon prop is true', () => {
    render(<Button icon>Icon</Button>)
    expect(screen.getByRole('button')).toHaveClass('icon')
  })

  it('shows loading state', () => {
    render(<Button loading>Loading</Button>)
    expect(screen.getByRole('button')).toHaveClass('loading')
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('is disabled when disabled prop is passed', () => {
    render(<Button disabled>Disabled</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('applies additional props to button element', () => {
    render(<Button type='submit' name='test-btn'>Submit</Button>)
    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('type', 'submit')
    expect(button).toHaveAttribute('name', 'test-btn')
  })
})
