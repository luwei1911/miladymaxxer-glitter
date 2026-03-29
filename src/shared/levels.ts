export function getLevel(postsLiked: number): number {
  return Math.floor(Math.sqrt(postsLiked));
}

export interface LevelProgress {
  level: number;
  current: number;
  needed: number;
}

export function getLevelProgress(postsLiked: number): LevelProgress {
  const level = getLevel(postsLiked);
  const currentThreshold = level * level;
  const nextThreshold = (level + 1) * (level + 1);
  const raw = postsLiked - currentThreshold;
  const span = nextThreshold - currentThreshold;
  return {
    level,
    current: raw === 0 && postsLiked > 0 ? 1 : raw,
    needed: span,
  };
}
