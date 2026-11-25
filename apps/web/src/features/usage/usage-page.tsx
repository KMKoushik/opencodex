import { useState } from 'react';
import { SegmentedControl } from '../../components/ui/segmented-control';
import { UsageLimitsView } from './usage-limits';
import { UsageOverview } from './usage-overview';
import './usage.css';

type Tab = 'overview' | 'limits';
const tabs: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'limits', label: 'Limits' },
];

export function UsagePage({ connected }: { connected: boolean }) {
  const [tab, setTab] = useState<Tab>('overview');
  return (
    <>
      <header className="usage-header">
        <h1>Usage</h1>
        <SegmentedControl label="Usage view" value={tab} options={tabs} onChange={setTab} />
      </header>
      {tab === 'overview' ? (
        <UsageOverview connected={connected} />
      ) : (
        <UsageLimitsView connected={connected} />
      )}
    </>
  );
}
