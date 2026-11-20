/** Nigeria's 36 states + the Federal Capital Territory. Slugs are what the API accepts and stores. */
export const NIGERIAN_STATES = [
  ['abia', 'Abia'],
  ['adamawa', 'Adamawa'],
  ['akwa-ibom', 'Akwa Ibom'],
  ['anambra', 'Anambra'],
  ['bauchi', 'Bauchi'],
  ['bayelsa', 'Bayelsa'],
  ['benue', 'Benue'],
  ['borno', 'Borno'],
  ['cross-river', 'Cross River'],
  ['delta', 'Delta'],
  ['ebonyi', 'Ebonyi'],
  ['edo', 'Edo'],
  ['ekiti', 'Ekiti'],
  ['enugu', 'Enugu'],
  ['fct', 'Federal Capital Territory (Abuja)'],
  ['gombe', 'Gombe'],
  ['imo', 'Imo'],
  ['jigawa', 'Jigawa'],
  ['kaduna', 'Kaduna'],
  ['kano', 'Kano'],
  ['katsina', 'Katsina'],
  ['kebbi', 'Kebbi'],
  ['kogi', 'Kogi'],
  ['kwara', 'Kwara'],
  ['lagos', 'Lagos'],
  ['nasarawa', 'Nasarawa'],
  ['niger', 'Niger'],
  ['ogun', 'Ogun'],
  ['ondo', 'Ondo'],
  ['osun', 'Osun'],
  ['oyo', 'Oyo'],
  ['plateau', 'Plateau'],
  ['rivers', 'Rivers'],
  ['sokoto', 'Sokoto'],
  ['taraba', 'Taraba'],
  ['yobe', 'Yobe'],
  ['zamfara', 'Zamfara'],
] as const;

export const STATE_SLUGS: string[] = NIGERIAN_STATES.map(([slug]) => slug);

const STATE_NAMES = new Map<string, string>(
  NIGERIAN_STATES.map(([s, n]) => [s, n]),
);

export function stateName(slug: string | null | undefined): string | null {
  return slug ? (STATE_NAMES.get(slug) ?? null) : null;
}

/** Accepts "Lagos", "lagos", "Akwa Ibom", "abuja" → canonical slug, or null if not a state. */
export function normalizeState(
  input: string | null | undefined,
): string | null {
  if (!input) return null;
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/\s+state$/, '')
    .replace(/[\s_]+/g, '-');
  if (slug === 'abuja' || slug === 'federal-capital-territory') return 'fct';
  return STATE_NAMES.has(slug) ? slug : null;
}
