/**
 * LocationNormalizationService — normalización de nombres de localidad.
 *
 * Mercado Libre puede escribir la misma localidad de muchas formas
 * ("San Martín", "Gral. San Martin", "Partido de San Martín"). Todo lookup
 * de localidades y alias se hace sobre el nombre normalizado.
 */

const NOISE_WORDS = new Set(["partido", "de", "del", "la", "el", "los", "las"]);

const ABBREVIATIONS: Record<string, string> = {
  "gral": "general",
  "grl": "general",
  "pte": "presidente",
  "cnel": "coronel",
  "tte": "teniente",
  "cap": "capitan",
  "sta": "santa",
  "sto": "santo",
  "avda": "avenida",
  "av": "avenida",
};

/** Minúsculas, sin tildes, sin puntuación, abreviaturas expandidas, sin ruido. */
export function normalizeLocationName(raw: string): string {
  const base = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.,;:()\/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const words = base
    .split(" ")
    .map((w) => ABBREVIATIONS[w] ?? w)
    .filter((w) => w.length > 0 && !NOISE_WORDS.has(w));

  return words.join(" ");
}

/** Igualdad de localidades tolerante a variantes de escritura. */
export function locationNamesMatch(a: string, b: string): boolean {
  return normalizeLocationName(a) === normalizeLocationName(b);
}
