/**
 * Travaux d'arrière-plan (index de recherche, préchauffage des langues…) : ils avancent
 * par petites tranches, et s'effacent dès que l'utilisateur manipule la télécommande,
 * pour que la navigation reste fluide sur une box TV.
 */
let lastActivity = 0;

export function noteActivity(): void {
  lastActivity = Date.now();
}

/** Délai avant la prochaine tranche : plus long juste après une touche. */
export function backgroundDelay(base = 16): number {
  const since = Date.now() - lastActivity;
  return since < 400 ? 400 - since + 50 : base;
}
