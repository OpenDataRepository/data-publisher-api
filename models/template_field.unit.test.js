const Util = require('../lib/util');
const rewire = require("rewire");
const TF = rewire('./template_field');

// TODO: I need to check for explicit errors. "Rejects" is just too vague
// TODO: also continue these unit tests
describe('validateAndCreateOrUpdateField', () => {
  describe('common between create and update', () => {
    test('field must be an object', async() => {
      await expect(TF.validateAndCreateOrUpdateField(null, null)).rejects;
    });
    test('field name must be valid', async() => {
      await expect(TF.validateAndCreateOrUpdateField({uuid: "34", name: 5}, null)).rejects;
    });
    test('field description must be valid', async() => {
      await expect(TF.validateAndCreateOrUpdateField({uuid: "34", description: 5}, null)).rejects;
    });
    test('there must be no more than one draft of this field', async () => {
      const findMock = jest.fn();
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
      await expect(TF.validateAndCreateOrUpdateField({uuid: "34"}, null)).rejects;
      revert();
    });
  });

  describe('update', () => {
    test('field uuid must be valid', async () => {
      await expect(TF.validateAndCreateOrUpdateField({uuid: 5}, null, 5)).rejects;
      await expect(TF.validateAndCreateOrUpdateField({uuid: "5"}, null, 5)).rejects;
      await expect(TF.validateAndCreateOrUpdateField({uuid: "5"}, null, 5)).rejects;
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
      await expect(TF.validateAndCreateOrUpdateField({uuid: "34"}, null)).rejects;
      revert();
    });
  });

  // TODO: Test that for create a valid new uuid is generated

});