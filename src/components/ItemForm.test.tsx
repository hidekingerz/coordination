// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ClothingItem } from '../types';
import { ItemForm } from './ItemForm';

afterEach(cleanup);

function renderForm(initial?: ClothingItem) {
  const onSubmit = vi.fn<(item: ClothingItem) => void>();
  render(<ItemForm initial={initial} onSubmit={onSubmit} onCancel={() => {}} />);
  return { onSubmit };
}

const nameInput = () => screen.getByPlaceholderText('例: 白の無地Tシャツ');
const brandInput = () => screen.getByPlaceholderText('例: ユニクロ');
const categorySelect = () => screen.getByLabelText('カテゴリ') as HTMLSelectElement;
const submit = () => fireEvent.submit(document.querySelector('form')!);

describe('ItemForm validation', () => {
  it('requires a name', () => {
    const { onSubmit } = renderForm();
    submit();
    expect(screen.getByText('名前を入力してください')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('requires at least one season', () => {
    const { onSubmit } = renderForm();
    fireEvent.change(nameInput(), { target: { value: '白T' } });
    // 既定で選ばれている春と秋を外す
    fireEvent.click(screen.getByLabelText('春'));
    fireEvent.click(screen.getByLabelText('秋'));
    submit();
    expect(screen.getByText('季節を1つ以上選んでください')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects a malformed main colour', () => {
    const { onSubmit } = renderForm();
    fireEvent.change(nameInput(), { target: { value: '白T' } });
    fireEvent.change(screen.getAllByPlaceholderText('#rrggbb')[0], { target: { value: 'white-ish' } });
    submit();
    expect(screen.getByText('色は #rrggbb 形式で入力してください')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('ItemForm submission', () => {
  it('trims the brand and omits shape for non-bottoms', () => {
    const { onSubmit } = renderForm();
    fireEvent.change(nameInput(), { target: { value: '  白T  ' } });
    fireEvent.change(brandInput(), { target: { value: '  ユニクロ ' } });
    submit();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const item = onSubmit.mock.calls[0][0];
    expect(item).toMatchObject({ name: '白T', brand: 'ユニクロ', category: 'tops' });
    expect(item.shape).toBeUndefined();
    expect(item.id).toBeTruthy();
  });

  it('shows the shape field only for bottoms and submits the chosen shape', () => {
    const { onSubmit } = renderForm();
    expect(screen.queryByLabelText('形')).toBeNull();
    fireEvent.change(nameInput(), { target: { value: 'スカート' } });
    fireEvent.change(categorySelect(), { target: { value: 'bottoms' } });
    fireEvent.change(screen.getByLabelText('形'), { target: { value: 'skirt' } });
    submit();
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ category: 'bottoms', shape: 'skirt' });
  });

  it('keeps the id and createdAt when editing an existing item', () => {
    const existing: ClothingItem = {
      id: 'keep-me',
      name: '旧名',
      category: 'shoes',
      color: '#111111',
      seasons: ['winter'],
      warmth: 4,
      formality: 'smart',
      tags: [],
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const { onSubmit } = renderForm(existing);
    fireEvent.change(nameInput(), { target: { value: '新名' } });
    submit();
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ id: 'keep-me', name: '新名', createdAt: '2026-01-01T00:00:00.000Z' });
  });
});
