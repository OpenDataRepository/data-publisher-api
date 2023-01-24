const MongoDB = require('./mongoDB');
const templateModel = require('../models/template');
const datasetModel = require('../models/dataset');
const recordModel = require('../models/record');
const fileModel = require('../models/file');
const permissionModel = require('../models/permission');
const legacyUuidToNewUuidMapperModel = require('../models/legacy_uuid_to_new_uuid_mapper');
const datasetPublishModel = require('../models/datasetPublish');
const userModel = require('../models/user');
const ElasticDB = require('./elasticDB');
const elasticSearchModel = require('../models/elasticsearch');

module.exports = async function() {
    const mongoDbUri = process.env.DB;
    await MongoDB.connect(mongoDbUri);
    await templateModel.init();
    await datasetModel.init();
    await recordModel.init();
    await fileModel.init(),
    await permissionModel.init();
    await legacyUuidToNewUuidMapperModel.init();
    await datasetPublishModel.init();
    await userModel.init();
    const elasticsearchUri = process.env.elasticsearchUri;
    await ElasticDB.connect(elasticsearchUri);
    await elasticSearchModel.init();
}