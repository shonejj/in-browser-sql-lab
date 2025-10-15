export type NotebookDoc = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  cells: Array<{ id: string; type: 'markdown' | 'code'; content: string }>;
};

const STORAGE_KEY = 'sqllab:notebooks:v1';

function readStore(): NotebookDoc[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as NotebookDoc[];
  } catch (e) {
    console.warn('Failed to read notebooks from storage', e);
    return [];
  }
}

function writeStore(list: NotebookDoc[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function listNotebooks(): NotebookDoc[] {
  return readStore();
}

export function createNotebook(title = 'Untitled'): NotebookDoc {
  const now = Date.now();
  const nb: NotebookDoc = {
    id: `nb_${now}_${Math.random().toString(36).slice(2,8)}`,
    title,
    createdAt: now,
    updatedAt: now,
    cells: [],
  };
  const all = readStore();
  all.unshift(nb);
  writeStore(all);
  return nb;
}

export function getNotebook(id: string): NotebookDoc | undefined {
  return readStore().find(n => n.id === id);
}

export function deleteNotebook(id: string) {
  const all = readStore().filter(n => n.id !== id);
  writeStore(all);
}

export function saveNotebook(nb: NotebookDoc) {
  const all = readStore().filter(n => n.id !== nb.id);
  nb.updatedAt = Date.now();
  all.unshift(nb);
  writeStore(all);
}
