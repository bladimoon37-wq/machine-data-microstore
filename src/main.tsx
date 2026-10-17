import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { add, all, clear, remove } from './db';
import {
  exportCSV,
  parseCSV,
  stats,
  type Issue,
  type RecordRow,
} from './core';
import './style.css';

const SAMPLE = `machine_id,timestamp,metric,value,unit
CNC-001,2026-10-16T09:00:00Z,temperature,45.2,C
CNC-001,2026-10-16T09:01:00Z,temperature,46.1,C
CNC-002,2026-10-16T09:00:00Z,vibration,2.4,mm/s
PUMP-001,2026-10-16T09:00:00Z,pressure,4.8,bar
`;

function download(name: string, text: string) {
  const url = URL.createObjectURL(
    new Blob(['\uFEFF', text], { type: 'text/csv;charset=utf-8' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function App() {
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [message, setMessage] = useState('');
  const [machine, setMachine] = useState('');
  const [metric, setMetric] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = async () => setRecords(await all());

  useEffect(() => {
    refresh().catch((e) => setMessage(String(e)));
  }, []);

  async function ingest(text: string) {
    setBusy(true);

    try {
      const parsed = parseCSV(text);
      setIssues(parsed.issues);

      if (parsed.rows.length) {
        const r = await add(parsed.rows);

        setMessage(
          `Added ${r.added}; duplicates skipped ${r.duplicate}; conflicting keys ${r.conflicts.length}; invalid rows ${parsed.issues.length}.`,
        );

        if (r.conflicts.length) {
          setIssues((p) => [
            ...p,
            ...r.conflicts.slice(0, 100).map((k) => ({
              row: 0,
              reason: `Conflict (not overwritten): ${k}`,
            })),
          ]);
        }

        await refresh();
      } else {
        setMessage(`No valid rows imported. ${parsed.issues.length} issues.`);
      }
    } catch (e) {
      setMessage(`Import failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function file(f?: File) {
    if (!f) return;

    // Clear stale issues before validating a newly selected file.
    setIssues([]);

    if (f.size > 5 * 1024 * 1024) {
      setMessage('File exceeds 5 MB');
      return;
    }

    const text = await f.text();

    if (text.includes('\uFFFD')) {
      setMessage('Encoding error: expected UTF-8');
      return;
    }

    const parsed = PapaCount(text);

    if (parsed > 50000) {
      setMessage('File exceeds 50,000 data rows');
      return;
    }

    await ingest(text);
  }

  const filtered = useMemo(
    () =>
      records
        .filter(
          (r) =>
            (!machine ||
              r.machine_id.toLowerCase().includes(machine.toLowerCase())) &&
            (!metric || r.metric === metric) &&
            (!from ||
              r.timestamp >= new Date(from + 'T00:00:00Z').toISOString()) &&
            (!to ||
              r.timestamp <=
                new Date(to + 'T23:59:59.999Z').toISOString()) &&
            (!min || r.value >= Number(min)) &&
            (!max || r.value <= Number(max)),
        )
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    [records, machine, metric, from, to, min, max],
  );

  const units = [...new Set(filtered.map((r) => r.unit))];
  const metrics = [...new Set(filtered.map((r) => r.metric))];
  const machines = [...new Set(filtered.map((r) => r.machine_id))];

  // Numeric summary is meaningful only when all selected records share
  // the same metric and unit.
  const comparable = metrics.length === 1 && units.length === 1;

  const s = comparable
    ? stats(filtered)
    : {
        count: filtered.length,
        min: null,
        max: null,
        avg: null,
      };

  // A time-series line is shown only for one machine, one metric and one unit.
  const chartRows =
    machines.length === 1 && metrics.length === 1 && units.length === 1
      ? filtered.slice(-2000)
      : [];

  return (
    <main>
      <header>
        <span className="eyebrow">AION / PROJECT 2 · BET #05</span>
        <h1>Machine Data Microstore</h1>
        <p>
          Local-first measurement history for field engineers. No accounts, no
          cloud sync.
        </p>
      </header>

      <section>
        <h2>1. Import &amp; Store</h2>

        <div className="flex">
          <input
            aria-label="Upload CSV"
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(e) => file(e.target.files?.[0])}
          />
          <button disabled={busy} onClick={() => ingest(SAMPLE)}>
            Load sample data
          </button>
          <button onClick={() => download('sample.csv', SAMPLE)}>
            Download sample CSV
          </button>
        </div>

        <p className="muted">
          Required: machine_id, timestamp, metric, value, unit · UTF-8 · 5 MB ·
          50,000 rows · timestamps with timezone
        </p>

        {message && (
          <p role="status" className="notice">
            {message}
          </p>
        )}

        {issues.length > 0 && (
          <details open>
            <summary>Import issues ({issues.length})</summary>
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>CSV row</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.slice(0, 100).map((i, n) => (
                    <tr key={n}>
                      <td>{i.row || 'Conflict'}</td>
                      <td>{i.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {issues.length > 100 && <p>Showing first 100 issues.</p>}
          </details>
        )}
      </section>

      <section>
        <h2>2. Search &amp; Filter</h2>

        <div className="filters">
          <label>
            Machine ID
            <input
              value={machine}
              onChange={(e) => setMachine(e.target.value)}
              placeholder="CNC-001"
            />
          </label>

          <label>
            Metric
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
            >
              <option value="">All metrics</option>
              {[...new Set(records.map((r) => r.metric))]
                .sort()
                .map((m) => (
                  <option key={m}>{m}</option>
                ))}
            </select>
          </label>

          <label>
            From (UTC)
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>

          <label>
            To (UTC)
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>

          <label>
            Min value
            <input
              type="number"
              value={min}
              onChange={(e) => setMin(e.target.value)}
            />
          </label>

          <label>
            Max value
            <input
              type="number"
              value={max}
              onChange={(e) => setMax(e.target.value)}
            />
          </label>
        </div>

        <div className="stats">
          {[
            ['Stored', records.length],
            ['Matched', s.count],
            ['Min', s.min ?? '—'],
            ['Max', s.max ?? '—'],
            [
              'Average',
              s.avg === null ? '—' : Number(s.avg.toFixed(4)),
            ],
          ].map(([label, v]) => (
            <div key={label}>
              <small>{label}</small>
              <strong>{v}</strong>
            </div>
          ))}
        </div>

        <p className="muted">
          Values are comparable only when using the same metric and unit. Units
          in selection: {units.join(', ') || '—'}
        </p>
      </section>

      <section>
        <h2>3. Time Series</h2>
        <p className="muted">
          Showing up to 2,000 most recent matching points for one machine and
          metric. Chart is exploratory, not a calibrated instrument.
        </p>

        <div className="chart">
          {chartRows.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartRows}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={(x) => x.slice(11, 16)}
                  minTickGap={40}
                />
                <YAxis domain={['auto', 'auto']} />
                <Tooltip />
                <Line
                  dataKey="value"
                  stroke="#2563eb"
                  dot={chartRows.length < 80}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p>No chart data.</p>
          )}
        </div>
      </section>

      <section>
        <h2>4. Records &amp; Export</h2>

        <div className="flex">
          <button
            onClick={() =>
              download('microstore-filtered.csv', exportCSV(filtered))
            }
          >
            Export filtered ({filtered.length})
          </button>

          <button
            onClick={() => download('microstore-all.csv', exportCSV(records))}
          >
            Export all ({records.length})
          </button>

          <button
            className="danger"
            onClick={async () => {
              if (
                confirm('Permanently delete ALL locally stored measurements?')
              ) {
                await clear();
                await refresh();
              }
            }}
          >
            Delete all records
          </button>
        </div>

        <div className="scroll">
          <table>
            <thead>
              <tr>
                {[
                  'Machine',
                  'UTC timestamp',
                  'Metric',
                  'Value',
                  'Unit',
                  'Action',
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filtered.slice(0, 300).map((r) => (
                <tr key={r.machine_id + r.timestamp + r.metric}>
                  <td>{r.machine_id}</td>
                  <td>{r.timestamp}</td>
                  <td>{r.metric}</td>
                  <td>{r.value}</td>
                  <td>{r.unit}</td>
                  <td>
                    <button
                      className="tiny"
                      onClick={async () => {
                        await remove(r);
                        await refresh();
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length > 300 && (
          <p className="muted">
            Displaying first 300 of {filtered.length} matches; exports include
            all matches.
          </p>
        )}
      </section>

      <footer>
        Data is stored only in this browser&apos;s IndexedDB. Clearing browser
        storage, private browsing, device changes, or browser eviction may erase
        it. Export backups regularly. No automatic backups or cloud
        synchronization.
      </footer>
    </main>
  );
}

function PapaCount(text: string) {
  return Math.max(
    0,
    text
      .split(/\r\n|\n|\r/)
      .filter((x) => x.trim()).length - 1,
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
