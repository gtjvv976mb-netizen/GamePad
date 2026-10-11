export type GameButton = "up" | "down" | "left" | "right" | "action" | "alt";
export type GameInput = {
  held: ReadonlySet<GameButton>;
  pressed: ReadonlySet<GameButton>;
  pointer?: { x: number; y: number; pressed: boolean; down: boolean };
};
export type GameStatus = "playing" | "won" | "lost";
export type GameFamily = "action" | "adventure" | "strategy";
export type CampaignChapter = {
  title: string;
  briefing: string;
  after: string;
  objective: string;
  /** Engine-specific, JSON-serializable chapter content. */
  config: Record<string, unknown>;
};
export type Campaign = {
  slug: string;
  title: string;
  family: GameFamily;
  mechanic: string;
  description: string;
  controls: string;
  actionLabel: string;
  altLabel: string;
  palette: [string, string, string];
  chapters: CampaignChapter[];
  ending: string;
};
export type EngineView = {
  status: GameStatus;
  objective: string;
  message: string;
  /** Selected item/rules in readable text outside the canvas, including on phones. */
  selection?: string;
  stats: { label: string; value: string | number }[];
};
export interface GameEngine {
  update(dt: number, input: GameInput): void;
  /** Canvas is always 960x540 logical pixels; the runtime handles responsive sizing. */
  render(ctx: CanvasRenderingContext2D, width: number, height: number): void;
  view(): EngineView;
  /** JSON state for exact mid-chapter resume. Must be validated when restored. */
  save(): Record<string, unknown>;
}
export type EngineOptions = {
  campaign: Campaign;
  chapterIndex: number;
  restored?: Record<string, unknown>;
};
export type EngineFactory = (options: EngineOptions) => GameEngine;
