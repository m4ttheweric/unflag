import React, { useState } from 'react';
import { UnflagDevPanel } from 'unflag/react/devtools';
import { defaultFlags, defaultPlan, type DemoFlags } from './rawConfig';
import { UnflagProvider, useFeatures, useUnflag } from './features/unflag.react';

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

export function App() {
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
