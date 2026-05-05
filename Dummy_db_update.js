import mongoose from "mongoose";
import dotenv from "dotenv";
import Coupon from "./models/Coupon.js";

dotenv.config();

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to DB ✅");

        const coupon = new Coupon({
            code: "LAUNCH50",
            type: "flat",           // "flat" or "docscore"
            flat_discount: 50,      // ₹50 off
            docscore_bonus: 0,      // only used if type = "docscore"
            max_uses: 100,
            applies_to: "both",     // "recharge" | "subscription" | "both"
            description: "Test launch coupon",
            active: true
        });

        await coupon.save();

        console.log("Coupon created 🚀:", coupon.code);

        process.exit(0);
    } catch (err) {
        console.error("Error ❌:", err.message);
        process.exit(1);
    }
}

run();