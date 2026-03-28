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
  return {
    level,
    current: postsLiked - currentThreshold,
    needed: nextThreshold - currentThreshold,
  };
}
