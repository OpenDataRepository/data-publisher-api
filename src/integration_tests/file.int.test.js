const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
var { app, init: appInit, close: appClose } = require('../app');
const FieldTypes = require('../models/template_field').FieldTypes;

var HelperClass = require('./common_test_operations')
var Helper = new HelperClass(app);

var server;
var serverUrl;
var agent1;
var agent2;

beforeAll(async () => {
  await appInit();
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
  await appClose();
});

const basicRecordSetup = async () => {
  let template = {
    name: "t",
    fields: [{
      name: "tf",
      type: FieldTypes.File
    }]
  };
  template = await Helper.templateCreatePersistTest(template);

  let dataset = {
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
  let file_name = "toUpload.txt";
  let new_file_path = path.join(Helper.dynamicTestFilesPath, file_name);
  let originalFileContents = 'Hey there!';
  fs.writeFileSync(new_file_path, originalFileContents);
  return [file_name, originalFileContents]
};

describe("success", () => {

  test("Upload a file directly (and fetch it)", async () => {
    let uuid;
    [, , , uuid] = await basicRecordSetup();
  
    let file_name, originalFileContents 
    [file_name, originalFileContents] = basicFileSetup();
  
    await Helper.testAndExtract(Helper.uploadFileDirect, uuid, file_name);
  
    let response = await Helper.getFile(uuid);
    expect(response.statusCode).toBe(200);
    let newFileBuffer = response.body;
    let newFileContents = newFileBuffer.toString();
    expect(newFileContents).toEqual(originalFileContents);
  });
  
  test("Upload a large file directly (and fetch it)", async () => {
    let uuid;
    [, , , uuid] = await basicRecordSetup();
  
    let file_name = "someFile.txt";
    let old_file_path = Helper.testDataPath + '/rruff_samples.json'
    let new_file_path = path.join(Helper.dynamicTestFilesPath, file_name);
    await fsPromises.copyFile(old_file_path, new_file_path);
    let raw_data = fs.readFileSync(new_file_path);
  
    await Helper.testAndExtract(Helper.uploadFileDirect, uuid, file_name);
  
    let response = await Helper.getFile(uuid);
    expect(response.statusCode).toBe(200);
    let newFileBuffer = response.body;
    expect(newFileBuffer.toString()).toEqual(raw_data.toString());
  });
  
  // If tests start failing with 404 errors, it could be because we need to runInBand. Or, they all are using the same file name
  test("Upload a file from url (and fetch it)", async () => {
    let file_name, originalFileContents 
    [file_name, originalFileContents] = basicFileSetup();
  
    let uuid;
    [, , , uuid] = await basicRecordSetup();
  
    let url = serverUrl + file_name;
    let response = await Helper.uploadFileFromUrl(uuid, url);
    expect(response.statusCode).toBe(200);
  
    response = await Helper.getFile(uuid);
    expect(response.statusCode).toBe(200);
    let newFileBuffer = response.body;
    let newFileContents = newFileBuffer.toString();
    expect(newFileContents).toEqual(originalFileContents);
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
    let newFileBuffer = response.body;
    expect(newFileBuffer.toString()).toEqual(raw_data.toString());
  });

});

describe("failure", () => {

  test("file with uuid does not exist", async () => {
    let file_name 
    [file_name, ] = basicFileSetup();
    let response = await Helper.uploadFileDirect(Helper.VALID_UUID, file_name);
    expect(response.statusCode).toBe(404);

    let url = serverUrl + "toUpload.txt";
    response = await Helper.uploadFileFromUrl(Helper.VALID_UUID, url);
    expect(response.statusCode).toBe(404);

    response = await Helper.getFile(Helper.VALID_UUID);
    expect(response.statusCode).toBe(404);
  });

  test("don't have edit permissions for file", async () => {
    let uuid;
    [, , , uuid] = await basicRecordSetup();

    Helper.setAgent(agent2);

    let file_name; 
    [file_name, ] = basicFileSetup();
    let response = await Helper.uploadFileDirect(uuid, file_name);
    expect(response.statusCode).toBe(401);

    let url = serverUrl + "toUpload.txt";
    response = await Helper.uploadFileFromUrl(uuid, url);
    expect(response.statusCode).toBe(401);

    Helper.setAgent(agent1);
    response = await Helper.uploadFileDirect(uuid, file_name);
    expect(response.statusCode).toBe(200);

    Helper.setAgent(agent2);
    response = await Helper.getFile(uuid);
    expect(response.statusCode).toBe(401);
  });

  test("file to upload doesn't exist", async () => {
    let uuid;
    [, , , uuid] = await basicRecordSetup();

    let url = serverUrl + "toUpload.txt";
    let response = await Helper.uploadFileFromUrl(uuid, url);
    expect(response.statusCode).toBe(400);
  });

  test("file to fetch doesn't exist", async () => {
    let uuid;
    [, , , uuid] = await basicRecordSetup();

    let response = await Helper.getFile(uuid);
    expect(response.statusCode).toBe(404);
  });
  
});