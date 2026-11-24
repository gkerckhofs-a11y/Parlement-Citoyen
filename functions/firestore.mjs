import { gzipSync, gunzipSync } from "node:zlib";
const encode = (value) => gzipSync(JSON.stringify(value));
const decode = (bytes) => JSON.parse(gunzipSync(bytes));
const chunkSize = 480 * 1024;
function splitState(s) {
  const { pack, ...state } = s,
    bytes = encode(state),
    parts = [];
  for (let offset = 0; offset < bytes.length; offset += chunkSize)
    parts.push(bytes.subarray(offset, offset + chunkSize));
  return parts;
}
export function firestoreStore(db) {
  const ref = (id) => db.collection("parlements").doc(id);
  const piece = (doc, i) => doc.collection("state").doc(String(i));
  const scenario = (doc) => doc.collection("config").doc("version");
  async function load(doc, tx) {
    const read = (r) => tx.get(r),
      head = await read(doc);
    if (!head.exists) throw Error("Session introuvable");
    const count = head.get("count"),
      snaps = await Promise.all([
        read(scenario(doc)),
        ...Array.from({ length: count }, (_, i) => read(piece(doc, i))),
      ]);
    return {
      count,
      s: {
        ...decode(Buffer.concat(snaps.slice(1).map((s) => s.get("payload")))),
        pack: decode(snaps[0].get("payload")),
      },
    };
  }
  // Buffer simultaneous actions briefly. Firestore arbitrates between instances.
  // Each command has its own rollback boundary inside the durable transaction.
  const queues = new Map();
  async function flush(id) {
    const batch = queues.get(id);
    if (!batch) return;
    queues.delete(id);
    clearTimeout(batch.timer);
    const doc = ref(id);
    try {
      const results = await db.runTransaction(
        async (tx) => {
          let { s, count } = await load(doc, tx);
          const outcomes = [];
          for (const item of batch.items) {
            const { pack, ...current } = s,
              next = { ...structuredClone(current), pack };
            try {
              const value = item.fn(next);
              s = next;
              outcomes.push({ value });
            } catch (err) {
              outcomes.push({ error: err.message });
            }
          }
          if (outcomes.some((o) => !o.error)) {
            const parts = splitState(s);
            tx.update(doc, { count: parts.length });
            parts.forEach((payload, i) => tx.set(piece(doc, i), { payload }));
            for (let i = parts.length; i < count; i++) tx.delete(piece(doc, i));
          }
          return outcomes;
        },
        { maxAttempts: 12 },
      );
      results.forEach((r, i) =>
        r.error
          ? batch.items[i].reject(Error(r.error))
          : batch.items[i].resolve(r.value),
      );
    } catch (err) {
      batch.items.forEach((q) => q.reject(err));
    }
  }
  return {
    async create(s) {
      const doc = ref(s.code),
        batch = db.batch(),
        parts = splitState(s);
      batch.create(doc, { count: parts.length });
      batch.create(scenario(doc), { payload: encode(s.pack) });
      parts.forEach((payload, i) => batch.create(piece(doc, i), { payload }));
      await batch.commit();
    },
    get: (id) =>
      db.runTransaction(async (tx) => (await load(ref(id), tx)).s, {
        readOnly: true,
      }),
    change: (id, fn) =>
      new Promise((resolve, reject) => {
        let q = queues.get(id);
        if (!q) {
          q = { items: [], timer: setTimeout(() => flush(id), 15) };
          queues.set(id, q);
        }
        q.items.push({ fn, resolve, reject });
        if (q.items.length >= 150) void flush(id);
      }),
  };
}
