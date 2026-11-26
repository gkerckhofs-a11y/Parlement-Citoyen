import { check } from "./scenario.mjs";

export const walletCap = 3;
export const walletPoints = (s, id) => s.wallets?.[id] ?? 2;
function setPoints(s, id, value) {
  (s.wallets ??= {})[id] = value;
}

// Grants can arrive between a ballot and its cancellation. Keep the balance
// that would apply without that ballot, including any subsequently accepted grant.
export function creditPoint(s, id) {
  if (s.rulesVersion !== 2 || s.phase !== "Commissions" ||
      s.members[id]?.role !== "Citoyen" || !s.members[id].present ||
      walletPoints(s, id) >= walletCap) return false;
  setPoints(s, id, walletPoints(s, id) + 1);
  for (const p of s.polls) {
    if (p.walletUndo && Object.hasOwn(p.walletUndo, id))
      p.walletUndo[id] = Math.min(walletCap, p.walletUndo[id] + 1);
  }
  return true;
}

export function applyBallotPoints(s, p, id, choices, boost) {
  if (boost !== undefined) check(typeof boost === "boolean", "Renfort invalide.");
  if (boost) check(p.kind === "plenary" && !p.round && choices.length === 1,
    "Seul un vote de duel peut recevoir un renfort.");
  const delta = p.kind === "opinion" ? (choices.length ? -1 : 1) : boost ? -1 : 0;
  if (!delta) return;
  const before = walletPoints(s, id);
  check(before + delta >= 0, "Votre réserve est vide.");
  (p.walletUndo ??= {})[id] = before;
  setPoints(s, id, Math.min(walletCap, before + delta));
  if (boost) p.active[choices[0]] = (p.active[choices[0]] || 0) + 1;
}

export function cancelBallotPoints(s, p) {
  for (const [id, balance] of Object.entries(p.walletUndo || {})) setPoints(s, id, balance);
  delete p.walletUndo;
}
