import mongoose from "mongoose";

const paymentOrderSchema = new mongoose.Schema({
    user_email: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
    order_id: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    plan_key: {
        type: String,
        required: true,
        trim: true
    },
    plan_label: {
        type: String,
        required: true,
        trim: true
    },
    amount: {
        type: Number,
        required: true
    },
    docscore_to_add: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ["PENDING", "SUCCESS", "FAILED"],
        default: "PENDING"
    },
    txn_id: {
        type: String,
        default: ""
    },
    payment_mode: {
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