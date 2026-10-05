import type { ReactNode } from 'react';
import type { FigurePart } from '../lib/figure';

interface Props {
  parts: FigurePart[];
  /** 表示幅 (px)。高さは 1:2 で決まる */
  width?: number;
}

/**
 * コーデを人型のシルエットに重ねて描く。
 * 座標は viewBox 0 0 120 240 固定。奥から手前の順に parts を描画する。
 */
export function OutfitFigure({ parts, width = 120 }: Props) {
  return (
    <svg
      className="figure"
      viewBox="0 0 120 240"
      width={width}
      height={width * 2}
      role="img"
      aria-label={parts.length ? parts.map((p) => p.name).join('、') : 'コーデのイラスト'}
    >
      <g className="figure-body">
        <circle cx="60" cy="20" r="13" />
        <rect x="55" y="31" width="10" height="10" />
        <rect x="40" y="40" width="40" height="70" rx="6" />
        <rect x="28" y="42" width="11" height="66" rx="5" />
        <rect x="81" y="42" width="11" height="66" rx="5" />
        <rect x="43" y="106" width="15" height="104" rx="5" />
        <rect x="62" y="106" width="15" height="104" rx="5" />
      </g>
      {parts.map((p) => (
        <g key={p.itemId} className="figure-part" data-part={`${p.kind}:${p.variant}`}>
          <title>{p.name}</title>
          {shapeOf(p)}
        </g>
      ))}
    </svg>
  );
}

/** 袖。長袖は手首まで、半袖は二の腕まで、袖なしは描かない */
function sleeves(variant: FigurePart['variant'], fill: string): ReactNode {
  if (variant === 'sleeveless') return null;
  const length = variant === 'short' ? 28 : 64;
  return (
    <>
      <rect x="26" y="42" width="12" height={length} rx="5" fill={fill} />
      <rect x="82" y="42" width="12" height={length} rx="5" fill={fill} />
    </>
  );
}

function shapeOf(p: FigurePart): ReactNode {
  const fill = p.color;
  const accent = p.accent;
  switch (p.kind) {
    case 'shoes':
      return (
        <>
          <rect x="37" y="206" width="24" height="14" rx="5" fill={fill} />
          <rect x="59" y="206" width="24" height="14" rx="5" fill={fill} />
          {accent && (
            <>
              <rect x="37" y="216" width="24" height="4" rx="2" fill={accent} />
              <rect x="59" y="216" width="24" height="4" rx="2" fill={accent} />
            </>
          )}
        </>
      );
    case 'bottoms': {
      const body =
        p.variant === 'skirt' ? (
          // 腰から膝上に向けて広がる台形
          <path d="M40,102 H80 L90,166 H30 Z" fill={fill} />
        ) : p.variant === 'short' ? (
          <path d="M40,102 H80 V150 H62 V132 H58 V150 H40 Z" fill={fill} />
        ) : (
          <path d="M40,102 H80 V206 H62 V132 H58 V206 H40 Z" fill={fill} />
        );
      return (
        <>
          {body}
          {accent && <rect x="40" y="102" width="40" height="5" fill={accent} />}
        </>
      );
    }
    case 'tops':
      return (
        <>
          {sleeves(p.variant, fill)}
          <rect x="38" y="40" width="44" height="66" rx="4" fill={fill} />
          {accent && <path d="M50,40 L60,50 L70,40 Z" fill={accent} />}
        </>
      );
    case 'onepiece':
      return (
        <>
          {sleeves(p.variant, fill)}
          <path d="M38,40 H82 V88 L96,166 H24 L38,88 Z" fill={fill} />
          {accent && <rect x="38" y="86" width="44" height="5" fill={accent} />}
        </>
      );
    case 'outer': {
      const length = p.variant === 'long' ? 132 : 86;
      return (
        <>
          <rect x="22" y="38" width="34" height={length} rx="6" fill={fill} />
          <rect x="64" y="38" width="34" height={length} rx="6" fill={fill} />
          {accent && (
            <>
              <rect x="52" y="38" width="4" height={length} fill={accent} />
              <rect x="64" y="38" width="4" height={length} fill={accent} />
            </>
          )}
        </>
      );
    }
    case 'accessory':
      return (
        <>
          <rect x="47" y="33" width="26" height="10" rx="5" fill={fill} />
          <rect x="50" y="40" width="8" height="24" rx="3" fill={fill} />
          {accent && <rect x="50" y="52" width="8" height="4" fill={accent} />}
        </>
      );
  }
}
