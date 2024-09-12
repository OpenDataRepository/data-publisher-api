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
const s3 = require('./s3')

module.exports = async function(mongoDb_uri, use_s3=false) {
    await MongoDB.connect(mongoDb_uri);
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
    s3.init(use_s3);
}