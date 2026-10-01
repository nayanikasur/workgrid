import { Schema, model } from 'mongoose';

/** One row per signed-in device. Refresh tokens are rotated on every use. */
const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    /** The token this one replaced stays valid briefly so concurrent tabs don't race. */
    prevTokenHash: { type: String, index: true },
    rotatedAt: { type: Date },
    userAgent: { type: String, default: '' },
    // TTL index: Mongo removes the session once it expires.
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: true },
);

export const Session = model('Session', sessionSchema);
