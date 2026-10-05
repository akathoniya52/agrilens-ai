import type { Types } from "mongoose";
import { Farm, type IFarm } from "@/lib/models/Farm";
import { Field, type IField } from "@/lib/models/Field";
import type { IReminder } from "@/lib/models/Reminder";
import type { IDiagnosisRecord } from "@/lib/models/Diagnosis";
import type { DiagnosisPin, FarmDTO, FieldDTO, GeoPoint, GeoPolygon, ReminderDTO } from "@/types/farm";

type Id = Types.ObjectId | string;
type Lean<T> = T & { _id: Id };

const toIso = (value: Date | string) => new Date(value).toISOString();
const idOrNull = (value: Id | null | undefined) => (value ? value.toString() : null);

function point(value: GeoPoint | null | undefined): GeoPoint | null {
  if (!value?.coordinates || value.coordinates.length < 2) return null;
  const [lon, lat] = value.coordinates;
  return { type: "Point", coordinates: [lon, lat] };
}

function polygon(value: GeoPolygon | null | undefined): GeoPolygon | null {
  if (!value?.coordinates?.length) return null;
  return {
    type: "Polygon",
    coordinates: value.coordinates.map((ring) => ring.map(([lon, lat]) => [lon, lat])),
  };
}

export function serializeFarm(farm: Lean<IFarm>, fieldCount?: number): FarmDTO {
  return {
    _id: farm._id.toString(),
    name: farm.name,
    location: point(farm.location),
    crops: [...(farm.crops ?? [])],
    areaHa: farm.areaHa ?? null,
    soilType: farm.soilType ?? null,
    irrigation: farm.irrigation ?? null,
    ...(fieldCount !== undefined && { fieldCount }),
    createdAt: toIso(farm.createdAt),
  };
}

export function serializeField(field: Lean<IField>): FieldDTO {
  return {
    _id: field._id.toString(),
    farmId: field.farmId.toString(),
    name: field.name,
    crop: field.crop ?? "",
    sowingDate: field.sowingDate ? toIso(field.sowingDate) : null,
    boundary: polygon(field.boundary),
    areaHa: field.areaHa ?? null,
    createdAt: toIso(field.createdAt),
  };
}

export function serializeReminder(reminder: Lean<IReminder>): ReminderDTO {
  return {
    _id: reminder._id.toString(),
    farmId: idOrNull(reminder.farmId),
    fieldId: idOrNull(reminder.fieldId),
    title: reminder.title,
    dueAt: toIso(reminder.dueAt),
    kind: reminder.kind,
    done: reminder.done,
    notifiedAt: reminder.notifiedAt ? toIso(reminder.notifiedAt) : null,
    createdAt: toIso(reminder.createdAt),
  };
}

export function serializeDiagnosisPin(record: Lean<IDiagnosisRecord>): DiagnosisPin {
  return {
    _id: record._id.toString(),
    fieldId: idOrNull(record.fieldId),
    crop: record.crop,
    condition: record.condition,
    severity: record.severity,
    confidence: record.confidence,
    location: point(record.location),
    createdAt: toIso(record.createdAt),
  };
}

export function findOwnedFarm(farmId: string, userId: Id) {
  return Farm.findOne({ _id: farmId, userId });
}

export function findOwnedField(fieldId: string, userId: Id) {
  return Field.findOne({ _id: fieldId, userId });
}
