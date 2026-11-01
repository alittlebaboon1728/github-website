import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

// One Node process owns this directory. Production must mount a persistent volume.
export function createStore(
  directory = process.env.OBSERVATORY_DATA_DIR || ".data",
  enabled = process.env.OBSERVATORY_PERSISTENCE !== "off",
) {
  const root = resolve(directory);
  let queue = Promise.resolve();
  return {
    enabled,
    async read(key, fallback = null) {
      if (!enabled) return fallback;
      try {
        return JSON.parse(await readFile(join(root, `${key}.json`), "utf8"));
      } catch (error) {
        if (error.code === "ENOENT") return fallback;
        throw error;
      }
    },
    update(key, transform) {
      if (!enabled) return Promise.resolve(null);
      const operation = queue.then(async () => {
        await mkdir(root, { recursive: true });
        const previous = await this.read(key);
        const next = await transform(previous);
        const target = join(root, `${key}.json`);
        const temp = `${target}.${process.pid}.tmp`;
        await writeFile(temp, JSON.stringify(next), "utf8");
        await rename(temp, target);
        return next;
      });
      queue = operation.catch(() => {});
      return operation;
    },
  };
}

export function createCache() {
  const entries = new Map();
  const pending = new Map();
  return async function cached(key, ttl, produce) {
    const entry = entries.get(key);
    if (entry && Date.now() - entry.savedAt < ttl)
      return { ...entry.result, source: "cache" };
    if (pending.has(key)) return pending.get(key);
    const operation = produce()
      .then((result) => {
        if (entries.size >= 160) entries.delete(entries.keys().next().value);
        entries.set(key, { savedAt: Date.now(), result });
        return result;
      })
      .finally(() => pending.delete(key));
    pending.set(key, operation);
    return operation;
  };
}

export async function boundedText(response, limit = 2_000_000) {
  if (Number(response.headers.get("content-length")) > limit)
    throw new Error("response-too-large");
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw new Error("response-too-large");
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks).toString("utf8");
}
