var fs = require('fs');

var src_path = '../../src';
var { app, init: appInit, close: appClose } = require(src_path + '/app');
var { PermissionTypes } = require( src_path + '/models/permission');
var HelperClass = require('../common_test_operations');
var Helper = new HelperClass(app);

var agent1;
var agent2;

var replset;

beforeAll(async () => {
  let db_uri;
  [db_uri, replset] = await Helper.setupDB();
  await appInit(db_uri);
  agent2 = await Helper.createAgentRegisterLogin(Helper.EMAIL_2, Helper.DEF_PASSWORD);
  agent1 = await Helper.createAgentRegisterLogin(Helper.DEF_EMAIL, Helper.DEF_PASSWORD);
  Helper.clearFilesAtPath(Helper.dynamicTestFilesPath);
  Helper.clearFilesAtPath(Helper.uploadsDirectoryPath);
});

beforeEach(async() => {
  await Helper.clearDatabaseExceptForUsers();
  Helper.setAgent(agent1);
});

afterAll(async () => {
  Helper.clearFilesAtPath(Helper.dynamicTestFilesPath);
  Helper.clearFilesAtPath(Helper.uploadsDirectoryPath);
  await appClose();
  await replset.stop();
});

test("import records with rruff data", async () => {
  // The rruff data has an isLink, which is the imalist. In the new system, isLink means only view permissions
  // So import the imalist with user 2, then give user 1 permissions, then import the rest with user 1

  Helper.setAgent(agent2);

  let rruff_imalist_template_raw_data = fs.readFileSync(Helper.testDataPath + '/rruff_imalist_template.json');
  let imalist_template = JSON.parse(rruff_imalist_template_raw_data);
  let ima_list_template, ima_list_dataset;
  [ima_list_template, ima_list_dataset] = await Helper.importTemplateDatasetPersistTest(imalist_template);

  await Helper.testAndExtract(Helper.updatePermission, ima_list_template.uuid, PermissionTypes.view, [Helper.DEF_EMAIL]);
  await Helper.testAndExtract(Helper.updatePermission, ima_list_dataset.uuid, PermissionTypes.view, [Helper.DEF_EMAIL]);

  await Helper.setAgent(agent1);

  let raw_template = fs.readFileSync(Helper.testDataPath + '/rruff_sample_template.json');
  let old_template = JSON.parse(raw_template);
  await Helper.importTemplateDatasetPersistTest(old_template);


  let raw_records = fs.readFileSync(Helper.testDataPath + '/rruff_samples.json');
  let old_records = JSON.parse(raw_records).records;

  // 42 records. 169 MB with files and images. Can do the whole test at once, no problem
  let records_to_test = old_records;
  let imalist_records = Helper.extractRecordsWithDatabaseUuidfromRecords(records_to_test, "f6a700e9d45f0884c1514ec6c538");

  await Helper.setAgent(agent2);
  await Helper.importRecordsPersistTest(imalist_records);

  await Helper.setAgent(agent1);
  await Helper.importRecordsPersistTest(records_to_test);
});