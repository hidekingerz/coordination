import { useEffect, useState } from 'react';
import type { ClothingItem } from './types';
import { loadWardrobe, saveWardrobe } from './lib/storage';
import { loadWearLog, mergeWearLogs, pruneWearLog, recordWear, removeWear, saveWearLog, type WearLog } from './lib/wear';
import { WardrobeView } from './components/WardrobeView';
import { SuggestView } from './components/SuggestView';

/** メイン画面 (条件・クローゼット・提案) と、クローゼットの編集画面 */
type View = 'main' | 'edit';

export default function App() {
  const [wardrobe, setWardrobe] = useState<ClothingItem[]>(() => loadWardrobe());
  const [view, setView] = useState<View>('main');
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
      </header>
      <main>
        {/* 編集画面へ行っても条件や着たい服が消えないよう、メイン画面は隠すだけにする */}
        <div hidden={view !== 'main'}>
          <SuggestView
            wardrobe={wardrobe}
            wearLog={wearLog}
            onWear={wear}
            onUnwear={unwear}
            onEdit={() => setView('edit')}
            onChangeWardrobe={changeWardrobe}
            onImportWearLog={importWearLog}
          />
        </div>
        {view === 'edit' && (
          <WardrobeView
            wardrobe={wardrobe}
            wearLog={wearLog}
            onChange={changeWardrobe}
            onWear={wear}
            onUnwear={unwear}
            onImportWearLog={importWearLog}
            onBack={() => setView('main')}
          />
        )}
      </main>
      <footer className="app-footer">データはこのブラウザ内 (localStorage) にのみ保存されます。</footer>
    </div>
  );
}
