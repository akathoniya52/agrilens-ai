import { Schema, model, models, type HydratedDocument, type Model } from "mongoose";

/** One embedded chunk of an agronomy reference document (see scripts/ingest-knowledge.ts). */
export interface IKnowledge {
  source: string;
  title: string;
  url?: string | null;
  chunkIndex: number;
  text: string;
  embedding: number[];
  createdAt: Date;
  updatedAt: Date;
}

export type KnowledgeDoc = HydratedDocument<IKnowledge>;

const KnowledgeSchema = new Schema<IKnowledge>(
  {
    source: { type: String, required: true },
    title: { type: String, required: true },
    url: { type: String, default: null },
    chunkIndex: { type: Number, required: true },
    text: { type: String, required: true },
    embedding: { type: [Number], required: true },
  },
  { timestamps: true }
);

KnowledgeSchema.index({ source: 1, chunkIndex: 1 }, { unique: true });

export const Knowledge =
  (models.Knowledge as Model<IKnowledge>) || model<IKnowledge>("Knowledge", KnowledgeSchema);
