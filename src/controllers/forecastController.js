const Forecast = require("../models/Forecast");

const forecastService =
require("../services/forecastService");

exports.runForecast=async(req,res)=>{
    await forecastService.generateForecast();

    res.json({
        success:true,
        message:"Forecast generation started"
    });
};

exports.getForecasts = async (req, res) => {

    try {

        const forecasts = await Forecast.find()
            .populate("product")
            .populate("branch")
            .sort({ forecastDate: 1 });

        res.json(forecasts);

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

};