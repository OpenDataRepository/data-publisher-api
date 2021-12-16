const MongoDB = require('./mongoDB');
const templateModel = require('../models/template');
const datasetModel = require('../models/dataset');
const recordModel = require('../models/record');
const permissionGroupModel = require('../models/permission_group');
const legacyUuidToNewUuidMapperModel = require('../models/legacy_uuid_to_new_uuid_mapper');

module.exports = async function() {
    var mongoDbUri = process.env.DB;
    await MongoDB.connect(mongoDbUri);
    console.log('connected to mongo successfully');
    await templateModel.init();
    await datasetModel.init();
    await recordModel.init();
    await permissionGroupModel.init();
    await legacyUuidToNewUuidMapperModel.init();
}