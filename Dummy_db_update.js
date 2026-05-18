import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import PaymentOrder from "./models/paymentOrder.js";

const MONGO_URI = process.env.MONGO_URI;

async function deleteUserOrders() {
    if (!MONGO_URI) {
        console.error("❌ MONGO_URI not found in .env");
        process.exit(1);
    }

    try {
        await mongoose.connect(MONGO_URI);
        console.log("✅ Connected");

        const result = await PaymentOrder.deleteMany({
            user_email:"ssbiology26@gmail.com",
        });

        console.log(`🔥 Deleted ${result.deletedCount} documents`);

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

deleteUserOrders();