import React, { useMemo, useState } from 'react';
import { createUnflagReact } from 'unflag/react';
import { UnflagDevPanel } from 'unflag/react/devtools';
import { defaultFlags, defaultPlan, type DemoFlags } from './rawConfig';
import { UnflagProvider, useFeatures, useUnflag } from './features/unflag.react';
import { buildStressDial, buildStressFeatureSet } from './features/stress.features';

function Desk() {
  const features = useFeatures();
  return (
    <main style={{ font: '15px system-ui', padding: 24, maxWidth: 640 }}>
      <h1>Support Desk</h1>
      <p>
        Chat: <strong>{features.ticketChat}</strong>
      </p>
      <p>Attachments: <strong>{features.attachments ? 'available' : 'unavailable'}</strong></p>
      <p>
        Open-ticket limit: <strong>{features.ticketLimits.maxOpen}</strong>
        {features.ticketLimits.upgradeNudge ? ' (upgrade for more)' : ''}
      </p>
    </main>
  );
}

function NormalApp() {
  const [flags, setFlags] = useState<DemoFlags>(defaultFlags);
  return (
    <UnflagProvider inputs={{ flags, plan: defaultPlan }} enableOverrides storageKey="unflag.support-desk">
      <Desk />
      <fieldset style={{ margin: 24, maxWidth: 640, font: '13px system-ui' }}>
        <legend>simulated raw flags (the thing app code never reads)</legend>
        {Object.keys(flags).map(k => (
          <label key={k} style={{ display: 'block' }}>
            <input
              type="checkbox"
              checked={flags[k as keyof DemoFlags]}
              onChange={e => setFlags(f => ({ ...f, [k]: e.target.checked }))}
            />{' '}
            {k}
          </label>
        ))}
      </fieldset>
      <UnflagDevPanel useUnflag={useUnflag} />
    </UnflagProvider>
  );
}

// Stress mode reads `?stress=N` once at module load: the page is reloaded (not
// re-rendered) to change N, so a module-scope cache keyed on N is sufficient
// to guarantee `createUnflagReact` (and the feature set it wraps) is built at
// most once per page load, never once per React render.
let stressFactoryCache: { count: number; factory: ReturnType<typeof createUnflagReact> } | undefined;

function getStressFactory(count: number) {
  if (!stressFactoryCache || stressFactoryCache.count !== count) {
    stressFactoryCache = { count, factory: createUnflagReact(buildStressFeatureSet(count)) };
  }
  return stressFactoryCache.factory;
}

function StressDesk({ useStressFeatures }: { useStressFeatures: () => Record<string, unknown> }) {
  const features = useStressFeatures();
  const sampleKeys = ['feature0', 'feature1', 'feature2', 'feature29', 'feature32'].filter(
    k => k in features,
  );
  return (
    <main style={{ font: '15px system-ui', padding: 24, maxWidth: 640 }}>
      <h1>Stress mode: {Object.keys(features).length} features</h1>
      <p>Sampled feature values:</p>
      <ul>
        {sampleKeys.map(k => (
          <li key={k}>
            <strong>{k}</strong>: {JSON.stringify(features[k])}
          </li>
        ))}
      </ul>
    </main>
  );
}

function StressApp({ count }: { count: number }) {
  const { UnflagProvider: StressProvider, useFeatures: useStressFeatures, useUnflag: useStressUnflag } =
    useMemo(() => getStressFactory(count), [count]);
  const dial = useMemo(() => buildStressDial(count), [count]);

  return (
    <StressProvider inputs={{ dial }} enableOverrides storageKey="unflag.stress">
      <StressDesk useStressFeatures={useStressFeatures} />
      <UnflagDevPanel useUnflag={useStressUnflag} />
    </StressProvider>
  );
}

const stressCount = (() => {
  if (typeof window === 'undefined') return 0;
  const raw = new URLSearchParams(window.location.search).get('stress');
  const n = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
})();

export function App() {
  if (stressCount > 0) {
    return <StressApp count={stressCount} />;
  }
  return <NormalApp />;
}
