import type { ChatDoc } from "@/lib/models/Chat";
import { DiagnosisRecord } from "@/lib/models/Diagnosis";
import { Farm } from "@/lib/models/Farm";
import { Field } from "@/lib/models/Field";
import type { MessageDoc } from "@/lib/models/Message";
import type { UserDoc } from "@/lib/models/User";
import { ringCentroid } from "@/lib/geo";
import { resolveCropKey } from "@/lib/crop-calendar";
import type { Diagnosis } from "@/types/chat";
import type { GeoPoint } from "@/types/farm";

interface RecordInput {
  user: UserDoc;
  chat: ChatDoc;
  userMsg: MessageDoc;
  assistantMsg: MessageDoc;
  diagnosis: Diagnosis;
}

/**
 * Denormalizes an AI diagnosis into the Diagnosis collection, linked to the user's active farm.
 * The field is guessed by matching crop names; location falls back from field centroid to farm point.
 */
export async function recordDiagnosis({ user, chat, userMsg, assistantMsg, diagnosis }: RecordInput) {
  let farmId = null;
  let fieldId = null;
  let location: GeoPoint | undefined;

  if (user.activeFarmId) {
    const [farm, fields] = await Promise.all([
      Farm.findOne({ _id: user.activeFarmId, userId: user._id }).select("location").lean(),
      Field.find({ farmId: user.activeFarmId, userId: user._id }).select("crop boundary").lean(),
    ]);
    if (farm) {
      farmId = farm._id;
      if (farm.location) location = farm.location;
      const cropKey = resolveCropKey(diagnosis.crop);
      const name = diagnosis.crop.trim().toLowerCase();
      const field = fields.find(
        (f) => f.crop && (f.crop.trim().toLowerCase() === name || (cropKey !== "generic" && resolveCropKey(f.crop) === cropKey))
      );
      if (field) {
        fieldId = field._id;
        const centroid = field.boundary ? ringCentroid(field.boundary.coordinates[0]) : null;
        if (centroid) location = { type: "Point", coordinates: centroid };
      }
    }
  }

  return DiagnosisRecord.create({
    userId: user._id,
    chatId: chat._id,
    messageId: assistantMsg._id,
    sourceMessageId: userMsg._id,
    farmId,
    fieldId,
    crop: diagnosis.crop,
    condition: diagnosis.condition,
    severity: diagnosis.severity,
    confidence: diagnosis.confidence,
    location,
  });
}
