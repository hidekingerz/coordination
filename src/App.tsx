import { useEffect, useState } from 'react';
import type { ClothingItem } from './types';
import { loadWardrobe, saveWardrobe } from './lib/storage';
import { loadWearLog, mergeWearLogs, pruneWearLog, recordWear, removeWear, saveWearLog, type WearLog } from './lib/wear';
import { WardrobeView } from './components/WardrobeView';
import { SuggestView } from './components/SuggestView';

type Tab = 'suggest' | 'wardrobe';

export default function App() {
  const [wardrobe, setWardrobe] = useState<ClothingItem[]>(() => loadWardrobe());
  const [tab, setTab] = useState<Tab>(() => (loadWardrobe().length ? 'suggest' : 'wardrobe'));
  const [wearLog, setWearLog] = useState<WearLog>(() => loadWearLog());

  useEffect(() => {
    saveWardrobe(wardrobe);
  }, [wardrobe]);

  useEffect(() => {
    saveWearLog(wearLog);
  }, [wearLog]);

  const wear = (itemIds: string[], date: string, outfitId?: string) =>
    setWearLog((log) => recordWear(log, itemIds, date, outfitId));
  const unwear = (itemIds: string[], date: string) => setWearLog((log) => removeWear(log, itemIds, date));

  /** クローゼットの変更。消えた服の履歴も一緒に落とす */
  const changeWardrobe = (next: ClothingItem[]) => {
    setWardrobe(next);
    setWearLog((log) => pruneWearLog(log, new Set(next.map((i) => i.id))));
  };
  const importWearLog = (incoming: WearLog) => setWearLog((log) => mergeWearLogs(log, incoming));

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
          <SuggestView wardrobe={wardrobe} wearLog={wearLog} onWear={wear} onUnwear={unwear} />
        ) : (
          <WardrobeView
            wardrobe={wardrobe}
            wearLog={wearLog}
            onChange={changeWardrobe}
            onWear={wear}
            onUnwear={unwear}
            onImportWearLog={importWearLog}
          />
        )}
      </main>
      <footer className="app-footer">データはこのブラウザ内 (localStorage) にのみ保存されます。</footer>
    </div>
  );
}
