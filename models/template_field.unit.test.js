const { validate: uuidValidate } = require('uuid');
const rewire = require("rewire");
const TF = rewire('./template_field');

const ValidUUID = "47356e57-eec2-431b-8059-f61d5f9a6bc6";

describe('validateAndCreateOrUpdateField', () => {
  describe('common between create and update', () => {
    test('field must be an object', async() => {
      await expect(TF.validateAndCreateOrUpdateField(null, null))
      .rejects
      .toMatchObject({
        name: "InputError", 
        message: expect.stringMatching(/field provided is not an object/)
      });
    });
    test('field name must be valid', async() => {
      await expect(TF.validateAndCreateOrUpdateField({name: 5}, null))
      .rejects
      .toMatchObject({
        name: "InputError", 
        message: expect.stringMatching("field name property must be of type string")
      });
    });
    test('field description must be valid', async() => {
      await expect(TF.validateAndCreateOrUpdateField({description: 5}, null))
      .rejects
      .toMatchObject({
        name: "InputError", 
        message: expect.stringMatching("field description property must be of type string")
      });
    });
  });

  describe('update', () => {
    test('field uuid must be valid', async () => {
      await expect(TF.validateAndCreateOrUpdateField({uuid: 5}, null))
        .rejects
        .toMatchObject({
          name: "InputError", 
          message: expect.stringMatching("uuid must conform to standard uuid format")
        });
      await expect(TF.validateAndCreateOrUpdateField({uuid: "5"}, null))
        .rejects
        .toMatchObject({
          name: "InputError", 
          message: expect.stringMatching("uuid must conform to standard uuid format")
        });
    });
    test('field uuid must exist', async () => {
      let revert = TF.__set__("TemplateField", {
        find: async function() {
          return {
            hasNext: async function() {
              return false;
            }
          }
        }
      });
      await expect(TF.validateAndCreateOrUpdateField({uuid: ValidUUID}, null))
        .rejects
        .toMatchObject({
          name: "NotFoundError", 
          message: expect.stringMatching(/No field exists with uuid/)
        });
      revert();
    });
    test('there must be no more than one draft of this field', async () => {
      let findMock = jest.fn();
      findMock.mockReturnValueOnce({
        hasNext: async function() {
          return true;
        }
      }).mockReturnValueOnce({
        count: async function() {
          return 2;
        }
      });
      let revert = TF.__set__("TemplateField", {
        find: findMock
      });
      await expect(TF.validateAndCreateOrUpdateField({uuid: ValidUUID}, null))
        .rejects
        .toMatchObject({
          message: expect.stringMatching(/Multiple drafts found of field with uuid/)
        });
      revert();
    });
    // TODO: Eventually try to add this back. As of now, when the uuid is included, the updateMock registers no calls?
    // test('updateOne is called with the provided uuid, and the properties supplied', async () => {
    //   let findMock = jest.fn();
    //   findMock.mockReturnValueOnce({
    //     hasNext: async function() {
    //       return true;
    //     }
    //   }).mockReturnValueOnce({
    //     count: async function() {
    //       return 1;
    //     }
    //   });
    //   let updateOneMock = jest.fn();
    //   updateOneMock.mockReturnValueOnce({
    //     modifiedCount: 1
    //   });
    //   let revert = TF.__set__("TemplateField", {
    //     find: findMock,
    //     updateOne: updateOneMock
    //   });
    //   await expect(TF.validateAndCreateOrUpdateField({uuid: "47356e57-eec2-431b-8059-f61d5f9a6bc6", name: "name", description: "description"}, null))
    //     .resolves;
    //   let updateObject = updateOneMock.mock.calls[0][1]['$set'];
    //   expect(updateObject).toMatchObject({
    //     name: "name",
    //     description: "description",
    //     uuid: "47356e57-eec2-431b-8059-f61d5f9a6bc6"
    //   });
    //   revert();
    // });
  });

  describe('create', () => {
    test('success: updateOne is called with a valid uuid and the other supplied properties', async () => {
      let updateOneMock = jest.fn();
      updateOneMock.mockReturnValueOnce({
        upsertedCount: 1
      });
      let revert = TF.__set__("TemplateField", {
        updateOne: updateOneMock
      });
      await expect(TF.validateAndCreateOrUpdateField({name: "name", description: "description"}, null))
        .resolves;
      let updateObject = updateOneMock.mock.calls[0][1]['$set'];
      expect(updateObject).toMatchObject({
        name: "name",
        description: "description"
      });
      expect(uuidValidate(updateObject.uuid)).toBeTruthy();
      revert();
    });
  });

});

describe('templateFieldDraft', () => {
  test('uuid provided should be of valid uuid format', async () => {
    await expect(TF.templateFieldDraft("5", null))
      .rejects
      .toMatchObject({
        name: "InputError", 
        message: expect.stringMatching('The uuid provided is not in proper uuid format.')
      });
  });

  test('if a draft of the field already exists, it should be returned without the _id', async () => {
    var revert = TF.__set__({
      "templateFieldDraft": async (uuid) => { 
        return {
          uuid,
          _id: 5,
          name: "name",
          description: "description"
        }
      }
    });
    await expect(TF.templateFieldDraft(ValidUUID, null))
      .resolves
      .toMatchObject({
        name: "name",
        description: "description"
      });
    revert();
  });

  test('if no version of the field exists, return null', async () => {
    var revert = TF.__set__({
      "templateFieldDraft": async (uuid) => null,
      "latestPublishedTemplateField": async (uuid) => null
    });
    await expect(TF.templateFieldDraft(ValidUUID, null))
      .resolves
      .toBeNull();
    revert();
  });

  test('if a published version of the field exists but no draft, a copy should be created and returned without the _id and publish date', async () => {
    let insertOneMock = jest.fn();
    insertOneMock.mockReturnValueOnce({
      insertedCount: 1
    })
    var revert = TF.__set__({
      "templateFieldDraft": async (uuid) => null,
      "latestPublishedTemplateField": async (uuid) => {
        return {
          name: "name",
          description: "description",
          uuid: ValidUUID,
          _id: 3,
          publish_date: new Date() 
        }
      },
      "TemplateField": {
        "insertOne": insertOneMock
      }
    });
    let expectedObject = {
      name: "name",
      description: "description",
      uuid: ValidUUID
    };
    await expect(TF.templateFieldDraft(ValidUUID, null))
      .resolves
      .toMatchObject(expectedObject);
    let updateObject = insertOneMock.mock.calls[0][0];
    expect(updateObject).toMatchObject(expectedObject);
    revert();
  });
});

describe('publishField', () => {

  test("Field with uuid must exist. If not, NotFoundError", async () => {
    var revert = TF.__set__({
      "templateFieldDraft": async (uuid) => null,
      "latestPublishedTemplateField": async (uuid) => null
    });
    await expect(TF.publishField(ValidUUID))
      .rejects
      .toMatchObject({
        name: "NotFoundError", 
        message: expect.stringMatching(/Field with uuid (.)* does not exist/)
      });
    revert();
  });

  test("If draft doesn't exist, return the internal id of the latest published", async () => {
    var revert = TF.__set__({
      "templateFieldDraft": async (uuid) => null,
      "latestPublishedTemplateField": async (uuid) => {
        return {_id: 2}
      }
    });
    await expect(TF.publishField(ValidUUID))
      .resolves
      .toEqual([2, false]);
    revert();
  });

  test("If there are no changes to publish, return false for 'published'", async () => {
    var revert = TF.__set__({
      "templateFieldDraft": async (uuid) => {
        return {
          name: "name",
          description: "description",
          updated_at: new Date()
        }
      },
      "latestPublishedTemplateField": async (uuid) => {
        return {
          name: "name",
          description: "description",
          updated_at: new Date(),
          publish_date: new Date()
        }
      }
    });
    await expect(TF.publishField(ValidUUID))
      .resolves
      .toEqual([undefined, false]);
    revert();
  });

  test("If there are changes to publish, insert a new published field, update timestamp of draft, and return _id of new published field", async () => {
    let insertOneMock = jest.fn();
    insertOneMock.mockReturnValueOnce({
      insertedCount: 1,
      insertedId: 3
    });
    let updateOneMock = jest.fn();
    updateOneMock.mockReturnValueOnce({
      modifiedCount: 1
    });
    let newField = {
      name: "name",
      description: "different",
    };
    var revert = TF.__set__({
      "templateFieldDraft": async (uuid) => {
        return newField
      },
      "latestPublishedTemplateField": async (uuid) => {
        return {
          name: "name",
          description: "description",
        }
      },
      "TemplateField": {
        "insertOne": insertOneMock,
        "updateOne": updateOneMock
      }
    });
    await expect(TF.publishField(ValidUUID))
      .resolves
      .toEqual([3, true]);
    let insertObject = insertOneMock.mock.calls[0][0];
    expect(insertObject).toMatchObject(newField);
    revert();
  });

});