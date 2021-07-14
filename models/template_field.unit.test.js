const TF = require('./template_field');
const Util = require('../lib/util');

jest.mock('MongoDB');

// TODO: After adding the describe blocks, there is an error. Figure this out.
// TODO: add the next test using mocks. Reference https://stackoverflow.com/questions/43265944/is-there-any-way-to-mock-private-functions-with-jest

describe('validateAndCreateOrUpdateField', () => {
  describe('common between create and update', () => {
    test('field must be an object', async() => {
      await expect(TF.validateAndCreateOrUpdateField(null, null, null)).rejects.toThrowError(Util.InputError);
    });
  });

  describe('update', () => {
    test('provided uuid and field uuid must match', async () => {
      await expect(TF.validateAndCreateOrUpdateField({uuid: "a"}, null, "b")).rejects.toThrowError(Util.InputError);
    });
    test('field uuid is valid', async () => {
      await expect(TF.validateAndCreateOrUpdateField({uuid: 5}, null, 5)).rejects.toThrowError(Util.InputError);
    });
    test('field uuid is valid', async () => {
      await expect(TF.validateAndCreateOrUpdateField({uuid: "34"}, null, "34")).rejects.toThrowError(Util.InputError);
    });

  });

});