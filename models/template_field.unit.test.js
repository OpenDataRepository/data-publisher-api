const TF = require('./template_field');
const Util = require('../lib/util');

jest.mock('MongoDB');

// TODO: After adding the describe blocks, there is an error. Figure this out.
describe('validateAndCreateOrUpdateField', () => {
  describe('common between create and update', () => {
    test('field must be an object', () => {
      await expect(TF.validateAndCreateOrUpdateField(null, null, null)).rejects.toThrowError(Util.InputError);
    });
  });

  describe('update', () => {
    test('provided uuid and field uuid must match', () => {
      await expect(TF.validateAndCreateOrUpdateField({uuid: "a"}, null, "b")).rejects.toThrowError(Util.InputError);
    });
    test('field uuid is valid', () => {
      await expect(TF.validateAndCreateOrUpdateField({uuid: 5}, null, 5)).rejects.toThrowError(Util.InputError);
    });
    test('field uuid is valid', () => {
      await expect(TF.validateAndCreateOrUpdateField({uuid: "34"}, null, "34")).rejects.toThrowError(Util.InputError);
    });

  });

});