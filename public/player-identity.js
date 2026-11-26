// These colours and marks belong to game roles and territory assignments.
// Commission and vote colours have their own meaning elsewhere in the game.
const roles = new Map([
  ["Citoyen", {roleKey:"citizen", roleLabel:"Citoyen", color:"#17557e", pale:"#e9f3f9",
    icon:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><path d="M16 3.128a4 4 0 0 1 0 7.744" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><circle cx="9" cy="7" r="4" />'}],
  ["Journaliste", {roleKey:"press", roleLabel:"Journaliste", color:"#692f64", pale:"#f7edf5",
    icon:'<path d="M15 18h-5" /><path d="M18 14h-8" /><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2" /><rect width="8" height="4" x="10" y="6" rx="1" />'}],
  ["Lobby", {roleKey:"lobby", roleLabel:"Lobbyiste", color:"#854317", pale:"#fbf0e3",
    icon:'<path d="m11 17 2 2a1 1 0 1 0 3-3" /><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" /><path d="m21 3 1 11h-2" /><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3" /><path d="M3 4h8" />'}],
]);
const territories = [
  {territoryColor:"#2459a1", markName:"Cercle", mark:'<circle cx="12" cy="12" r="8.5"/>'},
  {territoryColor:"#086a6e", markName:"Losange", mark:'<path d="m12 2 10 10-10 10L2 12Z"/>'},
  {territoryColor:"#344d78", markName:"Triangle", mark:'<path d="M12 2 22 21H2Z"/>'},
  {territoryColor:"#3b5793", markName:"Carré", mark:'<rect x="3.5" y="3.5" width="17" height="17"/>'},
  {territoryColor:"#00657d", markName:"Hexagone", mark:'<path d="m7 3 10 0 5 9-5 9H7l-5-9Z"/>'},
  {territoryColor:"#4b478a", markName:"Étoile", mark:'<path d="m12 1.5 3.1 6.6 7.3.9-5.4 5 1.5 7.3L12 17.7l-6.5 3.6L7 14l-5.4-5 7.3-.9Z"/>'},
  {territoryColor:"#485f72", markName:"Trois barres", mark:'<path d="M3 4h18v3H3zm0 6.5h18v3H3zM3 17h18v3H3z"/>'},
];
const neutral = {roleKey:"", roleLabel:"", color:"#1c3443", pale:"#eef1ef", icon:""};

export function identityTheme(person) {
  const role = roles.get(person?.role) || neutral;
  const assignment = person?.role === "Citoyen" && /^T(\d+)$/.exec(person.group || "");
  const index = assignment ? Number(assignment[1]) : -1;
  const territory = index >= 0 ? territories[index % territories.length] : null;
  return {
    ...role, territoryColor:territory?.territoryColor || role.color,
    territoryLabel:role.roleKey === "citizen" ? person.groupName || person.territory || "" : "",
    markName:territory?.markName || role.roleLabel, mark:territory?.mark || "",
    // Extra territories in custom scenarios share a shape and gain a visible number.
    series:index >= territories.length ? Math.floor(index / territories.length) + 1 : 0,
  };
}

export function identityStyle(person) {
  const theme = identityTheme(person);
  return "--role-color:" + theme.color + ";--role-pale:" + theme.pale + ";--territory-color:" + theme.territoryColor;
}

export function roleMark(person) {
  const theme = identityTheme(person);
  return '<svg class="identity-symbol" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">' + theme.icon + '</svg>';
}
export function identityMark(person) {
  const theme = identityTheme(person);
  if (!theme.mark) return roleMark(person);
  const layers = theme.series
    ? '<g transform="translate(0,4) scale(.66)">' + theme.mark + '</g><text x="20" y="17" font-family="sans-serif" font-weight="bold" font-size="9" text-anchor="middle">' + theme.series + '</text>'
    : theme.mark;
  return '<svg class="identity-symbol" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="currentColor">' + layers + '</svg>';
}
