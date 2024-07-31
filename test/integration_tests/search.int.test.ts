var src_path = '../../src';
var { PermissionTypes } = require(src_path + '/models/permission');
var { app, init: appInit, close: appClose } = require(src_path + '/app');
var HelperClass = require('../common_test_operations');
var Helper = new HelperClass(app);
var Util = require(src_path + '/lib/util');

var agent1;
var agent2;

var replset;

beforeAll(async () => {
  let db_uri;
  [db_uri, replset] = await Helper.setupDB();
  await appInit(db_uri);
  agent2 = await Helper.createAgentRegisterLogin(Helper.EMAIL_2, Helper.DEF_PASSWORD);
  agent1 = await Helper.createAgentRegisterLogin(Helper.DEF_EMAIL, Helper.DEF_PASSWORD);
});

beforeEach(async() => {
  await Helper.clearDatabaseExceptForUsers();
  Helper.setAgent(agent1);
});

afterAll(async () => {
  await Helper.clearDatabase();
  await replset.stop();
  await appClose();
});

describe("Search in published", () => {
  test("Search Success", async () => {
    let template: any = {
      name:"t1",
      fields: [
        {
          name: "name"
        }
      ],
      public_date: (new Date()).toISOString()
    };
    template = await Helper.templateCreatePersistTest(template);
  
    let public_date_1 = (new Date()).toISOString();
    let dataset: any = {
      template_id: template._id,
      public_date: public_date_1
    };
    dataset = await Helper.datasetCreatePersistTest(dataset);

    let record_1 = {
      dataset_uuid: dataset.uuid,
      fields: [
        {
          uuid: template.fields[0].uuid,
          name: "name", 
          value: "record1"
        }
      ]
    };
    let record_2 = {
      dataset_uuid: dataset.uuid,
      fields: [
        {
          uuid: template.fields[0].uuid,
          name: "name", 
          value: "record2"
        }
      ]
    };
    record_1 = await Helper.recordCreateAndTest(record_1);
    record_2 = await Helper.recordCreateAndTest(record_2);

    // persist the first record
    await Helper.recordPersistAndTest(record_1);
    await Helper.recordPersistAndTest(record_2);

    let published_name = "publish";
    await Helper.testAndExtract(Helper.datasetPublish, dataset.uuid, published_name);

    let search_results = await Helper.testAndExtract(Helper.datasetPublishedSearchRecords, dataset.uuid, published_name, {});
    try {
      Helper.testRecordsEqual(record_1, search_results[0]);
      Helper.testRecordsEqual(record_2, search_results[1]);
    } catch(e) {
      Helper.testRecordsEqual(record_1, search_results[1]);
      Helper.testRecordsEqual(record_2, search_results[0]);
    }

    search_results = await Helper.testAndExtract(Helper.datasetPublishedSearchRecords, dataset.uuid, published_name, {"fields.value":"record1"});
    Helper.testRecordsEqual(record_1, search_results[0]);

  });

});