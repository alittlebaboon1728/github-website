// FIFO within a priority; cancelled queued work never reaches the provider.
export function createTaskQueue(concurrency) {
  let active = 0;
  const queue = [];
  function drain() {
    while (active < concurrency && queue.length) {
      queue.sort((a, b) => b.priority - a.priority);
      const work = queue.shift();
      work.signal?.removeEventListener("abort", work.cancel);
      if (work.signal?.aborted) {
        work.reject(work.signal.reason);
        continue;
      }
      active++;
      Promise.resolve()
        .then(work.task)
        .then(work.resolve, work.reject)
        .finally(() => {
          active--;
          drain();
        });
    }
  }
  return (task, { priority = 0, signal } = {}) =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      const work = {
        task,
        priority,
        signal,
        resolve,
        reject,
        cancel: () => {
          const index = queue.indexOf(work);
          if (index >= 0) queue.splice(index, 1);
          reject(signal.reason);
        },
      };
      signal?.addEventListener("abort", work.cancel, { once: true });
      queue.push(work);
      drain();
    });
}

export function concurrencySetting(value, fallback, max = 8) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= max
    ? number
    : fallback;
}
