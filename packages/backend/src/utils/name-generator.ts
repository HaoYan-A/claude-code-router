const ADJECTIVES = [
  'swift',
  'bright',
  'cosmic',
  'stellar',
  'nimble',
  'silent',
  'golden',
  'silver',
  'azure',
  'emerald',
  'crystal',
  'vivid',
  'quiet',
  'bold',
  'calm',
  'eager',
  'gentle',
  'keen',
  'proud',
  'wise',
];

const NOUNS = [
  'falcon',
  'nebula',
  'phoenix',
  'comet',
  'aurora',
  'quasar',
  'meteor',
  'titan',
  'orbit',
  'prism',
  'cipher',
  'matrix',
  'vertex',
  'nexus',
  'pulse',
  'spark',
  'vortex',
  'beacon',
  'flux',
  'nova',
];

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateRandomName(): string {
  const adj = randomElement(ADJECTIVES);
  const noun = randomElement(NOUNS);
  const num = Math.floor(Math.random() * 1000);
  return `${adj}-${noun}-${num}`;
}
