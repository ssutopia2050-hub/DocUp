import mongoose from "mongoose";

const collectionSchema = new mongoose.Schema(
    {
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "user_profile",
            required: true,
            index: true
        },

        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 80
        },

        description: {
            type: String,
            trim: true,
            maxlength: 300,
            default: ""
        },

        emoji: {
            type: String,
            default: "📁"
        },

        color: {
            type: String,
            default: "#ff6a00"
        },

        docs: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Docs"
            }
        ],

        isPublic: {
            type: Boolean,
            default: false
        },

        pinned: {
            type: Boolean,
            default: false
        },

        tags: [{ type: String, trim: true }]
    },
    {
        timestamps: true   // adds createdAt + updatedAt automatically
    }
);

// Virtual: doc count without fetching full docs array
collectionSchema.virtual("docCount").get(function () {
    return this.docs.length;
});

collectionSchema.set("toJSON",   { virtuals: true });
collectionSchema.set("toObject", { virtuals: true });

export default mongoose.model("Collection", collectionSchema);