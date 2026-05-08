// Map club names to crest image URLs (used for UCL matches)
const CRESTS: Record<string, string> = {
  "arsenal": "https://upload.wikimedia.org/wikipedia/en/5/53/Arsenal_FC.svg",
  "atlético de madrid": "https://upload.wikimedia.org/wikipedia/en/thumb/f/f4/Atletico_Madrid_2017_logo.svg/240px-Atletico_Madrid_2017_logo.svg.png",
  "atletico de madrid": "https://upload.wikimedia.org/wikipedia/en/thumb/f/f4/Atletico_Madrid_2017_logo.svg/240px-Atletico_Madrid_2017_logo.svg.png",
  "atlético madrid": "https://upload.wikimedia.org/wikipedia/en/thumb/f/f4/Atletico_Madrid_2017_logo.svg/240px-Atletico_Madrid_2017_logo.svg.png",
  "atletico madrid": "https://upload.wikimedia.org/wikipedia/en/thumb/f/f4/Atletico_Madrid_2017_logo.svg/240px-Atletico_Madrid_2017_logo.svg.png",
  "bayern múnich": "https://upload.wikimedia.org/wikipedia/commons/1/1b/FC_Bayern_M%C3%BCnchen_logo_%282017%29.svg",
  "bayern munich": "https://upload.wikimedia.org/wikipedia/commons/1/1b/FC_Bayern_M%C3%BCnchen_logo_%282017%29.svg",
  "fc bayern münchen": "https://upload.wikimedia.org/wikipedia/commons/1/1b/FC_Bayern_M%C3%BCnchen_logo_%282017%29.svg",
  "paris saint-germain": "https://upload.wikimedia.org/wikipedia/en/a/a7/Paris_Saint-Germain_F.C..svg",
  "psg": "https://upload.wikimedia.org/wikipedia/en/a/a7/Paris_Saint-Germain_F.C..svg",
  "real madrid": "https://upload.wikimedia.org/wikipedia/en/5/56/Real_Madrid_CF.svg",
  "barcelona": "https://upload.wikimedia.org/wikipedia/en/4/47/FC_Barcelona_%28crest%29.svg",
  "fc barcelona": "https://upload.wikimedia.org/wikipedia/en/4/47/FC_Barcelona_%28crest%29.svg",
  "manchester city": "https://upload.wikimedia.org/wikipedia/en/e/eb/Manchester_City_FC_badge.svg",
  "manchester united": "https://upload.wikimedia.org/wikipedia/en/7/7a/Manchester_United_FC_crest.svg",
  "liverpool": "https://upload.wikimedia.org/wikipedia/en/0/0c/Liverpool_FC.svg",
  "chelsea": "https://upload.wikimedia.org/wikipedia/en/c/cc/Chelsea_FC.svg",
  "tottenham": "https://upload.wikimedia.org/wikipedia/en/b/b4/Tottenham_Hotspur.svg",
  "inter": "https://upload.wikimedia.org/wikipedia/commons/0/05/FC_Internazionale_Milano_2021.svg",
  "internazionale": "https://upload.wikimedia.org/wikipedia/commons/0/05/FC_Internazionale_Milano_2021.svg",
  "ac milan": "https://upload.wikimedia.org/wikipedia/commons/d/d0/Logo_of_AC_Milan.svg",
  "milan": "https://upload.wikimedia.org/wikipedia/commons/d/d0/Logo_of_AC_Milan.svg",
  "juventus": "https://upload.wikimedia.org/wikipedia/commons/b/bc/Juventus_FC_2017_logo.svg",
  "napoli": "https://upload.wikimedia.org/wikipedia/commons/2/2d/SSC_Neapel.svg",
  "borussia dortmund": "https://upload.wikimedia.org/wikipedia/commons/6/67/Borussia_Dortmund_logo.svg",
  "dortmund": "https://upload.wikimedia.org/wikipedia/commons/6/67/Borussia_Dortmund_logo.svg",
  "bayer leverkusen": "https://upload.wikimedia.org/wikipedia/en/5/59/Bayer_04_Leverkusen_logo.svg",
  "rb leipzig": "https://upload.wikimedia.org/wikipedia/en/0/04/RB_Leipzig_2014_logo.svg",
  "atalanta": "https://upload.wikimedia.org/wikipedia/en/6/66/AtalantaBC.svg",
  "porto": "https://upload.wikimedia.org/wikipedia/en/f/f1/FC_Porto.svg",
  "benfica": "https://upload.wikimedia.org/wikipedia/en/a/a2/SL_Benfica_logo.svg",
  "sporting cp": "https://upload.wikimedia.org/wikipedia/en/3/3e/Sporting_Clube_de_Portugal_%28Logo%29.svg",
  "ajax": "https://upload.wikimedia.org/wikipedia/en/7/79/Ajax_Amsterdam.svg",
  "psv": "https://upload.wikimedia.org/wikipedia/en/9/9d/PSV_Eindhoven.svg",
};

export function getClubCrestUrl(name: string | null | undefined): string | null {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  return CRESTS[key] ?? null;
}
