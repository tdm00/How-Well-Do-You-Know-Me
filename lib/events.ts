type Listener = () => void;

const channels = new Map<string, Set<Listener>>();

export function subscribe(code: string, listener: Listener): () => void {
  const key = code.toUpperCase();
  let set = channels.get(key);
  if (!set) {
    set = new Set();
    channels.set(key, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
    if (set && set.size === 0) channels.delete(key);
  };
}

export function publish(code: string): void {
  const set = channels.get(code.toUpperCase());
  if (!set) return;
  for (const listener of set) listener();
}
