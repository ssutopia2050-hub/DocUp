import mongoose from "mongoose";
import dotenv from "dotenv";
import PaymentOrder from "./models/paymentOrder.js";

dotenv.config();

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to DB ✅");

        const result = await PaymentOrder.deleteMany({
            status: "PENDING",
            $or: [
                { email: "vinayaklamba46@gmail.com" },
                { user_email: "vinayaklamba46@gmail.com" } // typo field
            ]
        });

        console.log(`Deleted ${result.deletedCount} documents ✅`);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();