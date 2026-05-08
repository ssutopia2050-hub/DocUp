import mongoose from "mongoose";
import dotenv from "dotenv";
import USER from "./models/users.js";

dotenv.config();

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to DB ✅");

        const result = await USER.updateMany(
            {}, // all users (you can add filters if needed)
            {
                $push: {
                    notifications: {
                        email: "",
                        content: "🎉 Use coupon code ENDSEM10 to get ₹10 off on your next purchase!",
                        category: "payment",
                        createdAt: new Date(),
                        isRead: false
                    }
                }
            }
        );

        console.log(`Notification sent to ${result.modifiedCount} users 🚀`);

        process.exit(0);
    } catch (err) {
        console.error("Error ❌:", err.message);
        process.exit(1);
    }
}

run();