const MongoDB = require('../lib/mongoDB');
var { init: appInit } = require('../app');


beforeAll(async () => {
  await appInit();
});

afterAll(async () => {
  await MongoDB.close();
});