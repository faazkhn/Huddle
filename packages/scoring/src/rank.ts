/** Rank by score descending; ties share rank (1, 1, 3). */
export function rank<T extends { score: number }>(players: T[]): (T & { rank: number })[] {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  let r = 0;
  return sorted.map((p, i) => {
    if (i === 0 || sorted[i - 1].score !== p.score) r = i + 1;
    return { ...p, rank: r };
  });
}
