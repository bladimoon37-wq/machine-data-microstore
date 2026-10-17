import { openDB } from 'idb';
import { key, type RecordRow } from './core';

const db = () =>
  openDB('machine-data-microstore-v1', 1, {
    upgrade(d) {
      if (!d.objectStoreNames.contains('records')) {
        d.createObjectStore('records');
      }
    },
  });

export async function all() {
  return (await db()).getAll('records') as Promise<RecordRow[]>;
}

export async function clear() {
  const d = await db();
  await d.clear('records');
}

export async function remove(r: RecordRow) {
  const d = await db();
  await d.delete('records', key(r));
}

export async function add(rows: RecordRow[]) {
  const d = await db();
  const tx = d.transaction('records', 'readwrite');

  let added = 0;
  let duplicate = 0;
  const conflicts: string[] = [];
  const incoming = new Map<string, RecordRow>();

  for (const r of rows) {
    const k = key(r);
    const prev =
      incoming.get(k) ??
      ((await tx.store.get(k)) as RecordRow | undefined);

    if (prev) {
      if (prev.value === r.value && prev.unit === r.unit) {
        duplicate++;
      } else {
        conflicts.push(k);
      }
      continue;
    }

    incoming.set(k, r);
    await tx.store.put(r, k);
    added++;
  }

  await tx.done;

  return {
    added,
    duplicate,
    conflicts,
  };
}