import type { ProjectDecisionStatusValue } from "../domain/project-decision";

export function getSimplifiedNextActions(status: ProjectDecisionStatusValue) {
  if (status === "READY_TO_BUY") {
    return ["Zatraži uzorak", "Kontaktiraj dobavljača", "Izvezi PDF"];
  }
  if (status === "NEGOTIATE_FIRST") {
    return ["Predloži poruku", "Traži bolju cenu", "Traži manji MOQ", "Izvezi PDF"];
  }
  if (status === "DO_NOT_BUY") {
    return ["Pronađi nove ponude", "Ubaci drugi link", "Sačuvaj razlog"];
  }
  return ["Generiši odluku"];
}
