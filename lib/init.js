const MongoDB = require('./mongoDB');
const templateModel = require('../models/template');

module.exports = async function() {
    var mongoDbUri = process.env.DB;
    await MongoDB.connect(mongoDbUri);
    console.log('connected to mongo successfully');
    await templateModel.init();
}