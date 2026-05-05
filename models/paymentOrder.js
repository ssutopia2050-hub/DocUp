import mongoose from "mongoose";

const paymentOrderSchema = new mongoose.Schema({
    order_id: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },

    email: {   // ✅ matches req.user.email
        type: String,
        required: true,
        index: true,
        trim: true
    },

    plan: {    // ✅ matches planLabel
        type: String,
        required: true,
        trim: true
    },

    amount: {
        type: Number,
        required: true
    },

    docscore: {   // ✅ matches docscoreToAdd
        type: Number,
        required: true
    },

    bonus_docscore: {
        type: Number,
        default: 0
    },

    coupon_code: {
        type: String,
        default: null
    },

    status: {
        type: String,
        enum: ["PENDING", "SUCCESS", "FAILED"],
        default: "PENDING"
    },

    payment_id: {   // ✅ used in verify
        type: String,
        default: ""
    },

    gateway_response: {
        type: Object,
        default: {}
    }

}, {
    timestamps: true
});

export default mongoose.model("payment_orders", paymentOrderSchema);