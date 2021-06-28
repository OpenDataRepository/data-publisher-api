const MongoDB = require('./mongoDB');
const templateModel = require('../models/template');
const indexController = require('../controllers/indexController');


module.exports = async function() {
    const mongoDbUri = process.env.DB;
    await MongoDB.connect(mongoDbUri);
    console.log('connected to mongo successfully');
    templateModel.init();
}