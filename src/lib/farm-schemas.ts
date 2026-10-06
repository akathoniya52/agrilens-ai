import { z } from "zod";
import { cleanRing } from "@/lib/geo";
import { isObjectId } from "@/lib/http";
import { IRRIGATION_TYPES, REMINDER_KINDS, SOIL_TYPES } from "@/types/farm";

const Lon = z.number().min(-180).max(180);
const Lat = z.number().min(-90).max(90);

export const PointInput = z.object({
  type: z.literal("Point"),
  coordinates: z.tuple([Lon, Lat]),
});

/** Rings are cleaned (duplicate corners dropped, closed) and rejected if MongoDB couldn't index them. */
export const PolygonInput = z
  .object({
    type: z.literal("Polygon"),
    coordinates: z.array(z.array(z.tuple([Lon, Lat])).min(3).max(500)).min(1).max(5),
  })
  .transform((polygon, ctx) => {
    const rings: Array<Array<[number, number]>> = [];
    for (const [index, ring] of polygon.coordinates.entries()) {
      const checked = cleanRing(ring);
      if (!checked.ok) {
        ctx.addIssue({ code: "custom", message: checked.error, path: ["coordinates", index] });
        return z.NEVER;
      }
      rings.push(checked.ring);
    }
    return { type: polygon.type, coordinates: rings };
  });

const ObjectIdString = z.string().refine(isObjectId, "Invalid id");
const DateString = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date");

// Patches derive from the bases, not the inputs: zod 4 still applies `.default()` inside
// `.partial()`, which would overwrite omitted fields (`crops: []`, `crop: ""`).
const Crops = z.array(z.string().trim().min(1).max(40)).max(12);
const FarmBase = z.object({
  name: z.string().trim().min(1).max(80),
  location: PointInput.nullable().optional(),
  crops: Crops,
  areaHa: z.number().positive().max(1_000_000).nullable().optional(),
  soilType: z.enum(SOIL_TYPES).nullable().optional(),
  irrigation: z.enum(IRRIGATION_TYPES).nullable().optional(),
});

export const FarmInput = FarmBase.extend({ crops: Crops.default([]) });

export const FarmPatch = FarmBase.partial();

const FieldCrop = z.string().trim().max(40);
const FieldBase = z.object({
  name: z.string().trim().min(1).max(80),
  crop: FieldCrop,
  sowingDate: DateString.nullable().optional(),
  boundary: PolygonInput.nullable().optional(),
  areaHa: z.number().positive().max(1_000_000).nullable().optional(),
});

export const FieldInput = FieldBase.extend({ crop: FieldCrop.default("") });

export const FieldPatch = FieldBase.partial();

export const ReminderInput = z.object({
  title: z.string().trim().min(1).max(160),
  dueAt: DateString,
  kind: z.enum(REMINDER_KINDS).default("custom"),
  farmId: ObjectIdString.nullable().optional(),
  fieldId: ObjectIdString.nullable().optional(),
});

export const ReminderCreate = z.union([ReminderInput, z.array(ReminderInput).min(1).max(60)]);

export const ReminderPatch = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  dueAt: DateString.optional(),
  kind: z.enum(REMINDER_KINDS).optional(),
  done: z.boolean().optional(),
});

export function definedOnly<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) as Partial<T>;
}
