// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ClothingItem } from '../types';
import { ItemPicker } from './ItemPicker';

afterEach(cleanup);

const mk = (id: string, name: string, category: ClothingItem['category'], extra: Partial<ClothingItem> = {}): ClothingItem => ({
  id,
  name,
  category,
  color: '#8a8a8a',
  seasons: ['spring'],
  warmth: 3,
  formality: 'casual',
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});
const wardrobe = [
  mk('t1', '白の無地Tシャツ', 'tops', { brand: 'ユニクロ', tags: ['定番'] }),
  mk('t2', 'オックスフォードシャツ', 'tops', { brand: '無印良品' }),
  mk('b1', 'チノパン', 'bottoms', { brand: 'ユニクロ' }),
  mk('a1', 'レザーベルト', 'accessory'),
];

function renderPicker(selected: string[] = []) {
  const onChange = vi.fn<(ids: string[]) => void>();
  const onClose = vi.fn();
  render(<ItemPicker wardrobe={wardrobe} selected={selected} onChange={onChange} onClose={onClose} />);
  return { onChange, onClose };
}
const cards = () => screen.getAllByRole('button', { name: /選択/ });

describe('ItemPicker', () => {
  it('lists every item including accessories as selectable cards', () => {
    renderPicker();
    expect(cards()).toHaveLength(4);
    expect(screen.getByText('レザーベルト')).toBeTruthy();
  });

  it('filters by search text (name, brand, tag) and by category chips', () => {
    renderPicker();
    fireEvent.change(screen.getByPlaceholderText('名前・ブランド・タグで検索'), { target: { value: '無印' } });
    expect(cards()).toHaveLength(1);
    expect(screen.getByText('オックスフォードシャツ')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('名前・ブランド・タグで検索'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /^ボトムス/ }));
    expect(cards()).toHaveLength(1);
    expect(screen.getByText('チノパン')).toBeTruthy();
  });

  it('toggles selection and reports the full selected list', () => {
    const { onChange } = renderPicker(['t1']);
    const t1 = screen.getByRole('button', { name: /白の無地Tシャツ/ });
    const b1 = screen.getByRole('button', { name: /チノパン/ });
    expect(t1.getAttribute('aria-pressed')).toBe('true');
    expect(b1.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(b1);
    expect(onChange).toHaveBeenLastCalledWith(['t1', 'b1']);
    fireEvent.click(t1);
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('closes with the done button and with Escape', () => {
    const { onClose } = renderPicker();
    fireEvent.click(screen.getByRole('button', { name: '決定' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('shows how many are selected', () => {
    renderPicker(['t1', 'b1']);
    expect(within(screen.getByRole('dialog')).getByText('2 点選択中')).toBeTruthy();
  });
});
