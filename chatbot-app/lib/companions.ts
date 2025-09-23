export const COMPANIONS = {
  ADAM: {
    name: 'Adam',
    url: 'https://models.readyplayer.me/68be69db5dc0cec769cfae75.glb',
  },
  EVE: {
    name: 'Eve',
    url: 'https://models.readyplayer.me/68be6a2ac036016545747aa9.glb',
  },
} as const;

export type CompanionKey = keyof typeof COMPANIONS;
