import mongoose from "mongoose";

const login_data = new mongoose.Schema({
   email: String,
    loginAt:{
       type:Date,
        default:Date.now
    }
});

export default mongoose.model("login_data", login_data);