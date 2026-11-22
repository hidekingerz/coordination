import { screen, within } from '@testing-library/react';

/** クローゼットのグリッド (開いているときだけある) */
export const closetGrid = () => screen.getByRole('group', { name: 'クローゼットの服' });

/**
 * 名前でタイルを取る。タイルの読み上げ名は見えている文字そのもの (ブランド・名前・着用状況) なので、
 * 名前を含むものを探す。選択状態は aria-pressed で見る。
 */
export const closetTile = (name: string) => within(closetGrid()).getByRole('button', { name: (accName) => accName.includes(name) });

/** 今グリッドに見えている服の名前 (並び順のまま) */
export const closetTileNames = () => {
  const grid = screen.queryByRole('group', { name: 'クローゼットの服' });
  return grid ? within(grid).queryAllByRole('button').map((b) => b.querySelector('.tile-name')?.textContent ?? '') : [];
};
