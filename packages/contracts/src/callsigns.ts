/** Original, clean, bounded player names; caller may supply a deterministic random source. */
export function randomCallsign(random: () => number = Math.random): string {
  const first = ['Wobbly', 'Turbo', 'Sneaky', 'Clumsy', 'Peppy', 'Nimble', 'Squeaky', 'Disco', 'Bouncy', 'Velvet', 'Sir', 'Captain'];
  const last = ['Bumper', 'Donut', 'Pickle', 'Pancake', 'Noodle', 'Puddle', 'Waffle', 'Biscuit', 'Hubcap', 'Jellybean', 'Sprocket', 'Trafficcone'];
  const pick = (words: string[]) => { const value = random(); return words[Math.floor(Math.max(0, Math.min(.999999999, Number.isFinite(value) ? value : 0)) * words.length)]!; };
  return `${pick(first)} ${pick(last)}`;
}
