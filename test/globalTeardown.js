// const MongoDB = require('../lib/mongoDB');

module.exports = async function globalSetup() {
  // await MongoDB.close();

  await global.replset.stop();
  delete global.replset;
}