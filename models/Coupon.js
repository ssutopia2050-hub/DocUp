import mongoose from "mongoose";

/**
 * Coupon Model
 *
 * Supports two discount types:
 *   "flat"      → deducts a fixed ₹ amount from the payment (min ₹1 charged)
 *   "docscore"  → credits bonus DocScore after payment succeeds (no price change)
 *
 * Scope:
 *   applicable_to: "all"            → any logged-in user can redeem
 *   applicable_to: "specific_users" → only emails listed in allowed_users can redeem
 *
 * Usage control:
 *   max_uses    → global cap across all users (e.g. first 100 redemptions)
 *   used_by     → array of emails; prevents the same user redeeming twice
 *
 * Applies to which pages:
 *   applies_to: "recharge"      → only /pricing (one-time recharge)
 *   applies_to: "subscription"  → only /upgrade-plans (monthly sub)
 *   applies_to: "both"          → works on either page
 */

const couponSchema = new mongoose.Schema(
    {
        code: {
            type: String,
            required: true,
            unique: true,
            uppercase: true,
            trim: true
        },

        type: {
            type: String,
            required: true,
            enum: ["flat", "docscore"]
        },

        // ── flat: how many ₹ to knock off the order amount
        flat_discount: {
            type: Number,
            default: 0,
            min: 0
        },

        // ── docscore: how many bonus DocScore to credit after payment
        docscore_bonus: {
            type: Number,
            default: 0,
            min: 0
        },

        // ── usage cap (global across all users)
        max_uses: {
            type: Number,
            required: true,
            min: 1
        },

        used_count: {
            type: Number,
            default: 0
        },

        // ── track which users have already redeemed (prevents re-use)
        used_by: [
            {
                _id: false,
                email: {
                    type: String,
                    trim: true,
                    lowercase: true
                },
                redeemedAt: {
                    type: Date,
                    default: Date.now
                }
            }
        ],

        // ── who can use this code
        applicable_to: {
            type: String,
            enum: ["all", "specific_users"],
            default: "all"
        },

        // ── only populated when applicable_to === "specific_users"
        allowed_users: [
            {
                _id: false,
                email: {
                    type: String,
                    trim: true,
                    lowercase: true
                }
            }
        ],

        // ── which payment flow this coupon works on
        applies_to: {
            type: String,
            enum: ["recharge", "subscription", "both"],
            default: "both"
        },

        active: {
            type: Boolean,
            default: true
        },

        // ── optional expiry; null means never expires
        expires_at: {
            type: Date,
            default: null
        },

        // ── human-readable label shown in admin panel
        description: {
            type: String,
            default: ""
        }
    },
    { timestamps: true }
);

// ── Index for fast lookups by code
couponSchema.index({ code: 1 });

/**
 * Instance method: check if this coupon is valid for a given user + context.
 * Returns { valid: boolean, reason?: string }
 */
couponSchema.methods.validate = function (userEmail, context) {
    const now = new Date();

    if (!this.active) {
        return { valid: false, reason: "This coupon is inactive." };
    }

    if (this.expires_at && now > this.expires_at) {
        return { valid: false, reason: "This coupon has expired." };
    }

    if (this.used_count >= this.max_uses) {
        return { valid: false, reason: "This coupon has reached its usage limit." };
    }

    const email = userEmail.toLowerCase().trim();

    const alreadyUsed = this.used_by.some(entry => entry.email === email);
    if (alreadyUsed) {
        return { valid: false, reason: "You have already used this coupon." };
    }

    if (this.applicable_to === "specific_users") {
        const allowed = this.allowed_users.some(entry => entry.email === email);
        if (!allowed) {
            return { valid: false, reason: "This coupon is not valid for your account." };
        }
    }

    // context = "recharge" | "subscription"
    if (this.applies_to !== "both" && this.applies_to !== context) {
        const label = context === "recharge" ? "subscription plans" : "recharge";
        return { valid: false, reason: `This coupon only applies to ${label}.` };
    }

    return { valid: true };
};

export default mongoose.model("Coupon", couponSchema);