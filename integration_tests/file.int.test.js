const request = require("supertest");
const fs = require('fs');
const path = require('path');
var { app, init: appInit } = require('../app');
var finalhandler = require('finalhandler')
var http = require('http')
var serveStatic = require('serve-static')
const MongoDB = require('../lib/mongoDB');

var HelperClass = require('./common_test_operations')
var Helper = new HelperClass(app);

beforeAll(async () => {
  await appInit();
});

beforeEach(async() => {
  await Helper.clearDatabase();
  Helper.clearFilesAtPath(Helper.dynamicTestFilesPath);
  Helper.clearFilesAtPath(Helper.uploadsDirectoryPath);
});

afterAll(async () => {
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

test("Upload a file directly", async () => {
  let file_name = "toUpload.txt";
  let new_file_path = path.join(Helper.dynamicTestFilesPath, file_name);
  let originalFileContents = 'Hey there!';
  fs.writeFileSync(new_file_path, originalFileContents);

  let uuid;
  [_, _, _, uuid] = await basicRecordSetup();

  await Helper.testAndExtract(Helper.uploadFileDirect, uuid, file_name);

  let response = await Helper.getFile(uuid);
  expect(response.statusCode).toBe(200);
  let newFileBuffer = response.body;
  let newFileContents = newFileBuffer.toString();
  expect(newFileContents).toEqual(originalFileContents);
});

test("Upload a file from url", async () => {
  let new_file_path = path.join(Helper.dynamicTestFilesPath, "toUpload.txt");
  let originalFileContents = 'Hey there!';
  fs.writeFileSync(new_file_path, originalFileContents);

  let uuid;
  [_, _, _, uuid] = await basicRecordSetup();

  // Serve up public/ftp folder
  var serve = serveStatic(Helper.dynamicTestFilesPath);
  // Create server
  var server = http.createServer(function onRequest (req, res) {
    serve(req, res, finalhandler(req, res))
  });
  // Listen
  server.listen(3000);

  let url = "http://localhost:3000/toUpload.txt"
  let response = await Helper.uploadFileFromUrl(uuid, url);
  server.close();
  expect(response.statusCode).toBe(200);

  response = await Helper.getFile(uuid);
  expect(response.statusCode).toBe(200);
  let newFileBuffer = response.body;
  let newFileContents = newFileBuffer.toString();
  expect(newFileContents).toEqual(originalFileContents);
});