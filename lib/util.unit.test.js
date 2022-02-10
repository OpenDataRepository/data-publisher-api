const Util = require('./util');


test('isObject', () => {
  expect(Util.isObject({})).toBeTruthy();
  expect(Util.isObject(undefined)).toBeFalsy();
  expect(Util.isObject(null)).toBeFalsy();
  expect(Util.isObject([])).toBeFalsy();
  expect(Util.isObject(10)).toBeFalsy();
  expect(Util.isObject("hello")).toBeFalsy();
})

test('arrayEqual', () => {
  expect(Util.arrayEqual([], [])).toBeTruthy();
  expect(Util.arrayEqual([undefined], [null])).toBeTruthy();
  expect(Util.arrayEqual([""], [""])).toBeTruthy();
  expect(Util.arrayEqual([5], [5])).toBeTruthy();
  expect(Util.arrayEqual([8, "dog", "cat"], ["cat", "dog", 8])).toBeTruthy(); 

  expect(Util.arrayEqual([""], [])).toBeFalsy();
  expect(Util.arrayEqual([""], ["1"])).toBeFalsy();
  expect(Util.arrayEqual([undefined], [])).toBeFalsy();
  expect(Util.arrayEqual([null], [])).toBeFalsy();
  expect(Util.arrayEqual([0, 1, 2, 3], [0, 1, 2, 4])).toBeFalsy();

  expect(() => Util.arrayEqual(undefined, [])).toThrow();
  expect(() => Util.arrayEqual([], "")).toThrow();
  expect(() => Util.arrayEqual(null, null)).toThrow();
})

test('datesEqual', () => {
  expect(Util.datesEqual(null, null)).toBeTruthy();
  expect(Util.datesEqual(undefined, undefined)).toBeTruthy();
  let date = new Date();
  expect(Util.datesEqual(date, date)).toBeTruthy();
  expect(Util.datesEqual(new Date("2011-09-29 14:58:12"), new Date("2011-09-29 14:58:12"))).toBeTruthy();

  expect(Util.datesEqual(undefined, new Date())).toBeFalsy();
  expect(Util.datesEqual(new Date(), null)).toBeFalsy();
})

test('anyDuplicateInArray', () => {
  expect(Util.anyDuplicateInArray(['a', 'a'])).toBeTruthy();

  expect(Util.anyDuplicateInArray(['a', 'b'])).toBeFalsy();
})