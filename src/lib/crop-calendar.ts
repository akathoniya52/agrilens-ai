import { dateKeyInZone } from "@/lib/timezone";
import type { ReminderKind } from "@/types/farm";

export const CROP_KEYS = ["wheat", "rice", "maize", "cotton", "tomato", "potato", "soybean", "sugarcane", "generic"] as const;
export type CropKey = (typeof CROP_KEYS)[number];

/** Stage/task keys double as i18n keys under `farms.calendar.stages` / `farms.calendar.tasks`. */
export type StageKey =
  | "emergence" | "crownRoot" | "tillering" | "jointing" | "heading" | "grainFill" | "maturity"
  | "establishment" | "panicleInit" | "flowering" | "vegetative" | "tasseling" | "silking" | "squaring"
  | "bollDevelopment" | "bollOpening" | "fruitSet" | "fruiting" | "sprouting" | "tuberInit" | "tuberBulking"
  | "podDevelopment" | "seedFill" | "germination" | "grandGrowth";

export type TaskKey =
  | "irrigateCri" | "topDressN" | "irrigateTillering" | "irrigateFlowering" | "irrigateGrainFill" | "harvest"
  | "basalN" | "weeding" | "keepFlooded" | "drainField" | "scoutFaw" | "irrigateSilking" | "thinning"
  | "scoutBollworm" | "potash" | "firstPicking" | "staking" | "calcium" | "firstHarvest" | "earthingUp"
  | "blightPrevent" | "stopIrrigation" | "scoutDefoliators" | "irrigatePod" | "topDressN2" | "propping" | "scout";

interface StageTemplate {
  key: StageKey;
  label: string;
  /** Day after sowing (inclusive). */
  start: number;
  /** Day after sowing (exclusive). */
  end: number;
}

interface TaskTemplate {
  key: TaskKey;
  label: string;
  kind: ReminderKind;
  day: number;
}

interface CropTemplate {
  stages: StageTemplate[];
  tasks: TaskTemplate[];
  scoutEvery: number;
}

const st = (key: StageKey, label: string, start: number, end: number): StageTemplate => ({ key, label, start, end });
const tk = (kind: ReminderKind, key: TaskKey, label: string, day: number): TaskTemplate => ({ key, label, kind, day });

const TEMPLATES: Record<CropKey, CropTemplate> = {
  wheat: {
    scoutEvery: 14,
    stages: [
      st("emergence", "Emergence", 0, 21), st("crownRoot", "Crown root initiation", 21, 30),
      st("tillering", "Tillering", 30, 50), st("jointing", "Jointing", 50, 70),
      st("heading", "Heading", 70, 90), st("grainFill", "Grain filling", 90, 115), st("maturity", "Maturity", 115, 125),
    ],
    tasks: [
      tk("irrigation", "irrigateCri", "First irrigation at crown root initiation", 21),
      tk("fertilizer", "topDressN", "Top-dress nitrogen", 25), tk("irrigation", "irrigateTillering", "Irrigate at late tillering", 45),
      tk("irrigation", "irrigateFlowering", "Irrigate at flowering", 80), tk("irrigation", "irrigateGrainFill", "Irrigate at milk stage", 100),
      tk("harvest", "harvest", "Harvest", 120),
    ],
  },
  rice: {
    scoutEvery: 10,
    stages: [
      st("establishment", "Establishment", 0, 15), st("tillering", "Tillering", 15, 45),
      st("panicleInit", "Panicle initiation", 45, 65), st("flowering", "Flowering", 65, 85),
      st("grainFill", "Grain filling", 85, 110), st("maturity", "Maturity", 110, 125),
    ],
    tasks: [
      tk("fertilizer", "basalN", "First nitrogen split", 15), tk("custom", "weeding", "Weeding", 25),
      tk("fertilizer", "topDressN", "Second nitrogen split at panicle initiation", 45),
      tk("irrigation", "keepFlooded", "Keep 5 cm standing water during flowering", 65),
      tk("irrigation", "drainField", "Drain field before harvest", 105), tk("harvest", "harvest", "Harvest", 118),
    ],
  },
  maize: {
    scoutEvery: 10,
    stages: [
      st("emergence", "Emergence", 0, 10), st("vegetative", "Vegetative", 10, 45), st("tasseling", "Tasseling", 45, 60),
      st("silking", "Silking", 60, 70), st("grainFill", "Grain filling", 70, 100), st("maturity", "Maturity", 100, 115),
    ],
    tasks: [
      tk("custom", "weeding", "Weeding", 20), tk("fertilizer", "topDressN", "Top-dress nitrogen at knee height", 30),
      tk("scouting", "scoutFaw", "Check whorls for fall armyworm", 25), tk("irrigation", "irrigateSilking", "Irrigate at silking", 60),
      tk("harvest", "harvest", "Harvest", 110),
    ],
  },
  cotton: {
    scoutEvery: 10,
    stages: [
      st("emergence", "Emergence", 0, 15), st("vegetative", "Vegetative", 15, 45), st("squaring", "Squaring", 45, 70),
      st("flowering", "Flowering", 70, 110), st("bollDevelopment", "Boll development", 110, 150),
      st("bollOpening", "Boll opening", 150, 180),
    ],
    tasks: [
      tk("custom", "thinning", "Thin seedlings", 15), tk("fertilizer", "topDressN", "Top-dress nitrogen", 40),
      tk("scouting", "scoutBollworm", "Check squares for pink bollworm", 60), tk("fertilizer", "potash", "Apply potash at flowering", 75),
      tk("harvest", "firstPicking", "First picking", 155),
    ],
  },
  tomato: {
    scoutEvery: 7,
    stages: [
      st("establishment", "Establishment", 0, 15), st("vegetative", "Vegetative", 15, 35), st("flowering", "Flowering", 35, 55),
      st("fruitSet", "Fruit set", 55, 75), st("fruiting", "Fruiting & harvest", 75, 120),
    ],
    tasks: [
      tk("custom", "staking", "Stake or trellis plants", 20), tk("fertilizer", "topDressN", "Side-dress fertilizer", 25),
      tk("fertilizer", "calcium", "Calcium spray against blossom-end rot", 50), tk("harvest", "firstHarvest", "First harvest", 75),
    ],
  },
  potato: {
    scoutEvery: 7,
    stages: [
      st("sprouting", "Sprouting", 0, 20), st("vegetative", "Vegetative", 20, 35), st("tuberInit", "Tuber initiation", 35, 50),
      st("tuberBulking", "Tuber bulking", 50, 90), st("maturity", "Maturity", 90, 110),
    ],
    tasks: [
      tk("custom", "earthingUp", "Earthing up", 30), tk("fertilizer", "topDressN", "Top-dress nitrogen at earthing up", 30),
      tk("spray", "blightPrevent", "Preventive late-blight spray if weather is humid", 45),
      tk("irrigation", "stopIrrigation", "Stop irrigation 10 days before haulm cutting", 90), tk("harvest", "harvest", "Harvest", 105),
    ],
  },
  soybean: {
    scoutEvery: 10,
    stages: [
      st("emergence", "Emergence", 0, 10), st("vegetative", "Vegetative", 10, 40), st("flowering", "Flowering", 40, 60),
      st("podDevelopment", "Pod development", 60, 80), st("seedFill", "Seed filling", 80, 100), st("maturity", "Maturity", 100, 110),
    ],
    tasks: [
      tk("custom", "weeding", "Weeding", 20), tk("scouting", "scoutDefoliators", "Check for defoliating caterpillars", 35),
      tk("irrigation", "irrigatePod", "Irrigate at pod filling if dry", 65), tk("harvest", "harvest", "Harvest", 105),
    ],
  },
  sugarcane: {
    scoutEvery: 21,
    stages: [
      st("germination", "Germination", 0, 45), st("tillering", "Tillering", 45, 120),
      st("grandGrowth", "Grand growth", 120, 270), st("maturity", "Maturity", 270, 365),
    ],
    tasks: [
      tk("fertilizer", "topDressN", "First nitrogen top-dress", 45), tk("custom", "earthingUp", "Earthing up", 90),
      tk("fertilizer", "topDressN2", "Second nitrogen top-dress", 90), tk("custom", "propping", "Propping / trash twist", 180),
      tk("harvest", "harvest", "Harvest", 350),
    ],
  },
  generic: {
    scoutEvery: 14,
    stages: [
      st("establishment", "Establishment", 0, 20), st("vegetative", "Vegetative", 20, 55), st("flowering", "Flowering", 55, 80),
      st("fruiting", "Fruit / grain development", 80, 110), st("maturity", "Maturity", 110, 120),
    ],
    tasks: [tk("fertilizer", "topDressN", "Top-dress fertilizer", 30), tk("harvest", "harvest", "Harvest", 115)],
  },
};

const ALIASES: Record<string, CropKey> = {
  paddy: "rice", corn: "maize", soya: "soybean", soyabean: "soybean", "soy bean": "soybean",
  tomatoes: "tomato", potatoes: "potato", cane: "sugarcane", "sugar cane": "sugarcane",
};

export function resolveCropKey(crop: string | null | undefined): CropKey {
  const name = (crop ?? "").trim().toLowerCase();
  if (!name) return "generic";
  if ((CROP_KEYS as readonly string[]).includes(name)) return name as CropKey;
  if (ALIASES[name]) return ALIASES[name];
  const hit = CROP_KEYS.find((key) => key !== "generic" && name.includes(key));
  return hit ?? "generic";
}

const DAY_MS = 86_400_000;
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);

export interface CalendarStage extends StageTemplate {
  startDate: string;
  endDate: string;
}

export interface CalendarTask extends TaskTemplate {
  date: string;
}

export interface CropCalendar {
  cropKey: CropKey;
  totalDays: number;
  stages: CalendarStage[];
  tasks: CalendarTask[];
}

export function buildCropCalendar(crop: string, sowingDate: Date | string): CropCalendar {
  const cropKey = resolveCropKey(crop);
  const template = TEMPLATES[cropKey];
  const sown = new Date(sowingDate);
  const totalDays = template.stages[template.stages.length - 1].end;
  const maturityStart = template.stages[template.stages.length - 1].start;

  const scouting: TaskTemplate[] = [];
  for (let day = template.scoutEvery; day < maturityStart; day += template.scoutEvery) {
    scouting.push(tk("scouting", "scout", "Scout field for pests and disease", day));
  }

  const tasks = [...template.tasks, ...scouting]
    .sort((a, b) => a.day - b.day)
    .map((task) => ({ ...task, date: addDays(sown, task.day).toISOString() }));
  const stages = template.stages.map((stage) => ({
    ...stage,
    startDate: addDays(sown, stage.start).toISOString(),
    endDate: addDays(sown, stage.end).toISOString(),
  }));
  return { cropKey, totalDays, stages, tasks };
}

export interface CropStageInfo {
  cropKey: CropKey;
  /** Days after sowing (negative = not yet sown). */
  das: number;
  stage: StageTemplate | null;
  status: "planned" | "growing" | "harvested";
  /** 0–1 through the whole season. */
  progress: number;
}

/** Whole calendar days from `from` to `to` as seen in `timeZone`, so the count ticks over at local midnight. */
export function calendarDaysBetween(from: Date, to: Date, timeZone: string): number {
  return Math.round((Date.parse(dateKeyInZone(to, timeZone)) - Date.parse(dateKeyInZone(from, timeZone))) / DAY_MS);
}

/** `timeZone` defaults to the runtime's own (the browser's on the client); servers should pass the user's. */
export function cropStage(
  crop: string,
  sowingDate: Date | string,
  now: Date = new Date(),
  timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone
): CropStageInfo {
  const cropKey = resolveCropKey(crop);
  const { stages } = TEMPLATES[cropKey];
  const total = stages[stages.length - 1].end;
  const das = calendarDaysBetween(new Date(sowingDate), now, timeZone);
  if (das < 0) return { cropKey, das, stage: null, status: "planned", progress: 0 };
  if (das >= total) return { cropKey, das, stage: null, status: "harvested", progress: 1 };
  const stage = stages.find((s) => das >= s.start && das < s.end) ?? null;
  return { cropKey, das, stage, status: "growing", progress: das / total };
}
