const MongoDB = require('./mongoDB');
const templateModel = require('../models/template');
const recordModel = require('../models/record');

module.exports = async function() {
    var mongoDbUri = process.env.DB;
    await MongoDB.connect(mongoDbUri);
    console.log('connected to mongo successfully');
    await templateModel.init();
    await recordModel.init();
}