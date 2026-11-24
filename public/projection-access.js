// A wall uses its own per-tab credential. A clean URL can be reopened by the organiser.
const roomCode = /^[A-Z][A-Z0-9]{0,7}$/;
const sessionCode = /^[A-F0-9]{10}$/;
const reservedScopes = ["GENERAL", "PL", "NEWS"];
export function screenScope(screen) {
  if (screen.room && roomCode.test(screen.room))
    return reservedScopes.includes(screen.room)
      ? "salle/" + screen.room
      : screen.room;
  if (screen.id === "ECR" || screen.id === "ECR-GEN") return "GENERAL";
  if (screen.id === "ECR-PL" || screen.id === "ECR-PLENIERE-PUBLIQUE")
    return "PL";
  if (screen.id === "ECR-NEWS" || screen.id === "ECR-PRESSE-PUBLIQUE")
    return "NEWS";
  const room = /^ECR-([A-Z][A-Z0-9]{0,7})$/.exec(screen.id)?.[1];
  return room ? (reservedScopes.includes(room) ? "salle/" + room : room) : "";
}

export function projectionRoute(path) {
  const match =
    /^\/projection\/([A-F0-9]{10})\/((?:salle\/)?[A-Z][A-Z0-9]{0,7})\/?$/.exec(
      path,
    );
  if (!match) return null;
  const [, code, scope] = match;
  const room = scope.startsWith("salle/")
    ? scope.slice(6)
    : !reservedScopes.includes(scope)
      ? scope
      : "";
  return { code, scope, room };
}

export function projectionLink(code, screen) {
  const scope = screenScope(screen);
  if (!sessionCode.test(code) || !scope || !screen.key) return "";
  return (
    "/projection/" +
    code +
    "/" +
    scope +
    "#" +
    new URLSearchParams({ id: screen.id, key: screen.key })
  );
}

export function screenForScope(state, scope) {
  if (scope === "PL") return state.plenaryScreen;
  if (scope === "GENERAL")
    return (
      state.generalScreen ||
      state.roster?.find((a) => a.id === "ECR" && a.role === "Projection")
    );
  if (scope === "NEWS")
    return (
      state.pressScreen ||
      state.roster?.find(
        (a) => !a.room && a.role === "Projection" && screenScope(a) === "NEWS",
      )
    );
  const room = scope.startsWith("salle/") ? scope.slice(6) : scope;
  const screen =
    Object.hasOwn(state.roomScreens || {}, room) && state.roomScreens[room];
  return screen ? { ...screen, room } : null;
}
