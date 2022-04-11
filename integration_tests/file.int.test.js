const request = require("supertest");
const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
var { app, init: appInit } = require('../app');
var finalhandler = require('finalhandler')
var http = require('http')
var serveStatic = require('serve-static')
const MongoDB = require('../lib/mongoDB');

var HelperClass = require('./common_test_operations')
var Helper = new HelperClass(app);

var server;
var serverUrl;

const basicServerSetup = () => {
  // Serve up public/ftp folder
  var serve = serveStatic(Helper.dynamicTestFilesPath);
  // Create server
  server = http.createServer(function onRequest (req, res) {
  serve(req, res, finalhandler(req, res))
  });
  // Listen
  server.listen(3000);

  serverUrl = "http://localhost:3000/";
}

beforeAll(async () => {
  await appInit();
  basicServerSetup();
});

beforeEach(async() => {
  await Helper.clearDatabase();
  Helper.clearFilesAtPath(Helper.dynamicTestFilesPath);
  Helper.clearFilesAtPath(Helper.uploadsDirectoryPath);
});

afterAll(async () => {
  server.close();
  Helper.clearFilesAtPath(Helper.dynamicTestFilesPath);
  Helper.clearFilesAtPath(Helper.uploadsDirectoryPath);
  await Helper.clearDatabase();
  await MongoDB.close();
});

const basicRecordSetup = async () => {
  let template = {
    name: "t",
    fields: [{
      name: "tf",
      type: "file"
    }]
  };
  template = await Helper.templateCreatePersistTest(template, Helper.DEF_CURR_USER);

  let dataset = {
    template_id: template._id
  };
  dataset = await Helper.datasetCreatePersistTest(dataset, Helper.DEF_CURR_USER);

  let record = {
    dataset_uuid: dataset.uuid,
    fields: [{
      uuid: template.fields[0].uuid,
      value: "new" 
    }]
  }
  record = await Helper.recordCreateAndTest(record, Helper.DEF_CURR_USER);
  let file_uuid = record.fields[0].value;

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
    [_, _, _, uuid] = await basicRecordSetup();
  
    let file_name, originalFileContents 
    [file_name, originalFileContents] = basicFileSetup();
  
    await Helper.testAndExtract(Helper.uploadFileDirect, uuid, file_name, Helper.DEF_CURR_USER);
  
    let response = await Helper.getFile(uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
    let newFileBuffer = response.body;
    let newFileContents = newFileBuffer.toString();
    expect(newFileContents).toEqual(originalFileContents);
  });
  
  test("Upload a large file directly (and fetch it)", async () => {
    let uuid;
    [_, _, _, uuid] = await basicRecordSetup();
  
    let file_name = "someFile.txt";
    let old_file_path = __dirname + '/test_data/rruff_samples.json'
    let new_file_path = path.join(Helper.dynamicTestFilesPath, file_name);
    await fsPromises.copyFile(old_file_path, new_file_path);
    let raw_data = fs.readFileSync(new_file_path);
  
    await Helper.testAndExtract(Helper.uploadFileDirect, uuid, file_name, Helper.DEF_CURR_USER);
  
    let response = await Helper.getFile(uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
    let newFileBuffer = response.body;
    expect(newFileBuffer).toEqual(raw_data);
  });
  
  // If tests start failing with 404 errors, it could be because we need to runInBand. Or, they all are using the same file name
  test("Upload a file from url (and fetch it)", async () => {
    let file_name, originalFileContents 
    [file_name, originalFileContents] = basicFileSetup();
  
    let uuid;
    [_, _, _, uuid] = await basicRecordSetup();
  
    let url = serverUrl + file_name;
    let response = await Helper.uploadFileFromUrl(uuid, url, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
  
    response = await Helper.getFile(uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
    let newFileBuffer = response.body;
    let newFileContents = newFileBuffer.toString();
    expect(newFileContents).toEqual(originalFileContents);
  });
  
  test("Upload a large file from url (and fetch it)", async () => {
    let uuid;
    [_, _, _, uuid] = await basicRecordSetup();
  
    let file_name = "toUpload.txt";
    let old_file_path = __dirname + '/test_data/rruff_samples.json'
    let new_file_path = path.join(Helper.dynamicTestFilesPath, file_name);
    await fsPromises.copyFile(old_file_path, new_file_path);
    let raw_data = fs.readFileSync(new_file_path);
  
    let url = serverUrl + file_name;
    let response = await Helper.uploadFileFromUrl(uuid, url, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
  
    response = await Helper.getFile(uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(200);
    let newFileBuffer = response.body;
    expect(newFileBuffer).toEqual(raw_data);
  });

});

describe("failure", () => {

  test("file with uuid does not exist", async () => {
    let file_name 
    [file_name, _] = basicFileSetup();
    let response = await Helper.uploadFileDirect(Helper.VALID_UUID, file_name, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(404);

    let url = serverUrl + "toUpload.txt";
    response = await Helper.uploadFileFromUrl(Helper.VALID_UUID, url, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(404);

    response = await Helper.getFile(Helper.VALID_UUID, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(404);
  });

  test("don't have edit permissions for file", async () => {
    let uuid;
    [_, _, _, uuid] = await basicRecordSetup();

    let file_name; 
    [file_name, _] = basicFileSetup();
    let response = await Helper.uploadFileDirect(uuid, file_name, Helper.USER_2);
    expect(response.statusCode).toBe(401);

    let url = serverUrl + "toUpload.txt";
    response = await Helper.uploadFileFromUrl(uuid, url, Helper.USER_2);
    expect(response.statusCode).toBe(401);

    response = await Helper.getFile(uuid, Helper.USER_2);
    expect(response.statusCode).toBe(401);
  });

  test("file to upload doesn't exist", async () => {
    let uuid;
    [_, _, _, uuid] = await basicRecordSetup();

    let url = serverUrl + "toUpload.txt";
    response = await Helper.uploadFileFromUrl(uuid, url, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(400);
  });

  test("file to fetch doesn't exist", async () => {
    let uuid;
    [_, _, _, uuid] = await basicRecordSetup();

    response = await Helper.getFile(uuid, Helper.DEF_CURR_USER);
    expect(response.statusCode).toBe(404);
  });
  
});