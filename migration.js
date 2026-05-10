import mongoose from "mongoose";
import dotenv from "dotenv";
import USER from "./models/users.js";

dotenv.config();

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to DB ✅");

        const result = await USER.aggregate([
            { $unwind: "$doc_view_history" },

            {
                $group: {
                    _id: "$doc_view_history",
                    views: { $sum: 1 }
                }
            },

            { $sort: { views: -1 } },
            { $limit: 10 },

            // 🔥 Join with Docs collection
            {
                $lookup: {
                    from: "docs", // collection name (IMPORTANT: lowercase plural)
                    localField: "_id",
                    foreignField: "_id",
                    as: "doc_info"
                }
            },

            { $unwind: "$doc_info" }
        ]);

        console.log("🔥 Top 10 Most Viewed Docs:\n");

        result.forEach((doc, index) => {
            console.log(
                `${index + 1}.
DocID: ${doc._id}
Views: ${doc.views}
File URL: ${doc.doc_info.file_url}\n`
            );
        });

        process.exit();

    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();