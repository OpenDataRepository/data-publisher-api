var { MongoMemoryReplSet } = require('mongodb-memory-server');
// var { init: appInit } = require('../app');

module.exports = async function globalSetup() {
  let replset = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger'} });
  let uri = replset.getUri();
  process.env.DB = uri;
  global.replset = replset;

  // TODO: the app should be initialized from here, the global setup.
  // But for some reason I don't understand, if I initialize here, the mongoDB connection doesn't exist in the actual tests
  // So eventually come back and figure this out.

  // await appInit();
}