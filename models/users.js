import mongoose from "mongoose";

const user_profile = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },

    password: {
        type: String,
        required: true,
        trim: true
    },

    name: {
        type: String,
        required: true,
        trim: true
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

    payment_history: [
        {
            amount: {
                type: Number,
                default: 0
            },
            plan: {
                type: String,
                default: ""
            },
            payment_id: {
                type: String,
                default: ""
            },
            status: {
                type: String,
                default: ""
            },
            date: {
                type: Date,
                default: Date.now
            }
        }
    ]
});

export default mongoose.model("user_profile", user_profile);