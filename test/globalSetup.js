var { MongoMemoryReplSet } = require('mongodb-memory-server');

module.exports = async () => {
  process.env.elasticsearchIndexPrefix = "test_odr2_"
  process.env.uploads_folder = "uploads_testing";
  process.env.is_test = "true";
}