const express = require("express");

const router = express.Router();

const {
    runForecast,
    getForecasts
} = require("../controllers/forecastController");

router.post("/run", runForecast);

router.get("/", getForecasts);

module.exports = router;