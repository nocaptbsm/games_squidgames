export interface LeaderboardEntry {
  sessionId: string;
  name: string;
  totalScore: number;
  gamesSurvived: number;
  bestSingleGame: number;
  date: string;
}

export const getLeaderboard = (): LeaderboardEntry[] => {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem("squid_leaderboard");
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

export const clearLeaderboard = () => {
  if (typeof window === "undefined") return;
  localStorage.removeItem("squid_leaderboard");
};

export const addLeaderboardEntry = (entry: LeaderboardEntry): LeaderboardEntry[] => {
  if (typeof window === "undefined") return [];
  const current = getLeaderboard();
  const updated = [...current, entry]
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, 10);
  localStorage.setItem("squid_leaderboard", JSON.stringify(updated));
  return updated;
};

export const sanitizeName = (name: string) => name.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 3);

export const formatDate = (isoString: string) => {
  const d = new Date(isoString);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};