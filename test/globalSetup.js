var { MongoMemoryReplSet } = require('mongodb-memory-server');

module.exports = async () => {
  // Create an in-memory db with a repl set, which is needed for tests with transactions
  // wiredTiger is the default storage engine for MongoDB. It is needed for multi-document transaction
  // https://github.com/nodkz/mongodb-memory-server/blob/master/docs/guides/quick-start-guide.md#replicaset
  let replset = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger'} });
  let uri = replset.getUri();
  process.env.DB = uri;
  process.env.uploads_folder = "uploads_testing";
  process.env.is_test = "true";
  global.replset = replset;
}