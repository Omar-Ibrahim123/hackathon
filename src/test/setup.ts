import "@testing-library/jest-dom/vitest";

// Node 22+ defines an experimental global localStorage that is undefined
// unless Node is launched with --localstorage-file, and it shadows jsdom's
// implementation in the vitest environment. Give tests a real Storage.
if (globalThis.localStorage == null) {
  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(String(key), String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
  });
}
