import mongoose from "mongoose";

const user_profile = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        trim: true,
        unique: true,
        default: ""
    },

    password: {
        type: String,
        required: true,
        trim: true,
        default: ""
    },

    name: {
        type: String,
        required: true,
        trim: true,
        default: ""
    },

    google_auth: {
        type: Boolean,
        default: false
    },

    saved_documents: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Docs"
        }
    ],

    Doc_score: {
        type: Number,
        required: true,
        default: 5
    },

    uploads: [
        {
            doc_id: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Docs",
                required: true
            },
            url: String,
            subject: String,
            college: String,
            uploadedAt: {
                type: Date,
                default: Date.now
            }
        }
    ],

    subscription: {
        type: String,
        required: true,
        default: "Free Tier"
    },

    user_type: {
        type: String,
        required: true,
        default: "DocUp Member",
        enum: ["DocUp Member", "DocUp Admin", "DocUp Developer", "Verified Uploader"]
    },

    payment_history: [
        {
            order_id: {
                type: String,
                default: ""
            },
            payment_id: {
                type: String,
                default: ""
            },
            amount: {
                type: Number,
                default: 0
            },
            plan: {
                type: String,
                default: ""
            },
            docscore_added: {
                type: Number,
                default: 0
            },
            status: {
                type: String,
                enum: ["SUCCESS", "FAILED", "PENDING"],
                default: "SUCCESS"
            },
            date: {
                type: Date,
                default: Date.now
            }
        }
    ],

    doc_view_history: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Docs"
        }
    ],

    avatar_img_path: {
        type: String,
        default: null
    },
});

export default mongoose.model("user_profile", user_profile);