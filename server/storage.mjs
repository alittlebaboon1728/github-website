import {
  mkdir,
  readFile,
  rename,
  writeFile,
  readdir,
  stat,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";

// One Node process owns this directory. Production must mount a persistent volume.
export function createStore(
  directory = process.env.OBSERVATORY_DATA_DIR || ".data",
  enabled = process.env.OBSERVATORY_PERSISTENCE !== "off",
) {
  const root = resolve(directory);
  let queue = Promise.resolve();
  let statistics, statisticsPending;
  const assetPath = (name) => {
    if (!/^[a-f0-9]{64}\.webp$/.test(name))
      throw new Error("invalid-image-key");
    return join(root, "images", name);
  };
  return {
    enabled,
    async readAsset(name) {
      if (!enabled) return null;
      try {
        return await readFile(assetPath(name));
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    },
    async hasAsset(name) {
      if (!enabled) return false;
      return stat(assetPath(name)).then(
        (info) => info.isFile(),
        () => false,
      );
    },
    async writeAsset(name, bytes) {
      if (!enabled) return;
      const target = assetPath(name);
      await mkdir(join(root, "images"), { recursive: true });
      const temp = `${target}.${randomUUID()}.tmp`;
      await writeFile(temp, bytes);
      await rename(temp, target);
    },
    async stats() {
      if (statistics && Date.now() - statistics.checkedAt < 5000)
        return statistics;
      if (statisticsPending) return statisticsPending;
      statisticsPending = (async () => {
        const result = {
          enabled,
          directory: root,
          files: 0,
          bytes: 0,
          cards: 0,
          pages: 0,
          trials: 0,
          images: 0,
          imageBytes: 0,
          checkedAt: Date.now(),
        };
        if (!enabled) return result;
        let entries;
        try {
          entries = await readdir(root, { withFileTypes: true });
        } catch (error) {
          if (error.code === "ENOENT") return result;
          throw error;
        }
        await Promise.all(
          entries
            .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
            .map(async (entry) => {
              const info = await stat(join(root, entry.name)).catch(() => null);
              if (!info) return;
              result.files++;
              result.bytes += info.size;
              if (/^card-[a-f0-9]+\.json$/.test(entry.name)) result.cards++;
              if (/^discovery-page-[a-f0-9]+-\d+\.json$/.test(entry.name))
                result.pages++;
            }),
        );
        const images = await readdir(join(root, "images")).catch(() => []);
        await Promise.all(
          images
            .filter((name) => /^[a-f0-9]{64}\.webp$/.test(name))
            .map(async (name) => {
              const info = await stat(assetPath(name)).catch(() => null);
              if (info) {
                result.images++;
                result.imageBytes += info.size;
                result.bytes += info.size;
                result.files++;
              }
            }),
        );
        const savedTrials = await this.read("project-trials", {});
        result.trials = Object.values(savedTrials || {}).filter(
          (trial) => trial && typeof trial.repo === "string",
        ).length;
        statistics = result;
        return result;
      })().finally(() => {
        statisticsPending = undefined;
      });
      return statisticsPending;
    },
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
