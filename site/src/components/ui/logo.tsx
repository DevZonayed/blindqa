// The blindqa mark: the robot's cursor on a dark tile (same shape as the favicon and social preview).
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#0b1020" stroke="rgb(96 165 250 / 0.35)" />
      <path d="M10 7l6.5 17.5 2.3-6.9L25.5 15z" fill="#60a5fa" />
    </svg>
  )
}
