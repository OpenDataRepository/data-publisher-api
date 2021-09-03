var { MongoMemoryReplSet } = require('mongodb-memory-server');

module.exports = async function globalSetup() {
  let replset = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger'} });
  let uri = replset.getUri();
  process.env.DB = uri;
  global.replset = replset;
}