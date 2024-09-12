var { MongoMemoryReplSet } = require('mongodb-memory-server');

module.exports = async () => {
  process.env.elasticsearchIndexPrefix = "test_odr2_"
  process.env.local_file_storage_location = "test/uploads_testing";
  process.env.is_test = "true";
  process.env.use_s3 = 'false';
}