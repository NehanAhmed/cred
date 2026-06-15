import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    username:{
        type:String,
        required:true,
        unique:true
    },
    email:{
        type:String,
        required:true,
        unique:true
    },
    password:{
        type:String,
        required:true
    },
    bio:{
        type:String,
        required:false
    },
    phoneNumber:{
        type:Number,
        required:false
    },
    gender:{
        type:String,
        required:true
    }


})

const userModel = mongoose.model("User",userSchema)

export default userModel;