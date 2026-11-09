export const Icon = ({ d, size, children }) => (
  <svg className="i" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">{d ? <path d={d} /> : children}</svg>
);
