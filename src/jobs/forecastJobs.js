const cron = require("node-cron");

const forecastService =
require("../services/forecastService");

const initForecastJob = () => {

    cron.schedule("0 0 * * *", async () => {

        console.log("Running AI Forecast Job");

        await forecastService.generateForecast();

    });

};

module.exports = {
    initForecastJob
};