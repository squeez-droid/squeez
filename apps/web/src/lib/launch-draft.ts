const DATABASE = "squeez-launch-drafts";
const STORE = "drafts";
const VERSION = 1;

interface StoredDraft<T> {
  id: string;
  form: T;
  updatedAt: number;
}

function openDraftDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the launch draft database."));
  });
}

async function transactStore<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await openDraftDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE, mode);
      const request = operation(transaction.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Launch draft storage failed."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Launch draft transaction was aborted."));
    });
  } finally {
    database.close();
  }
}

export async function readLaunchDraft<T>(id: string): Promise<T | null> {
  if (typeof indexedDB === "undefined") return null;
  const stored = await transactStore<StoredDraft<T> | undefined>("readonly", (store) => store.get(id));
  return stored?.form ?? null;
}

export async function saveLaunchDraft<T>(id: string, form: T): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await transactStore<IDBValidKey>("readwrite", (store) => store.put({ id, form, updatedAt: Date.now() }));
}

export async function deleteLaunchDraft(id: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await transactStore<undefined>("readwrite", (store) => store.delete(id));
}
