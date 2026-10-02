import { colorLabel } from '../lib/color';

export function Swatch({ color, size = 18, title }: { color: string; size?: number; title?: string }) {
  return (
    <span
      className="swatch"
      title={title ?? colorLabel(color)}
      style={{ background: color, width: size, height: size }}
      aria-label={title ?? colorLabel(color)}
    />
  );
}
