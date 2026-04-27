// Country (Spanish name) -> ISO 3166-1 alpha-2 code, used to render flag emojis.
const COUNTRY_TO_ISO: Record<string, string> = {
  "Alemania": "DE",
  "Arabia Saudí": "SA",
  "Arabia Saudita": "SA",
  "Argelia": "DZ",
  "Argentina": "AR",
  "Australia": "AU",
  "Austria": "AT",
  "Bélgica": "BE",
  "Belgica": "BE",
  "Bosnia y Herzegovina": "BA",
  "Brasil": "BR",
  "Cabo Verde": "CV",
  "Canadá": "CA",
  "Canada": "CA",
  "Catar": "QA",
  "Qatar": "QA",
  "Colombia": "CO",
  "Costa de Marfil": "CI",
  "Croacia": "HR",
  "Curazao": "CW",
  "Ecuador": "EC",
  "Egipto": "EG",
  "Escocia": "GB-SCT",
  "España": "ES",
  "Espana": "ES",
  "Estados Unidos": "US",
  "Francia": "FR",
  "Ghana": "GH",
  "Haití": "HT",
  "Haiti": "HT",
  "Inglaterra": "GB-ENG",
  "Irak": "IQ",
  "Irán": "IR",
  "Iran": "IR",
  "RI de Irán": "IR",
  "Japón": "JP",
  "Japon": "JP",
  "Jordania": "JO",
  "Marruecos": "MA",
  "México": "MX",
  "Mexico": "MX",
  "Noruega": "NO",
  "Nueva Zelanda": "NZ",
  "Países Bajos": "NL",
  "Paises Bajos": "NL",
  "Panamá": "PA",
  "Panama": "PA",
  "Paraguay": "PY",
  "Portugal": "PT",
  "RD Congo": "CD",
  "República Checa": "CZ",
  "Republica Checa": "CZ",
  "República de Corea": "KR",
  "Republica de Corea": "KR",
  "Corea del Sur": "KR",
  "Senegal": "SN",
  "Sudáfrica": "ZA",
  "Sudafrica": "ZA",
  "Suecia": "SE",
  "Suiza": "CH",
  "Túnez": "TN",
  "Tunez": "TN",
  "Turquía": "TR",
  "Turquia": "TR",
  "Uruguay": "UY",
  "Uzbekistán": "UZ",
  "Uzbekistan": "UZ",
};

// Special non-ISO codes use a custom SVG URL.
const SPECIAL_FLAGS: Record<string, string> = {
  "GB-SCT": "https://flagcdn.com/gb-sct.svg",
  "GB-ENG": "https://flagcdn.com/gb-eng.svg",
};

function isoToEmoji(iso: string): string {
  // Each ASCII letter -> regional indicator symbol
  return iso
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .split("")
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("");
}

/** Returns a flag emoji for a country name, or empty string for non-country labels (e.g. "Ganador P12"). */
export function flagEmoji(name: string | null | undefined): string {
  if (!name) return "";
  const iso = COUNTRY_TO_ISO[name.trim()];
  if (!iso || iso.startsWith("GB-")) return "";
  return isoToEmoji(iso);
}

/** Returns a flag image URL (svg) for a country name, or null if unknown / placeholder team. */
export function flagUrl(name: string | null | undefined): string | null {
  if (!name) return null;
  const iso = COUNTRY_TO_ISO[name.trim()];
  if (!iso) return null;
  if (SPECIAL_FLAGS[iso]) return SPECIAL_FLAGS[iso];
  return `https://flagcdn.com/${iso.toLowerCase()}.svg`;
}

export function isRealCountry(name: string | null | undefined): boolean {
  if (!name) return false;
  return !!COUNTRY_TO_ISO[name.trim()];
}
