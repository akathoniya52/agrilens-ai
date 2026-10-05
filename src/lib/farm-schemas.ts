import { z } from "zod";
import { isObjectId } from "@/lib/http";
import { IRRIGATION_TYPES, REMINDER_KINDS, SOIL_TYPES } from "@/types/farm";

const Lon = z.number().min(-180).max(180);
const Lat = z.number().min(-90).max(90);

export const PointInput = z.object({
  type: z.literal("Point"),
  coordinates: z.tuple([Lon, Lat]),
});

export const PolygonInput = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(z.tuple([Lon, Lat])).min(4).max(500)).min(1).max(5),
});

const ObjectIdString = z.string().refine(isObjectId, "Invalid id");
const DateString = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date");

export const FarmInput = z.object({
  name: z.string().trim().min(1).max(80),
  location: PointInput.nullable().optional(),
  crops: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  areaHa: z.number().positive().max(1_000_000).nullable().optional(),
  soilType: z.enum(SOIL_TYPES).nullable().optional(),
  irrigation: z.enum(IRRIGATION_TYPES).nullable().optional(),
});

export const FarmPatch = FarmInput.partial();

export const FieldInput = z.object({
  name: z.string().trim().min(1).max(80),
  crop: z.string().trim().max(40).default(""),
  sowingDate: DateString.nullable().optional(),
  boundary: PolygonInput.nullable().optional(),
  areaHa: z.number().positive().max(1_000_000).nullable().optional(),
});

export const FieldPatch = FieldInput.partial();

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
