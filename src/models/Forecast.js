const mongoose=require("mongoose");

const forecastSchema=new mongoose.Schema(
    {
        product:{
            type:mongoose.Schema.Types.ObjectId,
            ref:"Product"
        },
        branch:{
            type:mongoose.Schema.Types.ObjectId,
            ref:"Branch"
        },
        forecastDate:Date,

        predictedDemand:Number,

        confidenceScore:Number,

        forecastPeriod:{
            type:String,
            enum:["DAILY","WEEKLY","MONTHLY"]
        },
        aiInsight:String

    },
    {timestamps:true}
);

module.exports=mongoose.model("Forecast",forecastSchema)