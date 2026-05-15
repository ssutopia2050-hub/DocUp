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

    saved_profiles: [
        {
            _id: false,
            email: {
                type: String,
                trim: true,
                lowercase: true
            }
        }
    ],

    notifications: [
        {
            _id: false,

            email: {
                type: String,
                trim: true,
                lowercase: true
            },

            content: {
                type: String
            },

            /*
             * category  — drives colour-coding on the notifications page
             *
             * "document"  → blue   — doc views, saves, uploads going live
             * "docscore"  → amber  — DocScore earned / deducted
             * "system"    → purple — platform announcements, maintenance
             * "profile"   → teal  — account changes, login alerts
             * "payment"   → green — subscription, recharge confirmations
             */
            category: {
                type: String,
                enum: ["document", "docscore", "system", "profile", "payment"],
                default: "system"
            },

            createdAt: {
                type: Date,
                default: Date.now
            },

            isRead: {
                type: Boolean,
                default: false
            }
        }
    ],

    Doc_score: {
        type: Number,
        required: true,
        default: 1
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

    // These three fields MUST be in the schema or Mongoose strict mode
    // silently drops them — which caused subscription_id to never be saved,
    // making the PENDING-reuse logic in /buy-subscription unable to work.
    subscription_id: {
        type: String,
        default: null
    },

    subscription_status: {
        type: String,
        enum: ["PENDING", "ACTIVE", "PAST_DUE", "CANCELLED", null],
        default: null
    },

    subscription_plan_key: {
        type: String,
        default: null
    },

    user_type: {
        type: String,
        required: true,
        default: "DocUp Member",
        enum: ["DocUp Member", "DocUp Admin", "DocUp Developer", "Verified Uploader", "Creator"]
    },

    payment_history: [
        {
            order_id: { type: String, default: "" },
            payment_id: { type: String, default: "" },
            amount: { type: Number, default: 0 },
            plan: { type: String, default: "" },
            docscore_added: { type: Number, default: 0 },
            status: {
                type: String,
                enum: ["SUCCESS", "FAILED", "PENDING"],
                default: "SUCCESS"
            },
            date: { type: Date, default: Date.now }
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

    last_doc_views: [
        {
            doc_id: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Docs"
            },
            viewed_at: {
                type: Date,
                default: Date.now
            }
        }
    ],

    popup: [
        {
            title: String,
            body: String,
            image: String,
            url: String,
            subject: String,
            college: String,
            startDate: String,
            endDate: String,
            button_text: String
        }
    ]
});

export default mongoose.model("user_profile", user_profile);