import mongoose from "mongoose";

/**
 * SaleConfig Model
 *
 * A single-document collection that holds the currently active sitewide sale.
 * There should only ever be ONE document in this collection (upserted via admin API).
 *
 * discount_percent → applied to the displayed price on the pricing/upgrade-plans pages
 *                    AND deducted from the Razorpay order amount at payment time.
 *
 * applies_to:
 *   "recharge"     → sale banner + discounted price shown only on /pricing
 *   "subscription" → sale banner + discounted price shown only on /upgrade-plans
 *   "both"         → shown and applied everywhere
 *
 * The sale is considered active when:
 *   active === true  AND  now >= starts_at  AND  now <= ends_at
 */

const saleConfigSchema = new mongoose.Schema(
    {
        // ── human-readable label shown in the banner, e.g. "Weekend Sale 🎉"
        sale_label: {
            type: String,
            required: true,
            default: "Limited Time Offer"
        },

        discount_percent: {
            type: Number,
            required: true,
            min: 1,
            max: 99
        },

        applies_to: {
            type: String,
            enum: ["recharge", "subscription", "both"],
            default: "both"
        },

        active: {
            type: Boolean,
            default: true
        },

        starts_at: {
            type: Date,
            required: true,
            default: Date.now
        },

        ends_at: {
            type: Date,
            required: true
        }
    },
    { timestamps: true }
);

/**
 * Static method: get the currently active sale (if any).
 * Returns the sale document or null.
 */
saleConfigSchema.statics.getActiveSale = async function () {
    const now = new Date();
    return this.findOne({
        active: true,
        starts_at: { $lte: now },
        ends_at:   { $gte: now }
    }).lean();
};

/**
 * Helper: given a base price and a sale document, return the discounted price.
 * Always rounds to nearest integer and ensures minimum of ₹1.
 */
saleConfigSchema.statics.applyDiscount = function (basePrice, sale) {
    if (!sale) return basePrice;
    const discounted = Math.round(basePrice * (1 - sale.discount_percent / 100));
    return Math.max(1, discounted);
};

export default mongoose.model("SaleConfig", saleConfigSchema);