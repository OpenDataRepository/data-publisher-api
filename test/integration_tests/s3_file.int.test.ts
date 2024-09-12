import * as fs from 'fs';
const fsPromises = fs.promises;
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

const src_path = '../../src';
const { app, init: appInit, close: appClose } = require(src_path + '/app');
const FieldTypes = require(src_path + '/models/template_field').FieldTypes;

const HelperClass = require('../common_test_operations')
const Helper = new HelperClass(app);

var server;
var serverUrl;
var agent1;
var agent2;

var replset;

beforeAll(async () => {
  let db_uri;
  [db_uri, replset] = await Helper.setupDB();
  await appInit(db_uri, true);
  agent2 = await Helper.createAgentRegisterLogin(Helper.EMAIL_2, Helper.DEF_PASSWORD);
  agent1 = await Helper.createAgentRegisterLogin(Helper.DEF_EMAIL, Helper.DEF_PASSWORD);
  [server, serverUrl] = Helper.basicServerSetup();
});

beforeEach(async() => {
  await Helper.clearDatabaseExceptForUsers();
  Helper.clearFilesAtPath(Helper.dynamicTestFilesPath);
  Helper.clearFilesAtPath(Helper.uploadsDirectoryPath);
  Helper.setAgent(agent1);
});

afterAll(async () => {
  server.close();
  Helper.clearFilesAtPath(Helper.dynamicTestFilesPath);
  Helper.clearFilesAtPath(Helper.uploadsDirectoryPath);
  await Helper.clearDatabase();
  await replset.stop();
  await appClose();
});

const basicRecordSetup = async () => {
  let template: any = {
    name: "t",
    fields: [{
      name: "tf",
      type: FieldTypes.File
    }]
  };
  template = await Helper.templateCreatePersistTest(template);

  let dataset: any = {
    template_id: template._id
  };
  dataset = await Helper.datasetCreatePersistTest(dataset);

  let record = {
    dataset_uuid: dataset.uuid,
    fields: [{
      uuid: template.fields[0].uuid,
      file: {
        uuid: "new" 
      }
    }]
  }
  record = await Helper.recordCreateAndTest(record);
  let file_uuid = record.fields[0].file.uuid;

  return [template, dataset, record, file_uuid];
};

const basicFileSetup = () => {
  let file_name = uuidv4();
  let new_file_path = path.join(Helper.dynamicTestFilesPath, file_name);
  let originalFileContents = 'Hey there!';
  fs.writeFileSync(new_file_path, originalFileContents);
  return [file_name, originalFileContents]
};

describe("from url", () => {
  test("Upload a file from url, fetch and delete", async () => {
    let file_name, originalFileContents 
    [file_name, originalFileContents] = basicFileSetup();
  
    let uuid, record;
    [, , record, uuid] = await basicRecordSetup();
  
    let url = serverUrl + file_name;
    let response = await Helper.uploadFileFromUrl(uuid, url);
    expect(response.statusCode).toBe(200);
  
    response = await Helper.getFile(uuid);
    expect(response.statusCode).toBe(200);
    expect(response.text).toEqual(originalFileContents);

    await Helper.recordDeleteAndTest(record.uuid);

    response = await Helper.getFile(uuid);
    expect(response.statusCode).toBe(404);

  });
  
  test("Upload a large file from url (and fetch it)", async () => {
    let uuid;
    [, , , uuid] = await basicRecordSetup();
  
    let file_name = "toUpload.txt";
    let old_file_path = Helper.testDataPath + '/rruff_samples.json'
    let new_file_path = path.join(Helper.dynamicTestFilesPath, file_name);
    await fsPromises.copyFile(old_file_path, new_file_path);
    let raw_data = fs.readFileSync(new_file_path);
  
    let url = serverUrl + file_name;
    let response = await Helper.uploadFileFromUrl(uuid, url);
    expect(response.statusCode).toBe(200);
  
    response = await Helper.getFile(uuid);
    expect(response.statusCode).toBe(200);
    expect(response.text).toEqual(raw_data.toString());
  });

});