import { useEffect, useState } from 'react';
import type { ClothingItem } from './types';
import { loadWardrobe, saveWardrobe } from './lib/storage';
import { WardrobeView } from './components/WardrobeView';
import { SuggestView } from './components/SuggestView';

type Tab = 'suggest' | 'wardrobe';

export default function App() {
  const [wardrobe, setWardrobe] = useState<ClothingItem[]>(() => loadWardrobe());
  const [tab, setTab] = useState<Tab>(() => (loadWardrobe().length ? 'suggest' : 'wardrobe'));

  useEffect(() => {
    saveWardrobe(wardrobe);
  }, [wardrobe]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Coordination</h1>
        <p className="tagline">手持ちの服から、今日の季節と色味に合うコーデを提案します</p>
        <nav className="tabs">
          <button type="button" className={tab === 'suggest' ? 'on' : ''} onClick={() => setTab('suggest')}>
            コーデ提案
          </button>
          <button type="button" className={tab === 'wardrobe' ? 'on' : ''} onClick={() => setTab('wardrobe')}>
            クローゼット <span className="count">{wardrobe.length}</span>
          </button>
        </nav>
      </header>
      <main>
        {tab === 'suggest' ? (
          <SuggestView wardrobe={wardrobe} />
        ) : (
          <WardrobeView wardrobe={wardrobe} onChange={setWardrobe} />
        )}
      </main>
      <footer className="app-footer">データはこのブラウザ内 (localStorage) にのみ保存されます。</footer>
    </div>
  );
}
