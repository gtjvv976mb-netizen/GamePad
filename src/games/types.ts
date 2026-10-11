export type GameButton = "up" | "down" | "left" | "right" | "action" | "alt";
export type GameInput = {
  held: ReadonlySet<GameButton>;
  pressed: ReadonlySet<GameButton>;
  pointer?: { x: number; y: number; pressed: boolean; down: boolean };
  /** Optional normalized right-stick aim; auto-aim remains available. */
  aim?: { x: number; y: number };
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
  /** Accessible decisions, dialogue and upgrades, also selectable by controller. */
  choices?: { id: string; label: string; description?: string; disabled?: boolean }[];
  choicePrompt?: string;
  /** Modal choices suspend movement input; panels leave the world controllable. */
  choiceMode?: "modal" | "panel";
  boss?: { name: string; health: number; max: number };
};
export type GameEvent = { type: "step" | "strike" | "hit" | "collect" | "success" | "fail" | "dash" | "shoot" | "craft" | "dialogue" | "engine" | "splash"; strength?: number };
export interface GameEngine {
  update(dt: number, input: GameInput): void;
  /** Canvas is always 960x540 logical pixels; the runtime handles responsive sizing. */
  render(ctx: CanvasRenderingContext2D, width: number, height: number): void;
  view(): EngineView;
  /** JSON state for exact mid-chapter resume. Must be validated when restored. */
  save(): Record<string, unknown>;
  /** Validated, JSON-serializable persistent equipment/economy/skills. */
  progression?(): Record<string, unknown>;
  choose?(id: string): void;
  /** Drain transient feedback events; these never affect simulation or saves. */
  events?(): GameEvent[];
}
export type EngineOptions = {
  campaign: Campaign;
  chapterIndex: number;
  restored?: Record<string, unknown>;
  progression?: Record<string, unknown>;
};
export type EngineFactory = (options: EngineOptions) => GameEngine;
