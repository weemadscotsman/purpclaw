const cache = new WeakMap();
function test(arr) {
  if (cache.has(arr)) return "cached";
  cache.set(arr, true);
  return "computed";
}
const a = [1, 2, 3];
console.log(test(a));
console.log(test(a));
