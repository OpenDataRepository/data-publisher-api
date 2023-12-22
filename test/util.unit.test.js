var src_path = '../src'
const Util = require(src_path + '/lib/util');


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

  let non_array = undefined;
  expect(() => Util.arrayEqual(non_array, [])).toThrow();
  non_array = "";
  expect(() => Util.arrayEqual([], non_array)).toThrow();
  non_array = null;
  expect(() => Util.arrayEqual(non_array, non_array)).toThrow();
})

test('isDateValid', () => {
  expect(Util.isDateValid('1970-01-01T00:00:00.000Z')).toBeTruthy();
  expect(Util.isDateValid('waffle')).toBeFalsy();
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

test('isTimeAAfterB', () => {
  let early = new Date("2011-09-29 14:58:12");
  let late = new Date("2011-09-29 14:58:13");
  let earlyString = early.toISOString();
  let lateString = late.toISOString();
  
  expect(Util.isTimeAAfterB(early, late)).toBeFalsy();
  expect(Util.isTimeAAfterB(late, early)).toBeTruthy();
  expect(Util.isTimeAAfterB(lateString, earlyString)).toBeTruthy();
  expect(Util.isTimeAAfterB(lateString, early)).toBeTruthy();
  expect(Util.isTimeAAfterB(late, earlyString)).toBeTruthy();
})

test('anyDuplicateInArray', () => {
  expect(Util.anyDuplicateInArray(['a', 'a'])).toBeTruthy();

  expect(Util.anyDuplicateInArray(['a', 'b'])).toBeFalsy();
})

test('isPublic', () => {
  let early = new Date("2011-09-29 14:58:12");
  let late = new Date("3025-09-29 14:58:13");
  
  expect(Util.isPublic(early)).toBeTruthy();
  expect(Util.isPublic(late)).toBeFalsy();
  expect(Util.isPublic(undefined)).toBeFalsy();
  expect(Util.isPublic(null)).toBeFalsy();
})
