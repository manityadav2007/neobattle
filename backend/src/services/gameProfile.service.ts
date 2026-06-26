export interface GameProfile {
  uid: string;
  ign: string;
  level: number;
  region: string;
  avatarUrl: string | null;
}

class GameProfileService {
  async fetchByUid(uid: string): Promise<GameProfile | null> {
    if (!uid || uid.length < 5) return null;

    await this.simulateLatency();

    const hash = uid.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);

    return {
      uid,
      ign: `Player_${uid.slice(-4)}`,
      level: 30 + (hash % 60),
      region: hash % 3 === 0 ? 'NA' : hash % 3 === 1 ? 'EU' : 'ASIA',
      avatarUrl: null,
    };
  }

  private simulateLatency(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 400));
  }
}

export const gameProfileService = new GameProfileService();
