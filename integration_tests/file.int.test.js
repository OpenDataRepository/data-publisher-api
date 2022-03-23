const request = require("supertest");
const fs = require('fs');
const path = require('path');
var { app, init: appInit } = require('../app');

var HelperClass = require('./common_test_operations')
var Helper = new HelperClass(app);

const uploadFile = async (uuid, file) => {
  return await request(app)
    .post(`/file/${uuid}`)
    .attach('file', file);
}

const getFile = async (uuid) => {
  return await request(app)
    .get(`/file/${uuid}`);
}

const dynamicTestFilesPath = __dirname + '/test_data/dynamic_files'
const uploadsDirectoryPath = __dirname + "/../uploads"
const clearFilesAtPath = (directory) => {
  fs.readdir(directory, (err, files) => {
    if (err) throw err;
  
    for (let file of files) {
      fs.unlink(path.join(directory, file), err => {
        if (err) throw err;
      });
    }
  });
};

beforeEach(async() => {
  clearFilesAtPath(dynamicTestFilesPath);
  clearFilesAtPath(uploadsDirectoryPath);
});

afterAll(async () => {
  clearFilesAtPath(dynamicTestFilesPath);
  clearFilesAtPath(uploadsDirectoryPath);
});

test("Upload an image", async () => {
  let new_file_path = path.join(dynamicTestFilesPath, "toUpload.txt");
  let originalFileContents = 'Hey there!';
  fs.writeFileSync(new_file_path, originalFileContents);
  let uuid = "aUuid";

  await Helper.testAndExtract(uploadFile, uuid, new_file_path);

  let response = await getFile(uuid);
  expect(response.statusCode).toBe(200);
  let newFileBuffer = response.body;
  let newFileContents = newFileBuffer.toString();
  expect(newFileContents).toEqual(originalFileContents);


});