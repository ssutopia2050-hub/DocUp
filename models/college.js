import mongoose from "mongoose";

const college = new mongoose.Schema({
    college_name: {
        type:String,
        required:true,
        trim:true,
    },
    branch: {
        type:String,
        required:true,
        trim:true,
    },
    state: {
        type:String,
        required:true,
        trim:true,
    },
    image: {
        type:String,
        trim:true,
    },
});

export default mongoose.model("college", college);