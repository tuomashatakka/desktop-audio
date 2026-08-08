/* eslint-disable react-strict/no-style-prop -- Width and height are the
   component's whole API: callers size a placeholder to the content it stands
   in for. */
interface SkeletonProps {
  readonly width?:  string | number
  readonly height?: string | number
  readonly count?:  number
}

export function Skeleton ({ width = '100%', height = '0.8em', count = 1 }: SkeletonProps) {
  return <>
    {Array.from({ length: count }, (_, i) =>
      <div
        key={ i }
        className='skeleton'
        style={{ width, height }}
        aria-hidden='true' />
    )}
  </>
}
