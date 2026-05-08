// Traducción de nombres de equipos/países al español
const EN_TO_ES: Record<string, string> = {
  "algeria": "Argelia",
  "argentina": "Argentina",
  "australia": "Australia",
  "austria": "Austria",
  "belgium": "Bélgica",
  "bosnia-herzegovina": "Bosnia y Herzegovina",
  "bosnia and herzegovina": "Bosnia y Herzegovina",
  "brazil": "Brasil",
  "canada": "Canadá",
  "cape verde islands": "Cabo Verde",
  "cape verde": "Cabo Verde",
  "colombia": "Colombia",
  "congo dr": "RD Congo",
  "dr congo": "RD Congo",
  "democratic republic of congo": "RD Congo",
  "croatia": "Croacia",
  "curaçao": "Curazao",
  "curacao": "Curazao",
  "czechia": "Chequia",
  "czech republic": "Chequia",
  "ecuador": "Ecuador",
  "egypt": "Egipto",
  "england": "Inglaterra",
  "france": "Francia",
  "germany": "Alemania",
  "ghana": "Ghana",
  "haiti": "Haití",
  "iran": "Irán",
  "iraq": "Irak",
  "ivory coast": "Costa de Marfil",
  "côte d'ivoire": "Costa de Marfil",
  "japan": "Japón",
  "jordan": "Jordania",
  "mexico": "México",
  "morocco": "Marruecos",
  "netherlands": "Países Bajos",
  "new zealand": "Nueva Zelanda",
  "norway": "Noruega",
  "panama": "Panamá",
  "paraguay": "Paraguay",
  "portugal": "Portugal",
  "qatar": "Catar",
  "saudi arabia": "Arabia Saudita",
  "scotland": "Escocia",
  "senegal": "Senegal",
  "south africa": "Sudáfrica",
  "south korea": "Corea del Sur",
  "korea republic": "Corea del Sur",
  "spain": "España",
  "sweden": "Suecia",
  "switzerland": "Suiza",
  "tunisia": "Túnez",
  "turkey": "Turquía",
  "türkiye": "Turquía",
  "united states": "Estados Unidos",
  "usa": "Estados Unidos",
  "uruguay": "Uruguay",
  "uzbekistan": "Uzbekistán",
  "tbd": "Por definir",
};

export function translateTeamName(name: string | null | undefined): string {
  if (!name) return "";
  const key = name.trim().toLowerCase();
  return EN_TO_ES[key] ?? name;
}

export function isArgentina(name: string | null | undefined): boolean {
  return !!name && name.toLowerCase().includes("argentina");
}

export function isArgentinaMatch(
  team_a: string | null | undefined,
  team_b: string | null | undefined,
): boolean {
  return isArgentina(team_a) || isArgentina(team_b);
}
